/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { handleBlogMcpRequest, isBlogMcpPath } from "./blog-mcp";
import { handleOAuthRequest, isOAuthPath } from "./oauth";
import { hasRequestIdentity, isHtmlDocumentRequest, isPublicDocumentRequest, publicDocumentCacheControl, publicDocumentCacheKey, publicDocumentCategory, publicDocumentStorageCacheControl, readPublicContentRevision, responseAllowsPublicStorage } from "./public-document-cache";
import { normalizeImageOutputFormat } from "../domain/media/image-transform";

const edgeCache = (caches as CacheStorage & { default: Cache }).default;

function addSecurityHeaders(response: Response, url: URL, publicDocument: boolean, revision: string | null, identityBearing: boolean, htmlDocument: boolean): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  if (url.protocol === "https:") headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

  if (identityBearing || url.pathname.startsWith("/admin") || url.pathname.startsWith("/api/admin") || url.pathname.startsWith("/preview")) {
    headers.set("Cache-Control", "no-store");
    headers.set("X-Robots-Tag", "noindex, nofollow");
  } else if (htmlDocument) {
    headers.set("Cache-Control",publicDocument&&response.ok?publicDocumentCacheControl(revision):"no-store");
  }
  if(htmlDocument)headers.set("CDN-Cache-Control","no-store");

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
    const requestStartedAt = performance.now();
    const url = new URL(request.url);
    const identityBearing=hasRequestIdentity(request);
    const htmlDocument=isHtmlDocumentRequest(request);
    const cacheable = isPublicDocumentRequest(request, url);
    const revisionStartedAt=performance.now();
    const category=cacheable?publicDocumentCategory(url):undefined;
    const revision=cacheable?await readPublicContentRevision(env.DB,category??undefined):null;
    const revisionDuration=performance.now()-revisionStartedAt;
    const cacheKey=cacheable&&revision!==null?publicDocumentCacheKey(url,revision):null;

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format:normalizeImageOutputFormat(format), quality });
          return result.response();
        },
      }, allowedWidths);
    }

    if (isOAuthPath(url.pathname)) {
      return handleOAuthRequest(request);
    }

    if (isBlogMcpPath(url.pathname)) {
      return handleBlogMcpRequest(request, env, ctx);
    }

    if (cacheKey) {
      const cached = await edgeCache.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set("X-Xingyu-Cache", "HIT");
        headers.set("Cache-Control",publicDocumentCacheControl(revision));
        headers.set("CDN-Cache-Control","no-store");
        headers.set("Server-Timing", `cache-revision;dur=${revisionDuration.toFixed(1)}, edge-cache;dur=${(performance.now() - requestStartedAt).toFixed(1)}`);
        return new Response(cached.body, {
          status: cached.status,
          statusText: cached.statusText,
          headers,
        });
      }
    }

    const appResponse=await handler.fetch(request, env, ctx);
    const publicStorageAllowed=cacheable&&responseAllowsPublicStorage(appResponse);
    const response = addSecurityHeaders(appResponse, url, publicStorageAllowed,revision,identityBearing,htmlDocument);
    response.headers.set("Server-Timing", `${cacheable?`cache-revision;dur=${revisionDuration.toFixed(1)}, `:""}app;dur=${(performance.now() - requestStartedAt).toFixed(1)}`);
    if (cacheKey && publicStorageAllowed) {
      const cachedResponse = response.clone();
      cachedResponse.headers.set("Cache-Control",publicDocumentStorageCacheControl());
      cachedResponse.headers.delete("CDN-Cache-Control");
      cachedResponse.headers.set("X-Xingyu-Cache", "HIT");
      ctx.waitUntil(edgeCache.put(cacheKey, cachedResponse));
      response.headers.set("X-Xingyu-Cache", "MISS");
    }
    return response;
  },
} satisfies ExportedHandler<Env>;

export default worker;
