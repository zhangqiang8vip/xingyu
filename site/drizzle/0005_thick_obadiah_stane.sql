CREATE TABLE `spaces` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`parent_id` integer,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spaces_parent_slug_uidx` ON `spaces` (`parent_id`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `spaces_root_slug_uidx` ON `spaces` (`slug`) WHERE "spaces"."parent_id" IS NULL;--> statement-breakpoint
CREATE INDEX `spaces_parent_sort_idx` ON `spaces` (`parent_id`,`sort_order`,`id`);--> statement-breakpoint
CREATE INDEX `spaces_updated_idx` ON `spaces` (`updated_at`,`id`);--> statement-breakpoint
ALTER TABLE `posts` ADD `space_id` integer;--> statement-breakpoint
CREATE INDEX `posts_space_updated_idx` ON `posts` (`space_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `posts_space_status_updated_idx` ON `posts` (`space_id`,`status`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `posts_space_published_idx` ON `posts` (`space_id`,`published_at`,`id`);