import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureDatabase } from "@/db/bootstrap";
import { PostWriteError } from "@/db/post-write";
import { posts } from "@/db/schema";
import { getSpacePath } from "@/db/spaces";

export async function getAdminPost(postId: number) {
  await ensureDatabase();
  const rows = await getDb().select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!rows[0]) return null;
  const path = rows[0].spaceId ? await getSpacePath(rows[0].spaceId) : [];
  return { ...rows[0], spacePath: path.map((item) => item.name).join(" / ") };
}

export async function deleteAdminPost(postId: number, expectedVersion: number) {
  if (!Number.isSafeInteger(postId) || postId < 1) throw new PostWriteError("文章不存在", 404);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new PostWriteError("缺少有效的文章版本，请刷新列表后再删除", 409);
  }
  await ensureDatabase();
  const current = await getDb().select({ version: posts.version }).from(posts)
    .where(eq(posts.id, postId)).limit(1);
  if (!current[0]) throw new PostWriteError("文章不存在", 404);
  if (current[0].version !== expectedVersion) {
    throw new PostWriteError("文章已被其他编辑者更新，请刷新列表后再删除", 409);
  }

  // All dependent writes use the same version guard; a concurrent edit before
  // this transaction turns the entire sequence into no-ops.
  const currentPost = "EXISTS (SELECT 1 FROM posts WHERE id = ? AND version = ?)";
  const guarded = (table: string) => env.DB.prepare(
    `DELETE FROM ${table} WHERE post_id = ? AND ${currentPost}`,
  ).bind(postId, postId, expectedVersion);
  const statements = [
    guarded("post_slug_history"),
    guarded("post_views"),
    guarded("post_preview_tokens"),
    env.DB.prepare(`UPDATE attachments SET post_id = NULL
      WHERE post_id = ? AND ${currentPost}`).bind(postId, postId, expectedVersion),
    env.DB.prepare("DELETE FROM posts WHERE id = ? AND version = ?").bind(postId, expectedVersion),
    env.DB.prepare("SELECT changes() AS changed"),
  ];
  const result = await env.DB.batch(statements);
  const deleted = result[5]?.results?.[0] as { changed?: number } | undefined;
  if (Number(deleted?.changed ?? 0) !== 1) {
    throw new PostWriteError("文章已被其他编辑者更新，请刷新列表后再删除", 409);
  }
}
