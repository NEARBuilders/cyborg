-- Migration: Add default value for nearAccount.updatedAt
-- SQLite requires recreating the table to add a default

-- Rename the old table
ALTER TABLE `nearAccount` RENAME TO `nearAccount_old`;

-- Create new table with default for updatedAt
CREATE TABLE `nearAccount` (
  `id` text PRIMARY KEY NOT NULL,
  `accountId` text NOT NULL,
  `publicKey` text NOT NULL,
  `network` text NOT NULL,
  `isPrimary` integer NOT NULL DEFAULT 0,
  `userId` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `createdAt` integer NOT NULL,
  `updatedAt` integer DEFAULT (strftime('%s', 'now'))
);

-- Copy data from old table (set updatedAt = createdAt for existing rows with null)
INSERT INTO `nearAccount`
SELECT `id`, `accountId`, `publicKey`, `network`, `isPrimary`, `userId`, `createdAt`,
       COALESCE(`updatedAt`, `createdAt`)
FROM `nearAccount_old`;

-- Drop old table
DROP TABLE `nearAccount_old`;
