import { AttachmentError, deleteAttachment } from "../../../../db/attachments";
import { isAdminRequest, unauthorized } from "../../admin-auth";

export async function DELETE(request: Request, context: { params: Promise<{ publicId: string }> }) {
  if (!(await isAdminRequest(request))) return unauthorized();
  try {
    const { publicId } = await context.params;
    if (!/^att_[a-f0-9]{32}$/i.test(publicId)) {
      return Response.json({ error: "附件标识无效" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    await deleteAttachment(publicId.toLowerCase());
    return Response.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AttachmentError) {
      return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    }
    console.error("attachment delete failed", error);
    return Response.json({ error: "附件删除失败，请稍后重试" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
