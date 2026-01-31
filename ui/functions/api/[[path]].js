/**
 * Cloudflare Pages Function for /api/*
 * Proxies all API requests to the Worker
 */

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // Get the path after /api
  const apiPath = url.pathname.replace(/^\/api/, '') + url.search;
  const workerUrl = `https://near-agent.pages.dev/api${apiPath}`;

  const proxyRequest = new Request(workerUrl, {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    duplex: 'half',
  });

  return fetch(proxyRequest);
}
