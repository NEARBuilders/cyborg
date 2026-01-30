/**
 * Database Schema for Cloudflare D1
 *
 * This schema is copied from api/src/db/schema.ts with no modifications needed.
 * D1 uses SQLite dialect which is compatible with the existing schema.
 *
 * Tables:
 * - conversation: Chat conversation containers
 * - message: Individual chat messages
 * - kvStore: Per-user key-value storage
 * - user/session/account/verification: Better-Auth tables
 */

import { integer, sqliteTable, text, primaryKey, index } from "drizzle-orm/sqlite-core";

// =============================================================================
// CORE SCHEMA - Conversations and Messages
// =============================================================================

// Conversations - container for sessions
export const conversation = sqliteTable("conversation", {
  id: text("id").primaryKey(),
  nearAccountId: text("near_account_id").notNull(),
  title: text("title"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => ({
  // Index for listing user's conversations ordered by last update
  nearAccountIdIdx: index("conversation_near_account_id_idx").on(table.nearAccountId),
  nearAccountUpdatedIdx: index("conversation_near_account_updated_idx").on(table.nearAccountId, table.updatedAt),
}));

// Messages - individual chat messages
export const message = sqliteTable("message", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversation.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => ({
  // Index for fetching messages in a conversation ordered by time
  conversationIdIdx: index("message_conversation_id_idx").on(table.conversationId),
  conversationCreatedIdx: index("message_conversation_created_idx").on(table.conversationId, table.createdAt),
}));

// =============================================================================
// KEY VALUE STORE
// Per-user persistent storage (template feature)
// =============================================================================

export const kvStore = sqliteTable("key_value_store", {
  key: text("key").notNull(),
  value: text("value").notNull(),
  nearAccountId: text("near_account_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.key, table.nearAccountId] }),
  nearAccountIdIdx: index("kv_store_near_account_id_idx").on(table.nearAccountId),
}));

// =============================================================================
// BETTER-AUTH TABLES
// These tables are automatically created by Better-Auth but we define them
// here for Drizzle schema completeness and type safety
// =============================================================================

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull(),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  role: text("role"),
  banned: integer("banned", { mode: "boolean" }),
  banReason: text("banReason"),
  banExpires: integer("banExpires", { mode: "timestamp" }),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }),
  updatedAt: integer("updatedAt", { mode: "timestamp" }),
});

// NEAR Account - links NEAR wallets to Better-Auth users (required by better-near-auth)
export const nearAccount = sqliteTable("nearAccount", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  publicKey: text("publicKey").notNull(),
  network: text("network").notNull(),
  isPrimary: integer("isPrimary", { mode: "boolean" }).notNull().default(false),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }),
});
