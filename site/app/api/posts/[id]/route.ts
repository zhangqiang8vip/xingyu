import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { ensureDatabase } from "../../../../db/bootstrap";
import { getWritablePost, PostWriteError, updatePostRecord } from "../../../../db/post-write";
import { postSlugHistory, postViews, posts } from "../../../../db/schema";
import { getSpacePath } from "../../../../db/spaces";
import { isAdminRequest, unauthorized } from "../../admin-auth";
import { parsePostPayload } from "../post-input";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(request))) return unauthorized();
  await ensureDatabase(); const { id } = await params;
  const rows = await getDb().select().from(posts).where(eq(posts.id, Number(id))).limit(1);
  if(!rows[0])return Response.json({ error: "文章不存在" }, { status: 404 });
  const path=rows[0].spaceId?await getSpacePath(rows[0].spaceId):[];
  return Response.json({post:{...rows[0],spacePath:path.map((item)=>item.name).join(" / ")}});
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
  await ensureDatabase(); const { id } = await params;
  await getDb().delete(postSlugHistory).where(eq(postSlugHistory.postId, Number(id)));
  await getDb().delete(postViews).where(eq(postViews.postId, Number(id)));
  await getDb().delete(posts).where(eq(posts.id, Number(id)));
  return Response.json({ ok: true });
}
