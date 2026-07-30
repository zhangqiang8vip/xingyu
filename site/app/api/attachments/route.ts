import { createAttachment, AttachmentError, attachmentMarkdown, attachmentUrl } from "../../../db/attachments";
import { isAdminRequest, unauthorized } from "../admin-auth";

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
    return Response.json({
      id: record.publicId,
      name: record.originalName,
      contentType: record.contentType,
      size: record.size,
      url: attachmentUrl(record),
      markdown: attachmentMarkdown(record),
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AttachmentError) {
      return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    }
    console.error("attachment upload failed", error);
    return Response.json({ error: "附件上传失败" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
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
