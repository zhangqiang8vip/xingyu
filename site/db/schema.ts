import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  color: text("color").notNull().default("#0071e3"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("categories_slug_uidx").on(table.slug)]);

export const spaces = sqliteTable("spaces", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  parentId: integer("parent_id"),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("spaces_parent_slug_uidx").on(table.parentId, table.slug),
  uniqueIndex("spaces_root_slug_uidx").on(table.slug).where(sql`${table.parentId} IS NULL`),
  index("spaces_parent_sort_idx").on(table.parentId, table.sortOrder, table.id),
  index("spaces_updated_idx").on(table.updatedAt, table.id),
]);

export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  publicId: text("public_id").notNull(),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  excerpt: text("excerpt").notNull().default(""),
  content: text("content").notNull().default(""),
  categoryId: integer("category_id").notNull(),
  spaceId: integer("space_id"),
  status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  viewCount: integer("view_count").notNull().default(0),
  publishedAt: text("published_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("posts_public_id_uidx").on(table.publicId),
  uniqueIndex("posts_slug_uidx").on(table.slug),
  index("posts_status_published_idx").on(table.status, table.publishedAt),
  index("posts_archive_cursor_idx").on(table.status, table.publishedAt, table.id),
  index("posts_category_status_idx").on(table.categoryId, table.status),
  index("posts_category_archive_cursor_idx").on(table.categoryId, table.status, table.publishedAt, table.id),
  index("posts_space_updated_idx").on(table.spaceId, table.updatedAt, table.id),
  index("posts_space_status_updated_idx").on(table.spaceId, table.status, table.updatedAt, table.id),
  index("posts_space_published_idx").on(table.spaceId, table.publishedAt, table.id),
  index("posts_updated_idx").on(table.updatedAt),
  index("posts_admin_cursor_idx").on(table.updatedAt, table.id),
]);

export const postSlugHistory = sqliteTable("post_slug_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postId: integer("post_id").notNull(),
  slug: text("slug").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("post_slug_history_slug_uidx").on(table.slug),
  index("post_slug_history_post_idx").on(table.postId),
]);

export const siteSettings = sqliteTable("site_settings", {
  id: integer("id").primaryKey(),
  brandName: text("brand_name").notNull().default("星屿"),
  brandLatin: text("brand_latin").notNull().default("XINGYU"),
  authorName: text("author_name").notNull().default("星屿"),
  avatarUrl: text("avatar_url").notNull().default("/images/xingyu-avatar.jpg"),
  tagline: text("tagline").notNull().default("设计 · 技术 · 生活"),
  description: text("description").notNull().default("记录那些值得慢下来思考的设计、技术与生活片段。"),
  heroLead: text("hero_lead").notNull().default("在喧嚣之外，"),
  heroTail: text("hero_tail").notNull().default("留一座思考的岛。"),
  homeSectionTitle: text("home_section_title").notNull().default("最近在写"),
  homeAboutTitle: text("home_about_title").notNull().default("你好，这里是星屿。"),
  homeAboutCopy: text("home_about_copy").notNull().default("一座关于设计、技术与生活的数字岛屿。希望每篇文章，都能给你留下一点值得带走的东西。"),
  footerText: text("footer_text").notNull().default("保持好奇，持续创造。"),
  seoTitle: text("seo_title").notNull().default("星屿 · 思考与创造"),
  seoDescription: text("seo_description").notNull().default("星屿个人博客，记录设计、技术与生活。"),
  homePostLimit: integer("home_post_limit").notNull().default(9),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const contentPages = sqliteTable("content_pages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull(),
  eyebrow: text("eyebrow").notNull().default(""),
  title: text("title").notNull(),
  excerpt: text("excerpt").notNull().default(""),
  content: text("content").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("content_pages_slug_uidx").on(table.slug)]);

export const postViews = sqliteTable("post_views", {
  postId: integer("post_id").notNull(),
  visitorHash: text("visitor_hash").notNull(),
  viewedOn: text("viewed_on").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.postId, table.visitorHash, table.viewedOn] }),
  index("post_views_date_idx").on(table.viewedOn),
]);

export const mcpActivity = sqliteTable("mcp_activity", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  action: text("action").notNull(),
  postId: integer("post_id").notNull(),
  publicId: text("public_id").notNull(),
  title: text("title").notNull(),
  beforeStatus: text("before_status"),
  afterStatus: text("after_status"),
  changedFields: text("changed_fields").notNull().default("[]"),
  summary: text("summary").notNull().default(""),
  clientLabel: text("client_label").notNull().default("remote-mcp"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("mcp_activity_created_idx").on(table.createdAt, table.id),
  index("mcp_activity_post_idx").on(table.postId, table.id),
]);
