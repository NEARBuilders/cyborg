/**
 * Cloudflare Pages _worker.js (advanced mode)
 * Handles API proxying and static asset serving
 *
 * This file is placed in the UI root to be copied to dist during build
 * It works with the service binding configured in ui/wrangler.toml
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Proxy API and auth requests to the Worker via service binding
    if (pathname.startsWith('/api') || pathname.startsWith('/auth')) {
      // Build the worker URL
      const workerUrl = new URL(pathname + url.search, request.url);

      // Copy headers and preserve the original Host header
      const proxyHeaders = new Headers();
      for (const [key, value] of request.headers.entries()) {
        proxyHeaders.set(key, value);
      }
      // Preserve original Host header for host guard validation
      proxyHeaders.set('X-Original-Host', url.host);

      const proxyRequest = new Request(workerUrl, {
        method: request.method,
        headers: proxyHeaders,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
        duplex: 'half',
      });

      // Use service binding if available (production)
      if (env.API) {
        return env.API.fetch(proxyRequest);
      }

      // Fallback for local development (won't have service binding)
      return fetch(proxyRequest);
    }

    // Serve static assets from ASSETS binding
    return env.ASSETS.fetch(request);
  },
};
