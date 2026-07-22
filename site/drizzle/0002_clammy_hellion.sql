CREATE TABLE `content_pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`eyebrow` text DEFAULT '' NOT NULL,
	`title` text NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_pages_slug_uidx` ON `content_pages` (`slug`);--> statement-breakpoint
CREATE TABLE `post_views` (
	`post_id` integer NOT NULL,
	`visitor_hash` text NOT NULL,
	`viewed_on` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`post_id`, `visitor_hash`, `viewed_on`)
);
--> statement-breakpoint
CREATE INDEX `post_views_date_idx` ON `post_views` (`viewed_on`);--> statement-breakpoint
CREATE TABLE `site_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`brand_name` text DEFAULT '星屿' NOT NULL,
	`brand_latin` text DEFAULT 'XINGYU' NOT NULL,
	`author_name` text DEFAULT '星屿' NOT NULL,
	`avatar_url` text DEFAULT '/images/xingyu-avatar.jpg' NOT NULL,
	`tagline` text DEFAULT '设计 · 技术 · 生活' NOT NULL,
	`description` text DEFAULT '记录那些值得慢下来思考的设计、技术与生活片段。' NOT NULL,
	`hero_lead` text DEFAULT '在喧嚣之外，' NOT NULL,
	`hero_tail` text DEFAULT '留一座思考的岛。' NOT NULL,
	`home_section_title` text DEFAULT '最近在写' NOT NULL,
	`home_about_title` text DEFAULT '你好，这里是星屿。' NOT NULL,
	`home_about_copy` text DEFAULT '一座关于设计、技术与生活的数字岛屿。希望每篇文章，都能给你留下一点值得带走的东西。' NOT NULL,
	`footer_text` text DEFAULT '保持好奇，持续创造。' NOT NULL,
	`seo_title` text DEFAULT '星屿 · 思考与创造' NOT NULL,
	`seo_description` text DEFAULT '星屿个人博客，记录设计、技术与生活。' NOT NULL,
	`home_post_limit` integer DEFAULT 9 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
