/**
 * D1 Database Schema - Legion NFT Holders
 * Tracks which NFT types/tiers each account holds
 */

import { sqliteTable, text, integer, index, unique } from "drizzle-orm/sqlite-core";

// Legion NFT contract types
export const LEGION_CONTRACTS = {
  NEARLEGION: "nearlegion.nfts.tg",
  ASCENDANT: "ascendant.nearlegion.near",
  INITIATE: "initiate.nearlegion.near",
} as const;

export type LegionContract = typeof LEGION_CONTRACTS[keyof typeof LEGION_CONTRACTS];

// Individual holder record per contract (one row per contract per user)
export const legionHolders = sqliteTable(
  "legion_holders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: text("account_id").notNull(),
    contractId: text("contract_id").notNull(), // e.g., "ascendant.nearlegion.near"
    quantity: integer("quantity").notNull().default(1),
    lastSyncedAt: integer("last_synced_at").notNull(),
    syncedAt: integer("synced_at").notNull(),
  },
  (table) => ({
    // One record per account per contract
    uniqueAccountContract: unique("unique_account_contract").on(table.accountId, table.contractId),
    accountIdIdx: index("legion_holders_account_id_idx").on(table.accountId),
    contractIdx: index("legion_holders_contract_idx").on(table.contractId),
    lastSyncedAtIdx: index("legion_holders_last_synced_at_idx").on(table.lastSyncedAt),
  })
);

export type LegionHolder = typeof legionHolders.$inferSelect;

// Keep old table for backward compatibility - will be deprecated
export const ascendantHolders = sqliteTable(
  "ascendant_holders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: text("account_id").notNull().unique(),
    quantity: integer("quantity").notNull().default(1),
    lastSyncedAt: integer("last_synced_at").notNull(),
    syncedAt: integer("synced_at").notNull(),
  },
  (table) => ({
    accountIdIdx: index("ascendant_holders_account_id_idx").on(table.accountId),
    lastSyncedAtIdx: index("ascendant_holders_last_synced_at_idx").on(table.lastSyncedAt),
  })
);

export type AscendantHolder = typeof ascendantHolders.$inferSelect;

// =============================================================================
// NEAR SOCIAL PROFILES
// Cached profiles from social.near contract
// =============================================================================

export const nearSocialProfiles = sqliteTable(
  "near_social_profiles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: text("account_id").notNull().unique(),
    profileData: text("profile_data").notNull(), // JSON string of profile data
    name: text("name"), // Extracted name for faster queries
    image: text("image"), // Extracted image URL for faster queries
    nftAvatarUrl: text("nft_avatar_url"), // NFT avatar URL from Legion NFT
    nftAvatarTokenId: text("nft_avatar_token_id"), // Token ID for NFT avatar
    nftAvatarSyncedAt: integer("nft_avatar_synced_at"), // When NFT avatar was synced
    description: text("description"), // Extracted bio/description
    lastSyncedAt: integer("last_synced_at").notNull(),
    syncedAt: integer("synced_at").notNull(),
  },
  (table) => ({
    accountIdIdx: index("near_social_profiles_account_id_idx").on(table.accountId),
    nameIdx: index("near_social_profiles_name_idx").on(table.name),
    lastSyncedAtIdx: index("near_social_profiles_last_synced_at_idx").on(table.lastSyncedAt),
  })
);

export type NearSocialProfile = typeof nearSocialProfiles.$inferSelect;

// =============================================================================
// LEGION NFT IMAGES
// Stores NFT token metadata including image URLs for displaying NFT grids
// =============================================================================

export const legionNftImages = sqliteTable(
  "legion_nft_images",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tokenId: text("token_id").notNull(),
    accountId: text("account_id").notNull(),
    contractId: text("contract_id").notNull().default('nearlegion.nfts.tg'),
    imageUrl: text("image_url"),
    title: text("title"),
    lastSyncedAt: integer("last_synced_at").notNull(),
    syncedAt: integer("synced_at").notNull(),
  },
  (table) => ({
    uniqueTokenContract: unique("unique_token_contract").on(table.tokenId, table.contractId),
    accountIdIdx: index("legion_nft_images_account_id_idx").on(table.accountId),
  })
);

export type LegionNftImage = typeof legionNftImages.$inferSelect;

// =============================================================================
// LEGION GRAPH FOLLOWS
// Tracks follow relationships in the Legion graph (contextual.near)
// =============================================================================

export const legionFollows = sqliteTable(
  "legion_follows",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    followerAccountId: text("follower_account_id").notNull(), // Who is following
    followingAccountId: text("following_account_id").notNull(), // Who is being followed
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    // Ensure unique follow relationships
    uniqueFollow: unique("unique_follow").on(table.followerAccountId, table.followingAccountId),
    // Index for getting someone's followers (who follows them)
    followerIdx: index("legion_follows_following_idx").on(table.followingAccountId),
    // Index for getting who someone follows (their following list)
    followingIdx: index("legion_follows_follower_idx").on(table.followerAccountId),
    // Compound index for counting
    followsCountIdx: index("legion_follows_count_idx").on(table.followingAccountId, table.followerAccountId),
  })
);

export type LegionFollow = typeof legionFollows.$inferSelect;
