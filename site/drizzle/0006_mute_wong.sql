CREATE TABLE `attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`post_id` integer,
	`object_key` text NOT NULL,
	`original_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_public_id_uidx` ON `attachments` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_object_key_uidx` ON `attachments` (`object_key`);--> statement-breakpoint
CREATE INDEX `attachments_post_created_idx` ON `attachments` (`post_id`,`created_at`,`id`);