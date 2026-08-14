CREATE TABLE `oauth_access_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_hash` text NOT NULL,
	`client_id` text NOT NULL,
	`subject` text NOT NULL,
	`resource` text NOT NULL,
	`scope` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`last_used_at` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_access_tokens_hash_uidx` ON `oauth_access_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `oauth_access_tokens_client_idx` ON `oauth_access_tokens` (`client_id`,`subject`,`expires_at`);--> statement-breakpoint
CREATE TABLE `oauth_authorization_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code_hash` text NOT NULL,
	`client_id` text NOT NULL,
	`subject` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`resource` text NOT NULL,
	`scope` text NOT NULL,
	`code_challenge` text NOT NULL,
	`code_challenge_method` text DEFAULT 'S256' NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_authorization_codes_hash_uidx` ON `oauth_authorization_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX `oauth_authorization_codes_expiry_idx` ON `oauth_authorization_codes` (`expires_at`);--> statement-breakpoint
CREATE TABLE `oauth_clients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` text NOT NULL,
	`client_name` text NOT NULL,
	`client_type` text DEFAULT 'public' NOT NULL,
	`client_secret_hash` text,
	`redirect_uris` text DEFAULT '[]' NOT NULL,
	`allowed_scopes` text NOT NULL,
	`token_endpoint_auth_method` text DEFAULT 'none' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_clients_client_id_uidx` ON `oauth_clients` (`client_id`);--> statement-breakpoint
CREATE TABLE `oauth_consents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subject` text NOT NULL,
	`client_id` text NOT NULL,
	`resource` text NOT NULL,
	`granted_scopes` text NOT NULL,
	`granted_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_consents_subject_client_resource_uidx` ON `oauth_consents` (`subject`,`client_id`,`resource`);--> statement-breakpoint
CREATE TABLE `oauth_rate_limits` (
	`identifier` text PRIMARY KEY NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`window_started` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_refresh_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_hash` text NOT NULL,
	`family_id` text NOT NULL,
	`parent_token_id` integer,
	`client_id` text NOT NULL,
	`subject` text NOT NULL,
	`resource` text NOT NULL,
	`scope` text NOT NULL,
	`expires_at` integer NOT NULL,
	`absolute_expires_at` integer NOT NULL,
	`used_at` integer,
	`revoked_at` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_refresh_tokens_hash_uidx` ON `oauth_refresh_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `oauth_refresh_tokens_family_idx` ON `oauth_refresh_tokens` (`family_id`);--> statement-breakpoint
CREATE INDEX `oauth_refresh_tokens_client_idx` ON `oauth_refresh_tokens` (`client_id`,`subject`);