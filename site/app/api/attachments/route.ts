import { createAttachment, AttachmentError, attachmentMarkdown, attachmentUrl, listPostAttachments } from "../../../db/attachments";
import { isAdminRequest, unauthorized } from "../admin-auth";

export async function GET(request: Request) {
  if (!(await isAdminRequest(request))) return unauthorized();
  const postIdValue = new URL(request.url).searchParams.get("postId");
  if (!postIdValue || !/^\d+$/.test(postIdValue)) {
    return Response.json({ error: "请选择要管理附件的文章" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const records = await listPostAttachments(Number(postIdValue));
  return Response.json({ attachments: records.map(attachmentPayload) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await isAdminRequest(request))) return unauthorized();
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "请选择附件" }, { status: 400 });
    const postIdValue = form.get("postId");
    const postId = typeof postIdValue === "string" && /^\d+$/.test(postIdValue) ? Number(postIdValue) : null;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const record = await createAttachment({
      name: file.name,
      contentType: file.type || fallbackContentType(file.name),
      bytes,
      postId,
    });
    const attachment = attachmentPayload(record);
    // Keep the original top-level fields for existing editor/MCP consumers while
    // exposing a named payload for the attachment manager.
    return Response.json({ ...attachment, attachment }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AttachmentError) {
      return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    }
    console.error("attachment upload failed", error);
    return Response.json({ error: "附件存储服务暂时不可用，请稍后重试" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

function attachmentPayload(record: { publicId: string; originalName: string; contentType: string; size: number; createdAt: string }) {
  return {
    id: record.publicId,
    name: record.originalName,
    contentType: record.contentType,
    size: record.size,
    createdAt: record.createdAt,
    url: attachmentUrl(record),
    markdown: attachmentMarkdown(record),
  };
}

function fallbackContentType(name: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  return ({
    md: "text/markdown",
    markdown: "text/markdown",
    txt: "text/plain",
    log: "text/plain",
    csv: "text/csv",
    json: "application/json",
    zip: "application/zip",
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  } as Record<string, string>)[extension || ""] || "application/octet-stream";
}
