CREATE TABLE `payment_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`near_account_id` text NOT NULL,
	`nonce` integer NOT NULL,
	`secret` text NOT NULL,
	`initial_balance` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_keys_nonce_unique` ON `payment_keys` (`nonce`);--> statement-breakpoint
CREATE INDEX `payment_keys_account_id_idx` ON `payment_keys` (`near_account_id`);--> statement-breakpoint
CREATE INDEX `payment_keys_active_idx` ON `payment_keys` (`near_account_id`,`is_active`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_keys_account_active_unique` ON `payment_keys` (`near_account_id`,`is_active`);