import { and, asc, desc, eq, gt, isNull, like, lt, or, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { cache } from "react";
import { getDb } from ".";
import { ensureDatabase } from "./bootstrap";
import { categories, contentPages, postSlugHistory, posts, siteSettings } from "./schema";
import { CONTENT_LIMITS, DEFAULT_ABOUT_PAGE, DEFAULT_CONNECT_PAGE, DEFAULT_SITE_SETTINGS } from "@/domain/site/config";
import { adminReaderSqlFilter, type AdminReaderContext } from "@/domain/reader/admin-reader-context";

export type PostFilters = {
  page?: number;
  pageSize?: number;
  query?: string;
  category?: string;
  status?: "draft" | "published" | "all";
};

export async function listPosts(filters: PostFilters = {}) {
  await ensureDatabase();
  const db = getDb();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(CONTENT_LIMITS.apiMaximum, Math.max(1, filters.pageSize ?? CONTENT_LIMITS.searchResults));
  // This generic reader belongs to the public content surface. Private
  // knowledge-space articles must only be reached through authenticated
  // admin/MCP queries, even if a future caller forgets to add the boundary.
  const conditions = [isNull(posts.spaceId)];

  if (filters.status && filters.status !== "all") conditions.push(eq(posts.status, filters.status));
  if (filters.category && filters.category !== "all") conditions.push(eq(categories.slug, filters.category));
  if (filters.query) {
    const needle = `%${filters.query}%`;
    conditions.push(or(like(posts.title, needle), like(posts.excerpt, needle), like(posts.slug, needle))!);
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, totalRows] = await Promise.all([
    db.select({
      id: posts.id, publicId: posts.publicId, title: posts.title, slug: posts.slug, excerpt: posts.excerpt,
      status: posts.status, featured: posts.featured, viewCount: posts.viewCount,
      publishedAt: posts.publishedAt, updatedAt: posts.updatedAt,
      categoryId: posts.categoryId, categoryName: categories.name,
      categorySlug: categories.slug, categoryColor: categories.color,
    }).from(posts).leftJoin(categories, eq(posts.categoryId, categories.id))
      .where(where).orderBy(desc(posts.featured), desc(posts.publishedAt), desc(posts.id))
      .limit(pageSize).offset((page - 1) * pageSize),
    db.select({ value: sql<number>`count(*)` }).from(posts)
      .leftJoin(categories, eq(posts.categoryId, categories.id)).where(where),
  ]);

  const total = Number(totalRows[0]?.value ?? 0);
  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export const getCategories = cache(async function getCategories() {
  await ensureDatabase();
  return getDb().select({ id: categories.id, name: categories.name, slug: categories.slug, color: categories.color })
    .from(categories).orderBy(categories.id);
});

export async function listHomePosts(category = "all", requestedLimit: number = CONTENT_LIMITS.homeDefault) {
  await ensureDatabase();
  const limit = Math.min(CONTENT_LIMITS.homeMaximum, Math.max(1, requestedLimit));
  const conditions = [eq(posts.status, "published"),isNull(posts.spaceId)];
  if (category !== "all") conditions.push(eq(categories.slug, category));
  return getDb().select({
    id: posts.id, publicId: posts.publicId, title: posts.title, slug: posts.slug, excerpt: posts.excerpt,
    contentLength: sql<number>`length(${posts.content})`,
    status: posts.status, featured: posts.featured, viewCount: posts.viewCount,
    publishedAt: posts.publishedAt, updatedAt: posts.updatedAt,
    categoryId: posts.categoryId, categoryName: categories.name,
    categorySlug: categories.slug, categoryColor: categories.color,
  }).from(posts).leftJoin(categories, eq(posts.categoryId, categories.id))
    .where(and(...conditions)).orderBy(desc(posts.featured), desc(posts.publishedAt), desc(posts.id)).limit(limit);
}

export const getSiteSettings = cache(async function getSiteSettings() {
  await ensureDatabase();
  const rows = await getDb().select().from(siteSettings).where(eq(siteSettings.id, 1)).limit(1);
  return rows[0] ?? { ...DEFAULT_SITE_SETTINGS, updatedAt: new Date(0).toISOString() };
});

export async function getContentPage(slug: string) {
  await ensureDatabase();
  const rows = await getDb().select().from(contentPages).where(eq(contentPages.slug, slug)).limit(1);
  const fallback = slug === "about" ? DEFAULT_ABOUT_PAGE : slug === "connect" ? DEFAULT_CONNECT_PAGE : null;
  return rows[0] ?? (fallback ? { id: 0, ...fallback, updatedAt: new Date(0).toISOString() } : null);
}

export async function getAdminStats() {
  await ensureDatabase();
  const rows = await getDb().select({
    total: sql<number>`sum(case when ${posts.spaceId} is null then 1 else 0 end)`,
    published: sql<number>`sum(case when ${posts.spaceId} is null and ${posts.status} = 'published' then 1 else 0 end)`,
    drafts: sql<number>`sum(case when ${posts.spaceId} is null and ${posts.status} = 'draft' then 1 else 0 end)`,
    views: sql<number>`coalesce(sum(case when ${posts.spaceId} is null then ${posts.viewCount} else 0 end), 0)`,
    privateArticles: sql<number>`sum(case when ${posts.spaceId} is not null then 1 else 0 end)`,
  }).from(posts);
  const row = rows[0];
  return {
    total: Number(row?.total ?? 0),
    published: Number(row?.published ?? 0),
    drafts: Number(row?.drafts ?? 0),
    views: Number(row?.views ?? 0),
    privateArticles: Number(row?.privateArticles ?? 0),
  };
}

export async function getPostBySlug(slug: string) {
  await ensureDatabase();
  const rows = await getDb().select({
    id: posts.id, publicId: posts.publicId, title: posts.title, slug: posts.slug, excerpt: posts.excerpt,
    content: posts.content, publishedAt: posts.publishedAt, viewCount: posts.viewCount,
    categoryName: categories.name, categorySlug: categories.slug, categoryColor: categories.color,
  }).from(posts).leftJoin(categories, eq(posts.categoryId, categories.id))
    .where(and(eq(posts.slug, slug), eq(posts.status, "published"),isNull(posts.spaceId))).limit(1);
  return rows[0] ?? null;
}

export async function getPostByPublicId(publicId: string) {
  await ensureDatabase();
  const rows = await getDb().select({
    id: posts.id, publicId: posts.publicId, title: posts.title, slug: posts.slug, excerpt: posts.excerpt,
    content: posts.content, publishedAt: posts.publishedAt, viewCount: posts.viewCount,
    categoryName: categories.name, categorySlug: categories.slug, categoryColor: categories.color,
  }).from(posts).leftJoin(categories, eq(posts.categoryId, categories.id))
    .where(and(eq(posts.publicId, publicId), eq(posts.status, "published"),isNull(posts.spaceId))).limit(1);
  return rows[0] ?? null;
}

/** Resolves current slugs, historical slugs, and bare public IDs for legacy links. */
export async function resolvePublicPost(identifier: string) {
  const direct = await getPostByPublicId(identifier) ?? await getPostBySlug(identifier);
  if (direct) return direct;
  await ensureDatabase();
  const history = await getDb().select({ postId: postSlugHistory.postId })
    .from(postSlugHistory).where(eq(postSlugHistory.slug, identifier)).limit(1);
  if (!history[0]) return null;
  const rows = await getDb().select({
    id: posts.id, publicId: posts.publicId, title: posts.title, slug: posts.slug, excerpt: posts.excerpt,
    content: posts.content, publishedAt: posts.publishedAt, viewCount: posts.viewCount,
    categoryName: categories.name, categorySlug: categories.slug, categoryColor: categories.color,
  }).from(posts).leftJoin(categories, eq(posts.categoryId, categories.id))
    .where(and(eq(posts.id, history[0].postId), eq(posts.status, "published"),isNull(posts.spaceId))).limit(1);
  return rows[0] ?? null;
}

export async function getNextPublishedPost(publishedAt: string | null, id: number) {
  return getAdjacentPublishedPost(publishedAt, id, "older");
}

export async function getPreviousPublishedPost(publishedAt: string | null, id: number) {
  return getAdjacentPublishedPost(publishedAt, id, "newer");
}

export type AdminReaderPost={
  id:number;
  publicId:string;
  title:string;
  slug:string;
  excerpt:string;
  content:string;
  status:"draft"|"published";
  viewCount:number;
  publishedAt:string|null;
  updatedAt:string;
  categoryName:string|null;
  categoryColor:string|null;
  spaceId:number|null;
  spacePath:string|null;
};

const adminReaderSelection=`SELECT
  p.id,p.public_id AS publicId,p.title,p.slug,p.excerpt,p.content,p.status,
  p.view_count AS viewCount,p.published_at AS publishedAt,p.updated_at AS updatedAt,
  c.name AS categoryName,c.color AS categoryColor,p.space_id AS spaceId,
  CASE WHEN p.space_id IS NULL THEN NULL ELSE (
    WITH RECURSIVE ancestors(id,parent_id,name,depth) AS (
      SELECT id,parent_id,name,0 FROM spaces WHERE id=p.space_id
      UNION ALL
      SELECT s.id,s.parent_id,s.name,ancestors.depth+1 FROM spaces s JOIN ancestors ON s.id=ancestors.parent_id
    )
    SELECT group_concat(name,' / ') FROM (SELECT name FROM ancestors ORDER BY depth DESC)
  ) END AS spacePath
  FROM posts p LEFT JOIN categories c ON p.category_id=c.id`;

/** Authenticated reading uses the same shape as public reading without weakening public queries. */
export async function getAdminReaderPost(identifier:string){
  await ensureDatabase();
  return await env.DB.prepare(`${adminReaderSelection} WHERE p.public_id=? OR p.slug=? LIMIT 1`)
    .bind(identifier,identifier).first<AdminReaderPost>();
}

export async function getPreviousAdminPost(updatedAt:string,id:number,readerContext?:AdminReaderContext){
  return getAdjacentAdminPost(updatedAt,id,"newer",readerContext);
}

export async function getNextAdminPost(updatedAt:string,id:number,readerContext?:AdminReaderContext){
  return getAdjacentAdminPost(updatedAt,id,"older",readerContext);
}

async function getAdjacentAdminPost(updatedAt:string,id:number,direction:"older"|"newer",readerContext?:AdminReaderContext){
  await ensureDatabase();
  const older=direction==="older";
  const operator=older?"<":">";
  const order=older?"DESC":"ASC";
  const filter=adminReaderSqlFilter(readerContext);
  return await env.DB.prepare(`${adminReaderSelection}
    WHERE (p.updated_at ${operator} ? OR (p.updated_at=? AND p.id ${operator} ?))${filter.sql}
    ORDER BY p.updated_at ${order},p.id ${order} LIMIT 1`)
    .bind(updatedAt,updatedAt,id,...filter.bindings).first<AdminReaderPost>();
}

const adjacentPostSelection = {
  id: posts.id,
  publicId: posts.publicId,
  title: posts.title,
  slug: posts.slug,
  excerpt: posts.excerpt,
  publishedAt: posts.publishedAt,
  categoryName: categories.name,
  categoryColor: categories.color,
};

/** A single cursor query powers both directions so their ordering rules cannot drift apart. */
async function getAdjacentPublishedPost(publishedAt: string | null, id: number, direction: "older" | "newer") {
  if (!publishedAt) return null;
  await ensureDatabase();
  const older = direction === "older";
  const dateComparison = older ? lt(posts.publishedAt, publishedAt) : gt(posts.publishedAt, publishedAt);
  const idComparison = older ? lt(posts.id, id) : gt(posts.id, id);
  const query = getDb().select(adjacentPostSelection)
    .from(posts)
    .leftJoin(categories, eq(posts.categoryId, categories.id))
    .where(and(
      eq(posts.status, "published"),
      isNull(posts.spaceId),
      or(dateComparison, and(eq(posts.publishedAt, publishedAt), idComparison)),
    ));
  const rows = older
    ? await query.orderBy(desc(posts.publishedAt), desc(posts.id)).limit(1)
    : await query.orderBy(asc(posts.publishedAt), asc(posts.id)).limit(1);
  return rows[0] ?? null;
}

export type CursorPost = {
  id: number;
  publicId: string;
  title: string;
  slug: string;
  excerpt: string;
  status: "draft" | "published";
  featured: boolean;
  viewCount: number;
  publishedAt: string | null;
  updatedAt: string;
  categoryId: number;
  categoryName: string | null;
  categorySlug: string | null;
  categoryColor: string | null;
  spaceId: number | null;
  spacePath: string | null;
};

type RawCursorPost = Omit<CursorPost, "featured"> & { featured: number };

type CursorFilters = {
  cursor?: string;
  limit?: number;
  query?: string;
  category?: string;
  status?: "draft" | "published" | "all";
  space?: "all"|"public"|"private"|number;
};

export async function listArchivePosts(filters: CursorFilters = {}) {
  return listPostsByCursor({ ...filters, status: "published", sort: "published" });
}

export async function listAdminPosts(filters: CursorFilters = {}) {
  return listPostsByCursor({ ...filters, sort: "updated" });
}

async function listPostsByCursor(filters: CursorFilters & { sort: "published" | "updated" }) {
  await ensureDatabase();
  const limit = Math.min(CONTENT_LIMITS.apiMaximum, Math.max(1, filters.limit ?? CONTENT_LIMITS.adminBatch));
  const query = filters.query?.trim() ?? "";
  const useFts = Array.from(query).length >= 3;
  const params: Array<string | number> = [];
  const conditions: string[] = [];
  let from = "FROM posts p LEFT JOIN categories c ON p.category_id = c.id";

  if (useFts) {
    from += " JOIN posts_fts ON posts_fts.rowid = p.id";
    conditions.push("posts_fts MATCH ?");
    params.push(`"${query.replace(/"/g, '""')}"`);
  } else if (query) {
    conditions.push("(p.title LIKE ? OR p.excerpt LIKE ? OR p.slug LIKE ?)");
    const needle = `%${query}%`;
    params.push(needle, needle, needle);
  }
  if (filters.status && filters.status !== "all") {
    conditions.push("p.status = ?");
    params.push(filters.status);
  }
  if (filters.category && filters.category !== "all") {
    conditions.push("c.slug = ?");
    params.push(filters.category);
  }
  if(filters.sort==="published")conditions.push("p.space_id IS NULL");
  if(filters.space==="public")conditions.push("p.space_id IS NULL");
  if(filters.space==="private")conditions.push("p.space_id IS NOT NULL");
  if(typeof filters.space==="number"){
    conditions.push("p.space_id = ?");
    params.push(filters.space);
  }

  const cursor = decodeCursor(filters.cursor);
  const sortColumn = filters.sort === "published" ? "p.published_at" : "p.updated_at";
  if (cursor) {
    conditions.push(`(${sortColumn} < ? OR (${sortColumn} = ? AND p.id < ?))`);
    params.push(cursor.value, cursor.value, cursor.id);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const statement = env.DB.prepare(`SELECT
    p.id, p.public_id AS publicId, p.title, p.slug, p.excerpt, p.status, p.featured, p.view_count AS viewCount,
    p.published_at AS publishedAt, p.updated_at AS updatedAt, p.category_id AS categoryId,
    c.name AS categoryName, c.slug AS categorySlug, c.color AS categoryColor,
    p.space_id AS spaceId,
    CASE WHEN p.space_id IS NULL THEN NULL ELSE (
      WITH RECURSIVE ancestors(id,parent_id,name,depth) AS (
        SELECT id,parent_id,name,0 FROM spaces WHERE id=p.space_id
        UNION ALL
        SELECT s.id,s.parent_id,s.name,ancestors.depth+1 FROM spaces s JOIN ancestors ON s.id=ancestors.parent_id
      )
      SELECT group_concat(name,' / ') FROM (SELECT name FROM ancestors ORDER BY depth DESC)
    ) END AS spacePath
    ${from} ${where}
    ORDER BY ${sortColumn} DESC, p.id DESC
    LIMIT ?`).bind(...params, limit + 1);
  const result = await statement.all<RawCursorPost>();
  const allRows: CursorPost[] = (result.results ?? []).map((row: RawCursorPost) => ({
    ...row,
    featured: Boolean(row.featured),
  }));
  const hasMore = allRows.length > limit;
  const rows = allRows.slice(0, limit);
  const last = rows[rows.length - 1];
  const cursorValue = filters.sort === "published" ? last?.publishedAt : last?.updatedAt;
  return { rows, hasMore, nextCursor: hasMore && last && cursorValue ? encodeCursor(cursorValue, last.id) : null };
}

function encodeCursor(value: string, id: number) {
  return btoa(`${value}|${id}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeCursor(cursor?: string) {
  if (!cursor || cursor.length > 180) return null;
  try {
    const normalized = cursor.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
    const separator = decoded.lastIndexOf("|");
    const value = decoded.slice(0, separator);
    const id = Number(decoded.slice(separator + 1));
    if (separator < 1 || !value || !Number.isInteger(id) || id < 1) return null;
    return { value, id };
  } catch {
    return null;
  }
}
