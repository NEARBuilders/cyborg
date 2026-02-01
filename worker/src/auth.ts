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
 * Transform email to strip .near/.testnet suffix from NEAR account IDs
 * e.g., "jemartel.near@near.email" -> "jemartel@near.email"
 */
function transformEmail(email: string): string {
  return email.replace(/\.(near|testnet)@/, "@");
}

/**
 * Wrap the drizzle adapter factory to transform emails before insert
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
      if (data.model === "user" && typeof (data.data as Record<string, unknown>).email === "string") {
        (data.data as Record<string, unknown>).email = transformEmail((data.data as Record<string, unknown>).email as string);
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
export async function getSessionFromRequest(
  auth: Auth,
  request: Request
): Promise<{ nearAccountId?: string; role?: string } | null> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (session?.user) {
      // Get nearAccountId from the user's name (set during NEAR sign-in)
      const nearAccountId = session.user.name;
      const role = session.user.role || undefined;
      return { nearAccountId, role };
    }
    return null;
  } catch (error) {
    console.error("[Auth] Error getting session:", error);
    return null;
  }
}
