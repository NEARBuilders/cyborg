import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { siwn } from "better-near-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
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
