import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { siwn } from "better-near-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { Social } from "near-social-js";
import * as schema from "./src/db/schema";
import path from "path";

// Resolve database path - use file: URL format for libsql
const dbUrlPath = process.env.API_DATABASE_URL?.replace("file:", "") || "api/database.db";
const dbPath = path.isAbsolute(dbUrlPath) ? dbUrlPath : path.resolve(process.cwd(), dbUrlPath);
const dbUrl = `file:${dbPath}`;

// Initialize Drizzle with libsql client
const client = createClient({ url: dbUrl });
const db = drizzle({ client, schema });

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      nearAccount: schema.nearAccount,
    },
  }),
  basePath: "/api/auth",
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3015",
  secret: process.env.BETTER_AUTH_SECRET || "dev-secret-change-in-production-please-use-32-chars",
  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:3013",
    "http://localhost:3015",
  ],
  plugins: [
    siwn({
      domain: process.env.NEAR_ACCOUNT || "example.near",
      networkId: "mainnet",
    }),
    admin(),
  ],
});

const app = new Hono();

const PORT = Number(process.env.PORT) || 3015;

// Initialize NEAR Social client for profile fetching
const social = new Social({
  network: "mainnet",
});

// Test the Social client on startup
(async () => {
  try {
    const testProfile = await social.getProfile("near");
    console.log("[Profile] Social client test - fetched 'near' profile:", testProfile ? "SUCCESS" : "NOT FOUND");
  } catch (e) {
    console.error("[Profile] Social client test FAILED:", e);
  }
})();

// Simple in-memory cache for profiles (no KV in local dev)
const profileCache = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function getCachedProfile(accountId: string): Promise<any | null> {
  const cached = profileCache.get(accountId);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }
  return null;
}

async function setCachedProfile(accountId: string, data: any): Promise<void> {
  profileCache.set(accountId, {
    data,
    expiry: Date.now() + CACHE_TTL,
  });
}

// =============================================================================
// NEAR SOCIAL PROFILES ENDPOINTS
// =============================================================================

// GET /api/profiles/:accountId - Get single profile
app.get("/api/profiles/:accountId", async (c) => {
  const accountId = c.req.param("accountId");

  // Check cache first
  const cached = await getCachedProfile(accountId);
  if (cached) {
    console.log(`[Profile Cache HIT] ${accountId}`);
    return c.json(cached);
  }

  console.log(`[Profile] Fetching from NEAR Social: ${accountId}`);

  try {
    const profile = await social.getProfile(accountId);

    if (!profile) {
      return c.json(null, 404);
    }

    // Cache the result
    await setCachedProfile(accountId, profile);

    return c.json(profile);
  } catch (e) {
    console.error(`[Profile] Error fetching ${accountId}:`, e);
    return c.json(null, 500);
  }
});

// POST /api/profiles - Batch get profiles
app.post("/api/profiles", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const accountIds = body.ids?.split(",").filter(Boolean) || [];

  if (accountIds.length === 0) {
    return c.json({});
  }

  console.log(`[Profile] Batch fetching ${accountIds.length} profiles`);

  const result: Record<string, any> = {};

  await Promise.all(
    accountIds.map(async (accountId) => {
      // Check cache first
      const cached = await getCachedProfile(accountId);
      if (cached) {
        result[accountId] = cached;
        return;
      }

      // Fetch from NEAR Social
      try {
        const profile = await social.getProfile(accountId);
        if (profile) {
          result[accountId] = profile;
          await setCachedProfile(accountId, profile);
        }
      } catch (e) {
        console.error(`[Profile] Error fetching ${accountId}:`, e);
      }
    })
  );

  return c.json(result);
});

// =============================================================================
// CORS MIDDLEWARE
// =============================================================================

// CORS middleware
app.use(
  "*",
  cors({
    origin: (origin) => origin || `http://localhost:${PORT}`,
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Accept", "X-Requested-With"],
    exposeHeaders: ["Content-Length", "Content-Type", "Set-Cookie"],
  })
);

// Health check
app.get("/health", (c) => c.text("Auth Server OK"));

// Better Auth handler - handle all /api/auth/* requests
app.all("/api/auth/*", async (c) => {
  const response = await auth.handler(c.req.raw);
  return response;
});

// Also handle /auth/* for backwards compatibility
app.all("/auth/*", async (c) => {
  const response = await auth.handler(c.req.raw);
  return response;
});

// Helper function to get session from request
async function getSessionFromRequest(
  request: Request
): Promise<{ nearAccountId?: string; role?: string } | null> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (session?.user) {
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

// Proxy non-auth requests to API server
app.all("*", async (c) => {
  const path = c.req.path;

  // Don't proxy health check
  if (path === "/health") {
    return c.text("Auth Server OK");
  }

  // Don't proxy auth endpoints
  if (path.startsWith("/api/auth/") || path.startsWith("/auth/")) {
    return c.text("Not Found", 404);
  }

  // Don't proxy profiles endpoints (handled locally)
  if (path.startsWith("/api/profiles")) {
    return c.text("Not Found", 404);
  }

  // Proxy everything else to the main API server
  const apiUrl = "http://localhost:3013";
  const url = new URL(c.req.url);
  const fullPath = path + url.search;

  const headers = new Headers();
  c.req.raw.headers.forEach((value: string, key: string) => {
    if (!["host", "connection"].includes(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  // Inject session context
  const sessionContext = await getSessionFromRequest(c.req.raw);
  if (sessionContext?.nearAccountId) {
    headers.set("x-near-account-id", sessionContext.nearAccountId);
    if (sessionContext.role) {
      headers.set("x-user-role", sessionContext.role);
    }
  }

  const response = await fetch(`${apiUrl}${fullPath}`, {
    method: c.req.method,
    headers,
    body: c.req.method !== "GET" && c.req.method !== "HEAD" ? c.req.raw.body : undefined,
    // @ts-ignore
    duplex: c.req.method !== "GET" && c.req.method !== "HEAD" ? "half" : undefined,
  });

  const responseHeaders = new Headers();
  response.headers.forEach((value, key) => {
    responseHeaders.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
});

console.log(`[Auth Server] Starting on port ${PORT}`);
console.log(`[Auth Server] Better Auth enabled with Drizzle + libsql`);

serve({
  fetch: app.fetch,
  port: PORT,
}, () => {
  console.log(`[Auth Server] Listening on http://localhost:${PORT}`);
});
