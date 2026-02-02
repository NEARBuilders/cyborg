-- Migration: Add ascendant_holders table for caching NFT holders
CREATE TABLE `ascendant_holders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`last_synced_at` integer NOT NULL,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ascendant_holders_account_id_unique` ON `ascendant_holders` (`account_id`);--> statement-breakpoint
CREATE INDEX `ascendant_holders_account_id_idx` ON `ascendant_holders` (`account_id`);--> statement-breakpoint
CREATE INDEX `ascendant_holders_last_synced_at_idx` ON `ascendant_holders` (`last_synced_at`);
