import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { spawn } from "child_process";

const app = new Hono();

const PORT = Number(process.env.PORT) || 3013;
const RSPACK_PORT = 3014;

console.log(`[API] Starting main API server (auth handled by separate auth server on port 3015)`);

// Start rspack dev server in background
console.log(`[API] Starting rspack dev server on port ${RSPACK_PORT}...`);
const rspack = spawn("bun", ["run", "dev:rspack"], {
  stdio: "inherit",
  shell: true,
});

rspack.on("error", (err) => {
  console.error("[API] Failed to start rspack dev server:", err);
});

rspack.on("exit", (code) => {
  console.log(`[API] Rspack dev server exited with code ${code}`);
});

// Shutdown handler
process.on("SIGTERM", () => {
  rspack.kill();
  process.exit(0);
});

process.on("SIGINT", () => {
  rspack.kill();
  process.exit(0);
});

// CORS middleware
app.use(
  "*",
  cors({
    origin: (origin) => origin || `http://localhost:${PORT}`,
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Accept", "X-Requested-With", "X-Near-Account-Id", "X-User-Role"],
    exposeHeaders: ["Content-Length", "Content-Type", "Set-Cookie"],
  })
);

// Health check
app.get("/health", (c) => c.text("OK"));

// Helper function to proxy requests to rspack
async function proxyRequest(c: any, targetUrl: string) {
  try {
    const headers = new Headers();
    c.req.raw.headers.forEach((value: string, key: string) => {
      if (!["host", "connection"].includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    });

    const response = await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body: c.req.method !== "GET" && c.req.method !== "HEAD" ? c.req.raw.body : undefined,
      // @ts-ignore
      duplex: c.req.method !== "GET" && c.req.method !== "HEAD" ? "half" : undefined,
    });

    const contentType = response.headers.get("content-type") || "";

    // For SSE streaming responses
    if (contentType.includes("text/event-stream")) {
      return new Response(response.body, {
        status: response.status,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Access-Control-Allow-Origin": c.req.header("origin") || `http://localhost:${PORT}`,
          "Access-Control-Allow-Credentials": "true",
        },
      });
    }

    // For regular responses
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      responseHeaders.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("[Proxy] Error:", error);
    return c.json({ error: "Failed to proxy request" }, 502);
  }
}

// Proxy all /api/* requests to rspack
app.all("/api/*", async (c) => {
  const path = c.req.path;
  const url = new URL(c.req.url);
  const fullPath = path + url.search;

  console.log(`[API Proxy] ${c.req.method} ${path} -> http://localhost:${RSPACK_PORT}${fullPath}`);
  return proxyRequest(c, `http://localhost:${RSPACK_PORT}${fullPath}`);
});

// Start server
console.log(`[API] Starting server on port ${PORT}`);
console.log(`[API] Rspack internal proxy: http://localhost:${RSPACK_PORT}`);
console.log(`[API] Auth requests proxied to auth server on port 3015`);

serve({
  fetch: app.fetch,
  port: PORT,
}, () => {
  console.log(`[API] Server listening on http://localhost:${PORT}`);
});
