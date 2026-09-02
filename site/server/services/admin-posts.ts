import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureDatabase } from "@/db/bootstrap";
import { postPreviewTokens, postSlugHistory, postViews, posts } from "@/db/schema";
import { getSpacePath } from "@/db/spaces";

export async function getAdminPost(postId: number) {
  await ensureDatabase();
  const rows = await getDb().select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!rows[0]) return null;
  const path = rows[0].spaceId ? await getSpacePath(rows[0].spaceId) : [];
  return { ...rows[0], spacePath: path.map((item) => item.name).join(" / ") };
}

export async function deleteAdminPost(postId: number) {
  await ensureDatabase();
  const database = getDb();
  await database.delete(postSlugHistory).where(eq(postSlugHistory.postId, postId));
  await database.delete(postViews).where(eq(postViews.postId, postId));
  await database.delete(postPreviewTokens).where(eq(postPreviewTokens.postId, postId));
  await database.delete(posts).where(eq(posts.id, postId));
}
