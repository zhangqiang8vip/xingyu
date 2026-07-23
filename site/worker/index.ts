/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { handleBlogMcpRequest, isBlogMcpPath } from "./blog-mcp";

const PUBLIC_DOCUMENT_TTL_SECONDS = 120;
const edgeCache = (caches as CacheStorage & { default: Cache }).default;

function isPublicDocumentRequest(request: Request, url: URL): boolean {
  if (request.method !== "GET") return false;
  if (!request.headers.get("Accept")?.includes("text/html")) return false;
  if (request.headers.has("Range") || request.headers.has("RSC")) return false;
  if (request.headers.has("Next-Router-State-Tree") || url.searchParams.has("_rsc")) return false;
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/api")) return false;
  if (url.searchParams.has("adminPreview")) return false;
  return true;
}

function addSecurityHeaders(response: Response, url: URL, cacheable: boolean): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  if (url.protocol === "https:") headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/api/admin")) {
    headers.set("Cache-Control", "no-store");
    headers.set("X-Robots-Tag", "noindex, nofollow");
  } else if (cacheable && response.ok) {
    headers.set(
      "Cache-Control",
      `public, max-age=0, s-maxage=${PUBLIC_DOCUMENT_TTL_SECONDS}, stale-while-revalidate=300`,
    );
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const cacheable = isPublicDocumentRequest(request, url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    if (isBlogMcpPath(url.pathname)) {
      return handleBlogMcpRequest(request, env, ctx);
    }

    if (cacheable) {
      const cached = await edgeCache.match(request);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set("X-Xingyu-Cache", "HIT");
        return new Response(cached.body, {
          status: cached.status,
          statusText: cached.statusText,
          headers,
        });
      }
    }

    const response = addSecurityHeaders(await handler.fetch(request, env, ctx), url, cacheable);
    if (cacheable && response.ok) {
      const cachedResponse = response.clone();
      cachedResponse.headers.set("X-Xingyu-Cache", "HIT");
      ctx.waitUntil(edgeCache.put(request, cachedResponse));
      response.headers.set("X-Xingyu-Cache", "MISS");
    }
    return response;
  },
};

export default worker;
