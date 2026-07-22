CREATE TABLE `post_slug_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` integer NOT NULL,
	`slug` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `post_slug_history_slug_uidx` ON `post_slug_history` (`slug`);--> statement-breakpoint
CREATE INDEX `post_slug_history_post_idx` ON `post_slug_history` (`post_id`);--> statement-breakpoint
ALTER TABLE `posts` ADD `public_id` text;--> statement-breakpoint
UPDATE `posts` SET `public_id` = 'M' || lower(hex(randomblob(13))) WHERE `public_id` IS NULL OR `public_id` = '';--> statement-breakpoint
CREATE UNIQUE INDEX `posts_public_id_uidx` ON `posts` (`public_id`);
