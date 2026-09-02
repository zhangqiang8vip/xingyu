import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureDatabase } from "@/db/bootstrap";
import { categories, posts } from "@/db/schema";
import { slugify } from "@/domain/posts/post-input";

type CategoryInput = { name?: string; slug?: string; color?: string };

export class CategoryServiceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function categoryValues(payload: CategoryInput) {
  const name = payload.name?.trim();
  if (!name) throw new CategoryServiceError("分类名称不能为空", 400);
  return {
    name,
    slug: slugify(payload.slug || name),
    color: payload.color || "#0071e3",
  };
}

export async function createCategory(payload: CategoryInput) {
  await ensureDatabase();
  try {
    const [category] = await getDb().insert(categories).values(categoryValues(payload)).returning();
    return category;
  } catch (error) {
    if (error instanceof CategoryServiceError) throw error;
    throw new CategoryServiceError("这个分类已经存在", 409);
  }
}

export async function updateCategory(categoryId: number, payload: CategoryInput) {
  await ensureDatabase();
  try {
    const [category] = await getDb().update(categories).set(categoryValues(payload)).where(eq(categories.id, categoryId)).returning();
    if (!category) throw new CategoryServiceError("分类不存在", 404);
    return category;
  } catch (error) {
    if (error instanceof CategoryServiceError) throw error;
    throw new CategoryServiceError("分类名称或 Slug 已存在", 409);
  }
}

export async function deleteCategory(categoryId: number) {
  await ensureDatabase();
  const usage = await getDb().select({ value: sql<number>`count(*)` }).from(posts).where(eq(posts.categoryId, categoryId));
  if (Number(usage[0]?.value ?? 0) > 0) throw new CategoryServiceError("该分类仍有文章，暂时不能删除", 409);
  await getDb().delete(categories).where(eq(categories.id, categoryId));
}
