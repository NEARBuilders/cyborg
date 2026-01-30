-- Migration: Fix nearAccount updatedAt to allow null
-- better-near-auth doesn't always provide updatedAt on insert

-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table
-- First, rename the old table
ALTER TABLE `nearAccount` RENAME TO `nearAccount_old`;

-- Create new table with nullable updatedAt
CREATE TABLE `nearAccount` (
  `id` text PRIMARY KEY NOT NULL,
  `accountId` text NOT NULL,
  `publicKey` text NOT NULL,
  `network` text NOT NULL,
  `isPrimary` integer NOT NULL DEFAULT 0,
  `userId` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `createdAt` integer NOT NULL,
  `updatedAt` integer
);

-- Copy data from old table
INSERT INTO `nearAccount` SELECT * FROM `nearAccount_old`;

-- Drop old table
DROP TABLE `nearAccount_old`;
