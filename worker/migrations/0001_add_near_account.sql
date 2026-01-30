-- Migration: Add nearAccount table
-- Required by better-near-auth to link NEAR wallets to users

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
