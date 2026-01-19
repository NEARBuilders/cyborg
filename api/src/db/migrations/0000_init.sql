CREATE TABLE `conversation` (
	`id` text PRIMARY KEY NOT NULL,
	`near_account_id` text NOT NULL,
	`title` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `conversation_near_account_id_idx` ON `conversation` (`near_account_id`);--> statement-breakpoint
CREATE INDEX `conversation_near_account_updated_idx` ON `conversation` (`near_account_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `key_value_store` (
	`key` text NOT NULL,
	`value` text NOT NULL,
	`near_account_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`key`, `near_account_id`)
);
--> statement-breakpoint
CREATE INDEX `kv_store_near_account_id_idx` ON `key_value_store` (`near_account_id`);--> statement-breakpoint
CREATE TABLE `message` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversation`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `message_conversation_id_idx` ON `message` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `message_conversation_created_idx` ON `message` (`conversation_id`,`created_at`);