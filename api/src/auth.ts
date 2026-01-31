import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { siwn } from "better-near-auth";
import Database from "bun:sqlite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.API_DATABASE_URL?.replace("file:", "") || path.join(__dirname, "../api.db");

// Initialize database with Better Auth tables using Drizzle schema
// The tables should be created by running: bun db:push
const db = new Database(dbPath);
db.exec("PRAGMA foreign_keys = ON");

// Pass the Database instance directly to Better Auth (as per docs)
export const auth = betterAuth({
  database: db,
  basePath: "/api/auth",
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3013",
  secret: process.env.BETTER_AUTH_SECRET || "dev-secret-change-in-production-please-use-32-chars",
  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:3014",
  ],
  plugins: [
    siwn({
      domain: process.env.NEAR_ACCOUNT || "example.near",
      networkId: "mainnet",
    }),
    admin(),
  ],
});

export type Auth = typeof auth;
