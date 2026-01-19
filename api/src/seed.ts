/**
 * Database Seed Script
 *
 * Populates the database with sample data for development.
 * Run with: bun db:seed (from api/ directory)
 */

import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./db/schema";

const DATABASE_URL = process.env.API_DATABASE_URL || "file:./api.db";
const DATABASE_AUTH_TOKEN = process.env.API_DATABASE_AUTH_TOKEN;

async function seed() {
  console.log("🌱 Seeding database...");

  const client = createClient({
    url: DATABASE_URL,
    authToken: DATABASE_AUTH_TOKEN,
  });

  const db = drizzle(client, { schema });

  // Sample data for key-value store
  const sampleData = [
    {
      key: "welcome",
      value: "Welcome to the Module Federation monorepo!",
      nearAccountId: "demo.near",
    },
    {
      key: "example",
      value: JSON.stringify({ hello: "world", timestamp: new Date().toISOString() }),
      nearAccountId: "demo.near",
    },
    {
      key: "config",
      value: JSON.stringify({ theme: "dark", language: "en" }),
      nearAccountId: "demo.near",
    },
  ];

  const now = new Date();

  for (const item of sampleData) {
    await db
      .insert(schema.kvStore)
      .values({
        ...item,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [schema.kvStore.key, schema.kvStore.nearAccountId],
        set: {
          value: item.value,
          updatedAt: now,
        },
      });

    console.log(`  ✓ Created/updated key: ${item.key}`);
  }

  console.log("✨ Seeding complete!");
  process.exit(0);
}

seed().catch((error) => {
  console.error("❌ Seeding failed:", error);
  process.exit(1);
});
