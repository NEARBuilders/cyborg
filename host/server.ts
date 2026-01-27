import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { auth } from "./src/auth";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";

const app = new Hono();

const PORT = Number(process.env.PORT) || 3000;
const API_URL = process.env.API_URL || "http://localhost:3014";
const UI_URL = process.env.UI_URL || "http://localhost:3002";

// Development mode check
const isDev = process.env.NODE_ENV !== "production";

// CORS middleware - handle credentials properly
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
app.get("/health", (c) => c.text("OK"));

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

// Proxy all /api/* requests (except /api/auth/*)
app.all("/api/*", async (c) => {
  const path = c.req.path;
  const url = new URL(c.req.url);
  const fullPath = path + url.search;

  console.log(`[API Proxy] ${c.req.method} ${path} -> ${API_URL}${fullPath}`);
  return proxyRequest(c, `${API_URL}${fullPath}`, true);
});

// Helper function to proxy requests
async function proxyRequest(c: any, targetUrl: string, injectContext = false) {
  try {
    const headers = new Headers();
    c.req.raw.headers.forEach((value: string, key: string) => {
      if (!["host", "connection"].includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    });

    // In dev mode, inject a fallback user if no session
    if (injectContext && isDev) {
      const devUser = process.env.DEV_USER || "test.near";
      headers.set("x-near-account-id", devUser);
      console.log(`[Dev Mode] Using fallback user: ${devUser}`);
    }

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

// Main router - check path manually for better control
app.all("*", async (c) => {
  const path = c.req.path;
  const url = new URL(c.req.url);
  const fullPath = path + url.search;

  // Handle API requests - inject auth context
  if (path.startsWith("/api/") || path === "/api") {
    console.log(`[API Proxy] ${c.req.method} ${path} -> ${API_URL}${fullPath}`);
    return proxyRequest(c, `${API_URL}${fullPath}`, true);
  }

  // In development, proxy other requests to UI dev server
  if (isDev) {
    try {
      const response = await fetch(`${UI_URL}${fullPath}`, {
        headers: c.req.raw.headers,
      });

      const responseHeaders = new Headers();
      response.headers.forEach((value, key) => {
        responseHeaders.set(key, value);
      });

      const contentType = response.headers.get("content-type") || "";

      // Inject runtime config into HTML responses
      if (contentType.includes("text/html")) {
        let html = await response.text();
        const runtimeConfig = {
          apiUrl: `http://localhost:${PORT}/api`,
          assetsUrl: UI_URL,
        };
        const configScript = `<script>window.__RUNTIME_CONFIG__ = ${JSON.stringify(runtimeConfig)};</script>`;
        html = html.replace("<head>", `<head>${configScript}`);
        return new Response(html, {
          status: response.status,
          headers: { "Content-Type": "text/html" },
        });
      }

      return new Response(response.body, {
        status: response.status,
        headers: responseHeaders,
      });
    } catch {
      // Fallback to local index.html
    }
  }

  // Serve static index.html
  try {
    const indexPath = fileURLToPath(new URL("./dist/index.html", import.meta.url));
    if (existsSync(indexPath)) {
      const content = readFileSync(indexPath, "utf-8");
      return new Response(content, {
        headers: { "Content-Type": "text/html" },
      });
    }
  } catch {
    // ignore
  }

  return c.text("Not Found", 404);
});

console.log(`[Host] Starting server on port ${PORT}`);
console.log(`[Host] API proxy: ${API_URL}`);
console.log(`[Host] UI proxy: ${UI_URL}`);
console.log(`[Host] Auth: Better Auth enabled`);

serve({
  fetch: app.fetch,
  port: PORT,
}, () => {
  console.log(`[Host] Server listening on http://localhost:${PORT}`);
});
