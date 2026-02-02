CREATE TABLE `legion_holders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` text NOT NULL,
	`contract_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`last_synced_at` integer NOT NULL,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `legion_holders_account_id_idx` ON `legion_holders` (`account_id`);--> statement-breakpoint
CREATE INDEX `legion_holders_contract_idx` ON `legion_holders` (`contract_id`);--> statement-breakpoint
CREATE INDEX `legion_holders_last_synced_at_idx` ON `legion_holders` (`last_synced_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_account_contract` ON `legion_holders` (`account_id`,`contract_id`);