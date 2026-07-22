import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { ensureDatabase } from "../../../../db/bootstrap";
import { posts } from "../../../../db/schema";
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
  await ensureDatabase(); const { id } = await params; const payload = await request.json() as Record<string, unknown>;
  const input = parsePostPayload(payload);
  try {
    const current = await getDb().select({ publishedAt: posts.publishedAt }).from(posts).where(eq(posts.id, Number(id))).limit(1);
    if (!current[0]) return Response.json({ error: "文章不存在" }, { status: 404 });
    const publishedAt = input.status === "published"
      ? input.publishedAt ?? current[0].publishedAt ?? new Date().toISOString()
      : current[0].publishedAt;
    const [post] = await getDb().update(posts).set({
      ...input, publishedAt,
      updatedAt: new Date().toISOString(),
    }).where(eq(posts.id, Number(id))).returning();
    return post ? Response.json({ post }) : Response.json({ error: "文章不存在" }, { status: 404 });
  } catch { return Response.json({ error: "保存失败，请检查标题和 Slug" }, { status: 409 }); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(request))) return unauthorized();
  await ensureDatabase(); const { id } = await params;
  await getDb().delete(posts).where(eq(posts.id, Number(id)));
  return Response.json({ ok: true });
}
