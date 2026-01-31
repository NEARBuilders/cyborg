/**
 * Cloudflare Pages _middleware.js
 *
 * This middleware handles ALL requests on the Pages domain:
 * 1. Serves static assets (React SPA) from the ASSETS binding
 * 2. Proxies API requests to the Worker service binding
 *
 * This allows cookies to work on the same domain (no cross-origin issues)
 */

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // ============================================================================
  // API REQUESTS - Proxy to Worker service binding
  // ============================================================================

  if (pathname.startsWith("/api") || pathname.startsWith("/auth")) {
    console.log(`[_middleware] Proxying ${request.method} ${pathname}`);

    // Check if service binding is available
    if (env.API) {
      // Use service binding for better performance and same-domain cookies
      try {
        const serviceUrl = new URL(pathname + url.search, "https://near-agent.pages.dev");
        const proxyRequest = new Request(serviceUrl.toString(), {
          method: request.method,
          headers: request.headers,
          body: request.method !== "GET" && request.method !== "HEAD"
            ? request.body
            : undefined,
          // @ts-ignore - duplex is required for streaming body
          duplex: "half",
        });

        const response = await env.API.fetch(proxyRequest);
        return response;
      } catch (error) {
        console.error(`[_middleware] Error proxying via service binding:`, error);
        return new Response(
          JSON.stringify({ error: "Failed to reach API service" }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      }
    } else {
      // Fallback: Fetch from external Worker
      try {
        const workerUrl = `https://near-agent.kj95hgdgnn.workers.dev${pathname}${url.search}`;
        const proxyRequest = new Request(workerUrl, {
          method: request.method,
          headers: request.headers,
          body: request.method !== "GET" && request.method !== "HEAD"
            ? request.body
            : undefined,
          // @ts-ignore
          duplex: "half",
        });

        const response = await fetch(proxyRequest);
        return response;
      } catch (error) {
        console.error(`[_middleware] Error proxying to external Worker:`, error);
        return new Response(
          JSON.stringify({ error: "Failed to reach API service" }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      }
    }
  }

  // ============================================================================
  // STATIC ASSETS - Continue to serve from ASSETS binding
  // ============================================================================

  return next();
}
