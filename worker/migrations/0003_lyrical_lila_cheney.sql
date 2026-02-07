-- Migration: Add legion_follows table for tracking Legion graph relationships
-- This table tracks follow relationships stored in contextual.near contract

CREATE TABLE IF NOT EXISTS `legion_follows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`follower_account_id` text NOT NULL,
	`following_account_id` text NOT NULL,
	`created_at` integer NOT NULL,
	UNIQUE(`follower_account_id`, `following_account_id`)
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `legion_follows_following_idx` ON `legion_follows` (`following_account_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `legion_follows_follower_idx` ON `legion_follows` (`follower_account_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `legion_follows_count_idx` ON `legion_follows` (`following_account_id`,`follower_account_id`);