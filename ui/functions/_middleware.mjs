/**
 * Cloudflare Pages _middleware
 * Proxies API requests to the Worker
 *
 * IMPORTANT: This middleware proxies /api/* and /auth/* requests to the Worker.
 * The cookies are automatically forwarded because this is a server-to-server request.
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

    // Clone the request to the worker URL
    // The Request constructor automatically copies all headers including cookies
    const proxyRequest = new Request(workerUrl, request);

    // Add forward host header so Worker knows the original origin
    proxyRequest.headers.set('X-Forwarded-Host', url.host);

    // Forward the request to the worker
    const workerResponse = await fetch(proxyRequest);

    // Return the worker's response
    // Set-Cookie headers will be forwarded automatically
    return workerResponse;
  }

  // Serve static assets
  return next();
}
