export type PostPayload = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  categoryId: number;
  status: "draft" | "published";
  featured: boolean;
  publishedAt: string | null;
};

export function parsePostPayload(payload: Record<string, unknown>): PostPayload {
  const title = String(payload.title ?? "").trim();
  return {
    title,
    slug: slugify(String(payload.slug ?? "") || title),
    excerpt: String(payload.excerpt ?? ""),
    content: String(payload.content ?? ""),
    categoryId: Number(payload.categoryId) || 1,
    status: payload.status === "published" ? "published" : "draft",
    featured: Boolean(payload.featured),
    publishedAt: normalizeDate(payload.publishedAt),
  };
}

export function slugify(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]+/gu, "").replace(/-+/g, "-") || `post-${Date.now()}`;
}

export function normalizeDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
