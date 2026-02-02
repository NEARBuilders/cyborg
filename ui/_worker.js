/**
 * Cloudflare Pages _worker.js (Advanced Mode)
 *
 * This worker proxies API requests to the near-agent Worker
 * which has the D1 database bindings.
 *
 * Static assets and page routes are served directly - only proxy
 * specific API endpoints that aren't handled by the React app.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Only proxy /api/builders/* requests to the API Worker
    // Do NOT proxy /builders/* - those are page routes handled by React
    if (pathname.startsWith('/api/builders/') || pathname.startsWith('/api/')) {
      // SECURITY: Check if request is from allowed source
      const origin = request.headers.get('Origin');

      // Get the allowed origin from the request URL
      const allowedOrigin = `${url.protocol}//${url.host}`;

      // Block requests from external origins (other websites calling your API)
      if (origin && origin !== allowedOrigin) {
        return new Response(JSON.stringify({
          error: 'Forbidden',
          message: 'This endpoint can only be accessed from near-agent.pages.dev'
        }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Build the target URL - proxy to the deployed Worker
      const apiWorkerUrl = 'https://near-agent.kj95hgdgnn.workers.dev';
      const targetUrl = new URL(pathname + url.search, apiWorkerUrl);

      // Copy all headers
      const headers = new Headers();
      for (const [key, value] of request.headers.entries()) {
        headers.set(key, value);
      }
      // Add the original host for validation
      headers.set('X-Original-Host', url.host);

      // Forward the request
      const proxyRequest = new Request(targetUrl, {
        method: request.method,
        headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
        duplex: 'half',
      });

      return fetch(proxyRequest);
    }

    // Serve static assets and let React handle page routes
    return env.ASSETS.fetch(request);
  },
};
