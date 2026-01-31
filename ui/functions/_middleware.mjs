/**
 * Cloudflare Pages _middleware
 * Proxies API requests to the Worker
 */

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Proxy API requests to Worker
  if (pathname.startsWith("/api") || pathname.startsWith("/auth")) {
    const workerUrl = `https://near-agent.pages.dev${pathname}${url.search}`;
    const proxyRequest = new Request(workerUrl, {
      method: request.method,
      headers: request.headers,
      body: request.method !== "GET" && request.method !== "HEAD"
        ? request.body
        : undefined,
      duplex: "half",
    });

    return fetch(proxyRequest);
  }

  // Serve static assets
  return next();
}
