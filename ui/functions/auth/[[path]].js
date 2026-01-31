/**
 * Cloudflare Pages Function for /auth/*
 * Proxies all auth requests to the Worker
 */

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // Get the path after /auth
  const authPath = url.pathname.replace(/^\/auth/, '') + url.search;
  const workerUrl = `https://near-agent.pages.dev/auth${authPath}`;

  const proxyRequest = new Request(workerUrl, {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    duplex: 'half',
  });

  return fetch(proxyRequest);
}
