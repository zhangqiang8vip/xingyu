CREATE INDEX `posts_archive_cursor_idx` ON `posts` (`status`,`published_at`,`id`);--> statement-breakpoint
CREATE INDEX `posts_category_archive_cursor_idx` ON `posts` (`category_id`,`status`,`published_at`,`id`);--> statement-breakpoint
CREATE INDEX `posts_admin_cursor_idx` ON `posts` (`updated_at`,`id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `app_meta` (`key` text PRIMARY KEY NOT NULL, `value` text NOT NULL);--> statement-breakpoint
CREATE VIRTUAL TABLE IF NOT EXISTS `posts_fts` USING fts5(`title`, `excerpt`, `content`, content='posts', content_rowid='id', tokenize='trigram');--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `posts_fts_insert` AFTER INSERT ON `posts` BEGIN
  INSERT INTO `posts_fts` (`rowid`, `title`, `excerpt`, `content`) VALUES (new.`id`, new.`title`, new.`excerpt`, new.`content`);
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `posts_fts_delete` AFTER DELETE ON `posts` BEGIN
  INSERT INTO `posts_fts` (`posts_fts`, `rowid`, `title`, `excerpt`, `content`) VALUES ('delete', old.`id`, old.`title`, old.`excerpt`, old.`content`);
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `posts_fts_update` AFTER UPDATE OF `title`, `excerpt`, `content` ON `posts` BEGIN
  INSERT INTO `posts_fts` (`posts_fts`, `rowid`, `title`, `excerpt`, `content`) VALUES ('delete', old.`id`, old.`title`, old.`excerpt`, old.`content`);
  INSERT INTO `posts_fts` (`rowid`, `title`, `excerpt`, `content`) VALUES (new.`id`, new.`title`, new.`excerpt`, new.`content`);
END;--> statement-breakpoint
INSERT INTO `posts_fts` (`posts_fts`) VALUES ('rebuild');--> statement-breakpoint
INSERT OR REPLACE INTO `app_meta` (`key`, `value`) VALUES ('posts_fts_version', '1');
