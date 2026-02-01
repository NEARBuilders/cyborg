/**
 * Cloudflare Pages _middleware
 * Proxies API requests to the Worker
 */

const WORKER_URL = "https://near-agent.kj95hgdgnn.workers.dev";

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Proxy API and auth requests to Worker
  if (pathname.startsWith("/api") || pathname.startsWith("/auth")) {
    // Build full worker URL
    const workerUrl = `${WORKER_URL}${pathname}${url.search}`;

    // Clone headers and add forward host
    const headers = new Headers(request.headers);
    headers.set('X-Forwarded-Host', 'near-agent.pages.dev');

    // Clone request with new URL
    const proxyRequest = new Request(workerUrl, request);
    // Replace headers
    for (const [key, value] of headers.entries()) {
      proxyRequest.headers.set(key, value);
    }

    return fetch(proxyRequest);
  }

  // Serve static assets
  return next();
}
// Updated: Sat Jan 31 20:25:13 EST 2026
