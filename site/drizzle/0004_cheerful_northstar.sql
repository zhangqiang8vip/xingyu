CREATE TABLE `mcp_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`action` text NOT NULL,
	`post_id` integer NOT NULL,
	`public_id` text NOT NULL,
	`title` text NOT NULL,
	`before_status` text,
	`after_status` text,
	`changed_fields` text DEFAULT '[]' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`client_label` text DEFAULT 'remote-mcp' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mcp_activity_created_idx` ON `mcp_activity` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `mcp_activity_post_idx` ON `mcp_activity` (`post_id`,`id`);