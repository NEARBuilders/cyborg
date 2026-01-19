/**
 * Database Schema
 *
 * This schema evolved from the every-plugin template:
 * - conversation & message: Added for AI chat feature with streaming
 * - kvStore: Inherited from template with per-user isolation (composite PK)
 *
 * Migration workflow:
 *   1. Edit this file (add/modify tables, indices)
 *   2. Run `bun db:generate` to create migration SQL
 *   3. Run `bun db:push` for dev or `bun db:migrate` for prod
 *
 * Index strategy:
 *   - Optimize for user-scoped queries (conversation by nearAccountId)
 *   - Optimize for relationship queries (messages by conversationId)
 *   - Composite indices for ordered queries (nearAccountId + updatedAt)
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
