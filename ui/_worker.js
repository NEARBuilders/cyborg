/**
 * Cloudflare Pages _worker.js
 * Serves static assets and proxies API requests to the Worker
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Proxy API and auth requests to the Worker
    if (pathname.startsWith('/api') || pathname.startsWith('/auth')) {
      const workerUrl = `https://near-agent.kj95hgdgnn.workers.dev${pathname}${url.search}`;
      const proxyRequest = new Request(workerUrl, {
        method: request.method,
        headers: request.headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
        duplex: 'half',
      });
      return fetch(proxyRequest);
    }

    // Serve static assets from ASSETS binding
    return env.ASSETS.fetch(request);
  },
};
