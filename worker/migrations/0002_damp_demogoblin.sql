CREATE TABLE `near_social_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` text NOT NULL,
	`profile_data` text NOT NULL,
	`name` text,
	`image` text,
	`description` text,
	`last_synced_at` integer NOT NULL,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `near_social_profiles_account_id_unique` ON `near_social_profiles` (`account_id`);--> statement-breakpoint
CREATE INDEX `near_social_profiles_account_id_idx` ON `near_social_profiles` (`account_id`);--> statement-breakpoint
CREATE INDEX `near_social_profiles_name_idx` ON `near_social_profiles` (`name`);--> statement-breakpoint
CREATE INDEX `near_social_profiles_last_synced_at_idx` ON `near_social_profiles` (`last_synced_at`);