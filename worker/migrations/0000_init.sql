-- Migration: Initial schema for NEAR Agent
-- Creates all tables needed for the application

-- =============================================================================
-- CORE SCHEMA - Conversations and Messages
-- =============================================================================

CREATE TABLE IF NOT EXISTS `conversation` (
  `id` text PRIMARY KEY NOT NULL,
  `near_account_id` text NOT NULL,
  `title` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE INDEX IF NOT EXISTS `conversation_near_account_id_idx` ON `conversation` (`near_account_id`);
CREATE INDEX IF NOT EXISTS `conversation_near_account_updated_idx` ON `conversation` (`near_account_id`, `updated_at`);

CREATE TABLE IF NOT EXISTS `message` (
  `id` text PRIMARY KEY NOT NULL,
  `conversation_id` text NOT NULL REFERENCES `conversation`(`id`) ON DELETE CASCADE,
  `role` text NOT NULL,
  `content` text NOT NULL,
  `created_at` integer NOT NULL
);

CREATE INDEX IF NOT EXISTS `message_conversation_id_idx` ON `message` (`conversation_id`);
CREATE INDEX IF NOT EXISTS `message_conversation_created_idx` ON `message` (`conversation_id`, `created_at`);

-- =============================================================================
-- KEY VALUE STORE
-- =============================================================================

CREATE TABLE IF NOT EXISTS `key_value_store` (
  `key` text NOT NULL,
  `value` text NOT NULL,
  `near_account_id` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  PRIMARY KEY (`key`, `near_account_id`)
);

CREATE INDEX IF NOT EXISTS `kv_store_near_account_id_idx` ON `key_value_store` (`near_account_id`);

-- =============================================================================
-- BETTER-AUTH TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS `user` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `email` text NOT NULL UNIQUE,
  `emailVerified` integer NOT NULL,
  `image` text,
  `createdAt` integer NOT NULL,
  `updatedAt` integer NOT NULL,
  `role` text
);

CREATE TABLE IF NOT EXISTS `session` (
  `id` text PRIMARY KEY NOT NULL,
  `expiresAt` integer NOT NULL,
  `token` text NOT NULL UNIQUE,
  `createdAt` integer NOT NULL,
  `updatedAt` integer NOT NULL,
  `ipAddress` text,
  `userAgent` text,
  `userId` text NOT NULL REFERENCES `user`(`id`)
);

CREATE TABLE IF NOT EXISTS `account` (
  `id` text PRIMARY KEY NOT NULL,
  `accountId` text NOT NULL,
  `providerId` text NOT NULL,
  `userId` text NOT NULL REFERENCES `user`(`id`),
  `accessToken` text,
  `refreshToken` text,
  `idToken` text,
  `accessTokenExpiresAt` integer,
  `refreshTokenExpiresAt` integer,
  `scope` text,
  `password` text,
  `createdAt` integer NOT NULL,
  `updatedAt` integer NOT NULL
);

CREATE TABLE IF NOT EXISTS `verification` (
  `id` text PRIMARY KEY NOT NULL,
  `identifier` text NOT NULL,
  `value` text NOT NULL,
  `expiresAt` integer NOT NULL,
  `createdAt` integer,
  `updatedAt` integer
);

-- NEAR Account - links NEAR wallets to Better-Auth users (required by better-near-auth)
CREATE TABLE IF NOT EXISTS `nearAccount` (
  `id` text PRIMARY KEY NOT NULL,
  `accountId` text NOT NULL,
  `publicKey` text NOT NULL,
  `network` text NOT NULL,
  `isPrimary` integer NOT NULL DEFAULT 0,
  `userId` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `createdAt` integer NOT NULL,
  `updatedAt` integer NOT NULL
);
