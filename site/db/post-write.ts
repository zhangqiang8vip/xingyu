import { eq, or } from "drizzle-orm";
import { getDb } from ".";
import { ensureDatabase } from "./bootstrap";
import { createPostPublicId } from "./public-id";
import { postSlugHistory, posts } from "./schema";
import type { PostPayload } from "../app/api/posts/post-input";

const MAX_TITLE_LENGTH = 200;
const MAX_SLUG_LENGTH = 180;
const MAX_EXCERPT_LENGTH = 1_000;
const MAX_CONTENT_LENGTH = 750_000;

export class PostWriteError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = "PostWriteError";
  }
}

export function validatePostInput(input: PostPayload) {
  if (!input.title) throw new PostWriteError("文章标题不能为空");
  if (input.title.length > MAX_TITLE_LENGTH) throw new PostWriteError(`文章标题不能超过 ${MAX_TITLE_LENGTH} 个字符`);
  if (!input.slug) throw new PostWriteError("文章 Slug 不能为空");
  if (input.slug.length > MAX_SLUG_LENGTH) throw new PostWriteError(`文章 Slug 不能超过 ${MAX_SLUG_LENGTH} 个字符`);
  if (input.excerpt.length > MAX_EXCERPT_LENGTH) throw new PostWriteError(`文章摘要不能超过 ${MAX_EXCERPT_LENGTH} 个字符`);
  if (input.content.length > MAX_CONTENT_LENGTH) throw new PostWriteError(`Markdown 正文不能超过 ${MAX_CONTENT_LENGTH} 个字符`);
  if (!Number.isInteger(input.categoryId) || input.categoryId < 1) throw new PostWriteError("文章分类无效");
}

export async function createPostRecord(input: PostPayload) {
  validatePostInput(input);
  await ensureDatabase();

  const historical = await getDb()
    .select({ postId: postSlugHistory.postId })
    .from(postSlugHistory)
    .where(eq(postSlugHistory.slug, input.slug))
    .limit(1);
  if (historical[0]) throw new PostWriteError("该 Slug 曾被使用，请换一个地址", 409);

  try {
    const [post] = await getDb().insert(posts).values({
      ...input,
      publicId: createPostPublicId(),
      publishedAt: input.status === "published"
        ? input.publishedAt ?? new Date().toISOString()
        : null,
    }).returning();
    if (!post) throw new PostWriteError("文章创建失败", 409);
    return post;
  } catch (error) {
    if (error instanceof PostWriteError) throw error;
    throw new PostWriteError("Slug 已存在，请换一个地址", 409);
  }
}

export async function getWritablePost(identifier: string | number) {
  await ensureDatabase();
  const numericId = typeof identifier === "number"
    ? identifier
    : /^\d+$/.test(identifier) ? Number(identifier) : null;
  const condition = numericId
    ? eq(posts.id, numericId)
    : or(eq(posts.publicId, String(identifier)), eq(posts.slug, String(identifier)));
  const rows = await getDb().select().from(posts).where(condition).limit(1);
  return rows[0] ?? null;
}

export async function updatePostRecord(id: number, input: PostPayload) {
  validatePostInput(input);
  await ensureDatabase();

  const current = await getDb()
    .select({ publishedAt: posts.publishedAt, slug: posts.slug })
    .from(posts)
    .where(eq(posts.id, id))
    .limit(1);
  if (!current[0]) throw new PostWriteError("文章不存在", 404);

  try {
    if (input.slug !== current[0].slug) {
      const historical = await getDb()
        .select({ postId: postSlugHistory.postId })
        .from(postSlugHistory)
        .where(eq(postSlugHistory.slug, input.slug))
        .limit(1);
      if (historical[0] && historical[0].postId !== id) {
        throw new PostWriteError("该 Slug 属于另一篇文章的历史地址", 409);
      }
      await getDb().insert(postSlugHistory)
        .values({ postId: id, slug: current[0].slug })
        .onConflictDoNothing();
    }

    const publishedAt = input.status === "published"
      ? input.publishedAt ?? current[0].publishedAt ?? new Date().toISOString()
      : current[0].publishedAt;
    const [post] = await getDb().update(posts).set({
      ...input,
      publishedAt,
      updatedAt: new Date().toISOString(),
    }).where(eq(posts.id, id)).returning();
    if (!post) throw new PostWriteError("文章不存在", 404);
    return post;
  } catch (error) {
    if (error instanceof PostWriteError) throw error;
    throw new PostWriteError("保存失败，请检查标题和 Slug", 409);
  }
}
