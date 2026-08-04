CREATE TABLE `post_preview_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`revoked_at` text,
	`last_viewed_at` text,
	`view_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `post_preview_tokens_hash_uidx` ON `post_preview_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `post_preview_tokens_post_idx` ON `post_preview_tokens` (`post_id`,`expires_at`,`id`);--> statement-breakpoint
CREATE INDEX `post_preview_tokens_expiry_idx` ON `post_preview_tokens` (`expires_at`);