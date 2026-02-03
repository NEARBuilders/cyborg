-- Migration: Add legion_nft_images table for storing NFT token image URLs
-- This table caches NFT metadata including image URLs for nearlegion.nfts.tg tokens

CREATE TABLE IF NOT EXISTS `legion_nft_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_id` text NOT NULL,
	`account_id` text NOT NULL,
	`contract_id` text NOT NULL DEFAULT 'nearlegion.nfts.tg',
	`image_url` text,
	`title` text,
	`last_synced_at` integer NOT NULL,
	`synced_at` integer NOT NULL,
	UNIQUE(`token_id`, `contract_id`)
);

--> statement-breakpoint
CREATE INDEX `legion_nft_images_account_id_idx` ON `legion_nft_images` (`account_id`);