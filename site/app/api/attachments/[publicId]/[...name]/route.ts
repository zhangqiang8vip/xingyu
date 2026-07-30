import { env } from "cloudflare:workers";
import { getAttachment } from "../../../../../db/attachments";
import { isAdminRequest, unauthorized } from "../../../admin-auth";

export async function GET(request: Request, { params }: { params: Promise<{ publicId: string; name: string[] }> }) {
  const { publicId } = await params;
  const attachment = await getAttachment(publicId);
  if (!attachment) return new Response("Not found", { status: 404 });

  const isPublic = attachment.postStatus === "published" && attachment.postSpaceId === null;
  if (!isPublic && !(await isAdminRequest(request))) return unauthorized();

  const object = await env.MEDIA.get(attachment.objectKey);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", attachment.contentType);
  headers.set("Content-Length", String(attachment.size));
  headers.set("ETag", object.httpEtag);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Disposition", `${canPreview(attachment.contentType) ? "inline" : "attachment"}; filename*=UTF-8''${encodeRfc5987(attachment.originalName)}`);
  // Visibility can change when an article is withdrawn or moved into a private
  // space, so never give attachment bytes an immutable cache lifetime.
  headers.set("Cache-Control", isPublic ? "public, max-age=0, s-maxage=60" : "private, no-store");
  return new Response(object.body, { headers });
}

function encodeRfc5987(value: string) {
  return encodeURIComponent(value).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canPreview(contentType: string) {
  return contentType.startsWith("image/")
    || contentType === "application/pdf"
    || contentType.startsWith("text/")
    || contentType === "application/json";
}
