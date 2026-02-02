/**
 * Cloudflare Worker Entry Point
 *
 * Merges functionality from:
 * - host/server.ts (auth, CORS, session handling)
 * - api/src/index.ts (oRPC handlers)
 *
 * Single Worker deployment replacing both host and API packages.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { Social } from "near-social-js";
import type { Env } from "./types";
import { createAuth, getSessionFromRequest } from "./auth";
import { createDatabase } from "./db";
import { NearService, createAgentService } from "./services";
import { createApiRoutes } from "./routes/api";
import { CacheService } from "./services/cache";
import { handleBuildersRequest } from "./services/builders";
import { getAscendantHolders, getHolderTypes } from "./services/holders";

// =============================================================================
// APP SETUP
//=============================================================================

const app = new Hono<{ Bindings: Env }>();

// =============================================================================
// MIDDLEWARE
//=============================================================================

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3002",
  "http://localhost:8787",
  "https://near-agent.pages.dev",
  "https://demo.near-agent.pages.dev",
];

// Allowed hosts for public API (builders, profiles)
// Also allow the worker itself when called via service binding
const ALLOWED_HOSTS = [
  "near-agent.pages.dev",
  "demo.near-agent.pages.dev",
  "mains.pages.dev",
  "near-agent.kj95hgdgnn.workers.dev",
  "localhost:3000",
  "localhost:3002",
  "localhost:8787",
];

// CORS middleware
app.use(
  "*",
  cors({
    origin: (origin) => {
      // Allow requests with no origin (e.g., mobile apps, curl)
      if (!origin) return "http://localhost:8787";
      // Allow any *.pages.dev subdomain
      if (origin.endsWith(".pages.dev")) return origin;
      // Allow explicitly listed origins
      if (ALLOWED_ORIGINS.includes(origin)) return origin;
      // Default fallback
      return origin;
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Accept", "X-Requested-With"],
    exposeHeaders: ["Content-Length", "Content-Type", "Set-Cookie"],
  })
);

// Host guard middleware for public endpoints
function createHostGuard() {
  return async (c: any, next: () => Promise<void>) => {
    const url = new URL(c.req.url);

    // Check multiple sources for the origin host:
    // 1. X-Forwarded-Host header (set by Pages proxy)
    // 2. X-Original-Host header
    // 3. originHost query parameter
    // 4. Origin header
    // 5. Referer header (extract host from URL)
    // 6. Fall back to URL hostname
    let host = c.req.header("X-Forwarded-Host")
      || c.req.header("X-Original-Host")
      || url.searchParams.get("originHost");

    if (!host) {
      const origin = c.req.header("origin");
      if (origin) {
        try {
          host = new URL(origin).host;
        } catch {
          // Invalid URL, ignore
        }
      }
    }

    if (!host) {
      const referer = c.req.header("referer");
      if (referer) {
        try {
          host = new URL(referer).host;
        } catch {
          // Invalid URL, ignore
        }
      }
    }

    if (!host) {
      host = url.hostname;
    }

    // Check if host is allowed
    const isAllowedHost = ALLOWED_HOSTS.some((allowed) => {
      if (allowed === host) return true;
      if (allowed.startsWith("localhost") && host.startsWith("localhost")) return true;
      if (allowed.includes(".pages.dev") && host.endsWith(".pages.dev")) return true;
      return false;
    });

    if (!isAllowedHost) {
      console.log(`[HOST GUARD] Blocked request from: ${host}`);
      return c.json({ error: "Forbidden - invalid host" }, 403);
    }

    await next();
  };
}

// =============================================================================
// PUBLIC HEALTH CHECKS
// =============================================================================

app.get("/health", (c) => c.text("OK"));
app.get("/ping", (c) => c.json({
  status: "ok",
  timestamp: new Date().toISOString(),
  service: "near-agent",
}));

// =============================================================================
// PUBLIC ASCENDANT HOLDERS (Database-based, no RPC on edge)
// =============================================================================

app.get("/nfts/ascendant/holders", async (c) => {
  const queryParams = c.req.query();
  const limit = queryParams.limit ? parseInt(queryParams.limit as string) : undefined;
  const offset = queryParams.offset ? parseInt(queryParams.offset as string) : undefined;

  const db = createDatabase(c.env.DB);

  try {
    const data = await getAscendantHolders({ db });

    let holders = data.holders;

    // Apply pagination if requested
    if (offset !== undefined || limit !== undefined) {
      const start = offset || 0;
      const end = limit !== undefined ? start + limit : undefined;
      holders = holders.slice(start, end);
    }

    return c.json({
      holders,
      total: data.holders.length,
      lastUpdated: data.lastUpdated,
    });
  } catch (error) {
    console.error("[API] Error fetching holders:", error);
    return c.json(
      { error: "Failed to fetch Ascendant holders" },
      500
    );
  }
});

/**
 * Get holder types for a specific account
 * Returns which Legion NFT contracts the account holds
 *
 * Example: GET /nfts/legion/holders/account.near
 *
 * Response:
 * {
 *   accountId: "account.near",
 *   isAscendant: true,
 *   isInitiate: false,
 *   isNearlegion: true,
 *   contracts: [
 *     { contractId: "ascendant.nearlegion.near", quantity: 1 },
 *     { contractId: "nearlegion.nfts.tg", quantity: 3 }
 *   ],
 *   totalTokens: 4
 * }
 */
app.get("/nfts/legion/holders/:accountId", async (c) => {
  const accountId = c.req.param("accountId");
  const db = createDatabase(c.env.DB);

  try {
    const types = await getHolderTypes(db, accountId);

    return c.json({
      accountId,
      ...types,
    });
  } catch (error) {
    console.error("[API] Error fetching holder types:", error);
    return c.json(
      { error: "Failed to fetch holder types" },
      500
    );
  }
});

// =============================================================================
// PUBLIC BUILDERS ENDPOINTS (with host guard)
// =============================================================================

const publicRoutes = new Hono<{ Bindings: Env }>();

// Apply host guard to public routes
publicRoutes.use("*", createHostGuard());

// Builders endpoints - public with host guard
// Route mounted at /api/builders, so "/" becomes the list endpoint
publicRoutes.get("/", async (c) => {
  const queryParams = c.req.query();
  const input = {
    path: queryParams.path || "collections",
    params: Object.fromEntries(
      Object.entries(queryParams).filter(([k]) => k !== "path")
    ),
    nearblocksApiKey: c.env.NEARBLOCKS_API_KEY,
    cache: new CacheService(c.env.CACHE),
  };

  const result = await handleBuildersRequest(input);

  if (result.success) {
    return c.json(result.data);
  } else {
    return c.json({ error: result.error }, result.status as 400 | 500);
  }
});

publicRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const input = {
    ...body,
    nearblocksApiKey: c.env.NEARBLOCKS_API_KEY,
    cache: new CacheService(c.env.CACHE),
  };

  const result = await handleBuildersRequest(input);

  if (result.success) {
    return c.json(result.data);
  } else {
    return c.json({ error: result.error }, result.status as 400 | 500);
  }
});

publicRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const queryParams = c.req.query();

  const input = {
    path: `collections/${id}`,
    params: queryParams as Record<string, string>,
    nearblocksApiKey: c.env.NEARBLOCKS_API_KEY,
    cache: new CacheService(c.env.CACHE),
  };

  const result = await handleBuildersRequest(input);

  if (result.success) {
    return c.json(result.data);
  } else {
    return c.json({ error: result.error }, result.status as 400 | 500);
  }
});

// Mount public routes
app.route("/api/builders", publicRoutes);

// =============================================================================
// PUBLIC PROFILES ENDPOINTS (with host guard)
// =============================================================================

const profilesRoutes = new Hono<{ Bindings: Env }>();
profilesRoutes.use("*", createHostGuard());

// Initialize NEAR Social client
// Uses default api.near.social server for fetching from social.near contract
const social = new Social({
  network: "mainnet",
});

// Batch fetch with POST body
profilesRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const accountIds = body.ids?.split(",").filter(Boolean) || [];

  if (accountIds.length === 0) {
    return c.json({});
  }

  const cache = new CacheService(c.env.CACHE);

  // Try to get from KV cache first
  const cachedProfiles = await cache.getProfiles(accountIds);
  const uncachedIds = accountIds.filter((id: string) => !cachedProfiles.has(id));

  // Fetch only uncached profiles using near-social-js
  const fetchedProfiles: Record<string, any> = {};

  if (uncachedIds.length > 0) {
    await Promise.all(
      uncachedIds.map(async (accountId: string) => {
        try {
          const profile = await social.getProfile(accountId);
          if (profile) {
            fetchedProfiles[accountId] = profile;
          }
        } catch (e) {
          console.error(`[API] Error fetching profile for ${accountId}:`, e);
        }
      })
    );

    // Cache fetched profiles
    await cache.setProfiles(fetchedProfiles);
  }

  // Merge cached and fetched profiles
  // Convert Map to plain object for spreading
  const cachedProfilesObj = Object.fromEntries(cachedProfiles.entries());
  const allProfiles = { ...cachedProfilesObj, ...fetchedProfiles };

  return c.json(allProfiles);
});

// Also keep GET for backwards compatibility
profilesRoutes.get("/", async (c) => {
  const url = new URL(c.req.url);
  console.log(`[PROFILES] Full URL: ${c.req.url}`);
  console.log(`[PROFILES] Search: ${url.search}`);
  console.log(`[PROFILES] ids param: ${url.searchParams.get("ids")}`);
  const idsParam = url.searchParams.get("ids");
  const accountIds = idsParam?.split(",").filter(Boolean) || [];
  console.log(`[PROFILES] Account IDs:`, accountIds);

  if (accountIds.length === 0) {
    return c.json({});
  }

  const cache = new CacheService(c.env.CACHE);

  // Try to get from KV cache first
  const cachedProfiles = await cache.getProfiles(accountIds);
  const uncachedIds = accountIds.filter((id: string) => !cachedProfiles.has(id));

  // Fetch only uncached profiles using near-social-js
  const fetchedProfiles: Record<string, any> = {};

  if (uncachedIds.length > 0) {
    await Promise.all(
      uncachedIds.map(async (accountId: string) => {
        try {
          const profile = await social.getProfile(accountId);
          if (profile) {
            fetchedProfiles[accountId] = profile;
          }
        } catch (e) {
          console.error(`[API] Error fetching profile for ${accountId}:`, e);
        }
      })
    );

    // Cache fetched profiles
    await cache.setProfiles(fetchedProfiles);
  }

  // Merge cached and fetched profiles
  // Convert Map to plain object for spreading
  const cachedProfilesObj = Object.fromEntries(cachedProfiles.entries());
  const allProfiles = { ...cachedProfilesObj, ...fetchedProfiles };

  return c.json(allProfiles);
});

profilesRoutes.get("/:accountId", async (c) => {
  const accountId = c.req.param("accountId");
  const cache = new CacheService(c.env.CACHE);

  // Try KV cache first
  const cached = await cache.getProfile(accountId);
  if (cached) {
    console.log(`[KV CACHE HIT] Profile for: ${accountId}`);
    return c.json(cached);
  }

  // Fetch from NEAR Social smart contract
  try {
    const profile = await social.getProfile(accountId);

    if (!profile) {
      return c.json(null, 404);
    }

    // Cache in KV
    await cache.setProfile(accountId, profile);

    return c.json(profile);
  } catch (e) {
    console.error(`[API] Error fetching profile for ${accountId}:`, e);
    return c.json(null, 500);
  }
});

// Mount profiles routes
app.route("/api/profiles", profilesRoutes);

// =============================================================================
// AUTH ROUTES
// =============================================================================

// Better Auth handler - handle all /api/auth/* requests
app.all("/api/auth/*", async (c) => {
  const url = new URL(c.req.url);
  const method = c.req.method;

  console.log(`[Auth] ${method} ${url.pathname}`);
  console.log(`[Auth] Origin: ${c.req.header("origin")}`);
  console.log(`[Auth] Cookie header: ${c.req.header("cookie") || "none"}`);

  try {
    const auth = createAuth(c.env);

    const response = await auth.handler(c.req.raw);

    if (!response) {
      console.error("[Auth] No response from handler");
      return c.json({ error: "No response from auth handler" }, 500);
    }

    console.log(`[Auth] Response status: ${response.status}`);

    // Log Set-Cookie headers
    const setCookies = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() || response.headers.get("set-cookie") || [];
    console.log(`[Auth] Set-Cookie headers:`, setCookies);

    // Log response body for non-success responses
    if (response.status >= 400) {
      const cloned = response.clone();
      try {
        const text = await cloned.text();
        console.error("[Auth] Error body:", text);
      } catch (e) {
        console.error("[Auth] Could not read error body");
      }
    }

    return response;
  } catch (error: any) {
    console.error("[Auth] Error:", error?.message || error);
    return c.json({ error: "Auth error", message: error?.message || String(error) }, 500);
  }
});

// Also handle /auth/* for backwards compatibility
app.all("/auth/*", async (c) => {
  const auth = createAuth(c.env);
  const response = await auth.handler(c.req.raw);
  return response;
});

// =============================================================================
// AUTHENTICATED API ROUTES
// =============================================================================

app.all("/api/chat", async (c) => {
  const env = c.env;

  // Initialize auth and get session
  const auth = createAuth(env);
  const sessionContext = await getSessionFromRequest(auth, c.req.raw);

  if (!sessionContext?.nearAccountId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  // Initialize database
  const db = createDatabase(env.DB);

  // Initialize services
  const nearService = new NearService(db, {
    rpcUrl: env.NEAR_RPC_URL,
    contractId: env.NEAR_LEGION_CONTRACT,
    initiateContractId: env.NEAR_INITIATE_CONTRACT,
  });

  const agentService = createAgentService(
    db,
    {
      apiKey: env.NEAR_AI_API_KEY,
      baseUrl: env.NEAR_AI_BASE_URL,
      model: env.NEAR_AI_MODEL,
    },
    nearService
  );

  // Route to the API chat handler
  if (c.req.method === "POST" && c.req.path === "/api/chat") {
    if (!agentService) {
      return c.json({ error: "NEAR AI not connected" }, 503);
    }
    const body = await c.req.json();
    const result = await agentService.processMessage(
      sessionContext.nearAccountId,
      body.message,
      body.conversationId
    );
    return c.json(result);
  }

  if (c.req.method === "POST" && c.req.path === "/api/chat/stream") {
    if (!agentService) {
      return c.json({ error: "NEAR AI not connected" }, 503);
    }
    const body = await c.req.json();

    // Create SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          const generator = agentService.processMessageStream(
            sessionContext.nearAccountId!, // Already validated above
            body.message,
            body.conversationId
          );

          for await (const event of generator) {
            const sseData = `event: ${event.type}\nid: ${event.id}\ndata: ${JSON.stringify(event.data)}\n\n`;
            controller.enqueue(encoder.encode(sseData));
          }
        } catch (error) {
          console.error("[API] Stream error:", error);
          const errorEvent = `event: error\ndata: ${JSON.stringify({ message: "Stream failed" })}\n\n`;
          controller.enqueue(encoder.encode(errorEvent));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  return c.json({ error: "Not found" }, 404);
});

// =============================================================================
// STATIC ASSETS (serve UI from same domain as auth)
// =============================================================================

// Serve static assets from the ASSETS binding
app.get("*", async (c) => {
  const url = new URL(c.req.url);
  const pathname = url.pathname;

  // Try to fetch from assets first
  try {
    const assetResponse = await c.env.ASSETS.fetch(
      new Request(pathname, c.req.raw)
    );

    // If asset exists, return it
    if (assetResponse.status === 200) {
      return assetResponse;
    }
  } catch (e) {
    // Asset not found, fall through to index.html for SPA
  }

  // For SPA routing, return index.html for non-API routes
  try {
    const indexResponse = await c.env.ASSETS.fetch(new Request("/index.html", c.req.raw));
    return indexResponse;
  } catch (e) {
    return c.text("Not Found", 404);
  }
});

// =============================================================================
// EXPORT
// =============================================================================

export default app;
