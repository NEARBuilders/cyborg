/**
 * Cloudflare Pages _middleware
 * Proxies API requests to the Worker via service binding
 */

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Proxy API requests to Worker via service binding
  if (pathname.startsWith("/api") || pathname.startsWith("/auth")) {
    // Use the service binding if available, otherwise fallback to origin
    const workerUrl = new URL(pathname + url.search, request.url);

    // Copy headers and add our custom validation header
    const proxyHeaders = new Headers();
    for (const [key, value] of request.headers.entries()) {
      proxyHeaders.set(key, value);
    }
    // Use X-Forwarded-Host (custom header, not forbidden)
    proxyHeaders.set('X-Forwarded-Host', url.host);

    const proxyRequest = new Request(workerUrl, {
      method: request.method,
      headers: proxyHeaders,
      body: request.method !== "GET" && request.method !== "HEAD"
        ? request.body
        : undefined,
      duplex: "half",
    });

    // Use service binding if available (Cloudflare Pages)
    if (env.API) {
      return env.API.fetch(proxyRequest);
    }

    // Fallback for local development
    return fetch(proxyRequest);
  }

  // Serve static assets
  return next();
}
