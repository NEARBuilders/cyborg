/**
 * Cloudflare Pages Advanced Mode Worker
 * Handles API proxying and static asset serving
 */

// Use environment-based worker URL
const getWorkerUrl = (env) => {
  // In production Pages, use the Pages Function worker
  // In preview/demo, use the deployed worker
  return env.WORKER_URL || "https://near-agent.kj95hgdgnn.workers.dev";
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Proxy API and auth requests to the Worker
    if (pathname.startsWith('/api') || pathname.startsWith('/auth')) {
      const workerUrl = getWorkerUrl(env);

      // Build target URL with path and query
      const targetUrl = new URL(pathname + url.search, workerUrl);

      // Clone request
      const proxyRequest = new Request(targetUrl, request);

      // Copy all headers except host which we set explicitly
      request.headers.forEach((value, key) => {
        if (key !== 'host') {
          proxyRequest.headers.set(key, value);
        }
      });

      // Set CORS headers for browser requests
      proxyRequest.headers.set('Access-Control-Allow-Origin', '*');
      proxyRequest.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      proxyRequest.proxy = true;

      return fetch(proxyRequest);
    }

    // Handle OPTIONS for CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    // Serve static assets from ASSETS binding
    return env.ASSETS.fetch(request);
  },
};
