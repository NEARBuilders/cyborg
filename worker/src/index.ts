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
import type { Env } from "./types";
import { createAuth, getSessionFromRequest } from "./auth";
import { createDatabase } from "./db";
import { NearService, createAgentService } from "./services";
import { createApiRoutes } from "./routes/api";

// =============================================================================
// APP SETUP
// =============================================================================

const app = new Hono<{ Bindings: Env }>();

// =============================================================================
// MIDDLEWARE
// =============================================================================

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3002",
  "http://localhost:8787",
  "https://near-agent.pages.dev",
];

// CORS middleware
app.use(
  "*",
  cors({
    origin: (origin) => {
      // Allow requests with no origin (e.g., mobile apps, curl)
      if (!origin) return "http://localhost:8787";
      // Allow any *.near-agent.pages.dev subdomain
      if (origin.endsWith(".near-agent.pages.dev")) return origin;
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

// =============================================================================
// HEALTH CHECK
// =============================================================================

app.get("/health", (c) => c.text("OK"));

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
    const setCookies = response.headers.getSetCookie?.() || response.headers.get("set-cookie") || [];
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
// API ROUTES
// =============================================================================

app.all("/api/*", async (c) => {
  const env = c.env;
  const isDev = false; // Workers are always production-like

  // Initialize database
  const db = createDatabase(env.DB);

  // Initialize auth and get session
  const auth = createAuth(env);
  const sessionContext = await getSessionFromRequest(auth, c.req.raw);

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

  // Create context getter for routes
  const getContext = () => ({
    db,
    agentService,
    nearService,
    nearAccountId: sessionContext?.nearAccountId,
    role: sessionContext?.role,
    nearblocksApiKey: env.NEARBLOCKS_API_KEY || env.NEAR_BLOCK,
  });

  // Create API routes with context
  const apiRoutes = createApiRoutes(getContext);

  // Strip /api prefix and route to API handlers
  const url = new URL(c.req.url);
  const apiPath = url.pathname.replace(/^\/api/, "") || "/";
  const apiUrl = new URL(apiPath + url.search, url.origin);

  // Create a new request with the modified URL
  const apiRequest = new Request(apiUrl.toString(), {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: c.req.method !== "GET" && c.req.method !== "HEAD" ? c.req.raw.body : undefined,
  });

  // Execute the API routes
  return apiRoutes.fetch(apiRequest, env);
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
