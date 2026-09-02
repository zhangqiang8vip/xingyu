import { getWritablePost, PostWriteError, updatePostRecord } from "../../../../db/post-write";
import { isAdminRequest, unauthorized } from "../../admin-auth";
import { parsePostPayload } from "@/domain/posts/post-input";
import { deleteAdminPost, getAdminPost } from "@/server/services/admin-posts";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(request))) return unauthorized();
  const { id } = await params;
  const post = await getAdminPost(Number(id));
  return post ? Response.json({ post }) : Response.json({ error: "文章不存在" }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(request))) return unauthorized();
  const { id } = await params; const payload = await request.json() as Record<string, unknown>;
  try {
    // Space membership is a privacy boundary. A partial/older admin client that
    // omits spaceId must never move a private article into the public blog.
    const current=await getWritablePost(Number(id));
    if(!current)throw new PostWriteError("文章不存在",404);
    const input = parsePostPayload({
      ...payload,
      spaceId:Object.prototype.hasOwnProperty.call(payload,"spaceId")?payload.spaceId:current.spaceId,
    });
    const post = await updatePostRecord(Number(id), input);
    return Response.json({ post });
  } catch (error) {
    if (error instanceof PostWriteError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "文章保存失败" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(request))) return unauthorized();
  const { id } = await params;
  await deleteAdminPost(Number(id));
  return Response.json({ ok: true });
}
