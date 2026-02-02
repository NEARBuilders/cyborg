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
