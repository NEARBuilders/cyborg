import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { siwn } from "better-near-auth";
import Database from "better-sqlite3";

const db = new Database(process.env.HOST_DATABASE_URL?.replace("file:", "") || "./database.db");

export const auth = betterAuth({
  database: db,
  basePath: "/api/auth", // Default Better Auth path
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET || "dev-secret-change-in-production",
  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:3002",
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
