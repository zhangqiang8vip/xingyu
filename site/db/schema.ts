import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  color: text("color").notNull().default("#0071e3"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("categories_slug_uidx").on(table.slug)]);

export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  excerpt: text("excerpt").notNull().default(""),
  content: text("content").notNull().default(""),
  categoryId: integer("category_id").notNull(),
  status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  viewCount: integer("view_count").notNull().default(0),
  publishedAt: text("published_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("posts_slug_uidx").on(table.slug),
  index("posts_status_published_idx").on(table.status, table.publishedAt),
  index("posts_archive_cursor_idx").on(table.status, table.publishedAt, table.id),
  index("posts_category_status_idx").on(table.categoryId, table.status),
  index("posts_category_archive_cursor_idx").on(table.categoryId, table.status, table.publishedAt, table.id),
  index("posts_updated_idx").on(table.updatedAt),
  index("posts_admin_cursor_idx").on(table.updatedAt, table.id),
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
