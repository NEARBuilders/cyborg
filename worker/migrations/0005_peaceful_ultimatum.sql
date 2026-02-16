DROP INDEX `payment_keys_account_active_unique`;--> statement-breakpoint
CREATE INDEX `payment_keys_account_created_idx` ON `payment_keys` (`near_account_id`,`created_at`);