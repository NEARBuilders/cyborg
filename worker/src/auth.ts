/**
 * Authentication for Cloudflare Workers
 *
 * Uses Better-Auth with D1 database adapter.
 * Unlike the Node.js version, auth instance is created per-request
 * because Workers don't have persistent process state.
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { siwn } from "better-near-auth";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "./types";
import * as schema from "./db/schema";

/**
 * Extract NEAR account ID from email with network suffix
 * Handles: .near, .testnet, .tg addresses, and subaccounts
 * Examples:
 * - "jemartel@near.email" -> "jemartel.near:mainnet" (stripped .near)
 * - "sub.account@near.email" -> "sub.account.near:mainnet" (subaccount, stripped)
 * - "username.tg@near.email" -> "username.tg:mainnet" (TG, NOT stripped)
 * - "account.testnet@near.email" -> "account.testnet:testnet" (testnet, NOT stripped)
 */
function extractNearAccountId(email: string): string {
  // Extract username from email (format: username@near.email)
  const match = email.match(/^([^@]+)@near\.email$/);
  if (match) {
    const username = match[1];

    // Check if username already has a network suffix (not stripped by transformEmail)
    if (username.endsWith('.testnet')) {
      return `${username}:testnet`; // account.testnet:testnet
    }
    if (username.endsWith('.near')) {
      return `${username}:mainnet`; // account.near:mainnet
    }
    if (username.endsWith('.tg')) {
      return `${username}:mainnet`; // username.tg:mainnet
    }

    // If username has dots but no recognized suffix, it's a subaccount (e.g., "sub.account")
    // The .near or .testnet was stripped, so we add it back
    if (username.includes('.')) {
      // Assume mainnet for stripped subaccounts
      return `${username}.near:mainnet`; // sub.account.near:mainnet
    }

    // Simple account without dots - add .near for mainnet
    return `${username}.near:mainnet`; // jemartel.near:mainnet
  }
  return "";
}

/**
 * Transform email to strip .near/.testnet suffix from NEAR account IDs
 * e.g., "jemartel.near@near.email" -> "jemartel@near.email"
 */
function transformEmail(email: string): string {
  return email.replace(/\.(near|testnet)@/, "@");
}

/**
 * Wrap the drizzle adapter factory to:
 * 1. Transform emails before insert
 * 2. Store NEAR account ID in the name field
 */
function wrapAdapterFactory(adapterFactory: ReturnType<typeof drizzleAdapter>) {
  return (options: Parameters<typeof adapterFactory>[0]) => {
    const adapter = adapterFactory(options);
    const originalCreate = adapter.create.bind(adapter);
    adapter.create = async <T extends Record<string, unknown>, R = T>(data: {
      model: string;
      data: Omit<T, "id">;
      select?: string[];
      forceAllowId?: boolean;
    }): Promise<R> => {
      if (data.model === "user") {
        const userData = data.data as Record<string, unknown>;
        if (typeof userData.email === "string") {
          // Store the NEAR account ID in the name field
          if (!userData.name) {
            userData.name = extractNearAccountId(userData.email);
          }
          // Transform the email for storage
          userData.email = transformEmail(userData.email);
        }
      }
      return originalCreate(data);
    };
    return adapter;
  };
}

/**
 * Create a Better-Auth instance for the current request
 * @param env - Worker environment bindings
 */
export function createAuth(env: Env) {
  const db = drizzle(env.DB, { schema });

  return betterAuth({
    database: wrapAdapterFactory(drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    })),
    baseURL: env.BETTER_AUTH_URL || "http://localhost:8787",
    secret: env.BETTER_AUTH_SECRET || "dev-secret-change-in-production",
    trustedOrigins: [
      "http://localhost:3000",
      "http://localhost:3002",
      "http://localhost:8787",
      "https://near-agent.pages.dev",
      "https://demo.near-agent.pages.dev",
    ],
    advanced: {
      useSecureCookies: true,
      cookiePrefix: "near-agent",
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        path: "/",
        httpOnly: true,
      },
    },
    plugins: [
      siwn({
        recipient: env.NEAR_ACCOUNT || "near-agent",
        emailDomainName: "near.email",
      }),
      admin(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * Get session from request headers
 * @param auth - Better-Auth instance
 * @param request - Incoming request
 */
/**
 * Get session from request headers
 * Queries account table to get the real NEAR account ID
 */
/**
 * Get session from request headers
 * Extracts NEAR account ID from email (format: username@near.email)
 */
export async function getSessionFromRequest(
  auth: Auth,
  request: Request,
  db?: ReturnType<typeof drizzle>
): Promise<{ nearAccountId?: string; role?: string } | null> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    console.log("[Auth] Session data:", session ? "Session found" : "No session");

    if (session?.user) {
      console.log("[Auth] User data:", {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
      });

      const role = session.user.role || undefined;

      // Extract NEAR account ID from email
      // Email format in DB: "username@near.email" (the .near/.testnet was stripped by transformEmail)
      // We need to reconstruct: "username.near:mainnet" or "username.testnet:testnet"
      if (session.user.email) {
        const accountId = extractNearAccountId(session.user.email);
        console.log("[Auth] Extracted accountId from email:", accountId);
        if (accountId) {
          return { nearAccountId: accountId, role };
        }
      }

      console.log("[Auth] Could not extract accountId from email, falling back to user.id");
      // Fallback to user.id if extraction fails
      return { nearAccountId: session.user.id, role };
    }
    return null;
  } catch (error) {
    console.error("[Auth] Error getting session:", error);
    return null;
  }
}
