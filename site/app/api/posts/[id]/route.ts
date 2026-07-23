import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { ensureDatabase } from "../../../../db/bootstrap";
import { PostWriteError, updatePostRecord } from "../../../../db/post-write";
import { postSlugHistory, posts } from "../../../../db/schema";
import { isAdminRequest, unauthorized } from "../../admin-auth";
import { parsePostPayload } from "../post-input";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(request))) return unauthorized();
  await ensureDatabase(); const { id } = await params;
  const rows = await getDb().select().from(posts).where(eq(posts.id, Number(id))).limit(1);
  return rows[0] ? Response.json({ post: rows[0] }) : Response.json({ error: "文章不存在" }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(request))) return unauthorized();
  const { id } = await params; const payload = await request.json() as Record<string, unknown>;
  const input = parsePostPayload(payload);
  try {
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
  await getDb().delete(posts).where(eq(posts.id, Number(id)));
  return Response.json({ ok: true });
}
