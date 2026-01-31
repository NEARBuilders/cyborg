/**
 * Pages Function to proxy /api/* requests to the Worker
 * This keeps cookies same-origin, fixing mobile auth issues
 */

const WORKER_URL = 'https://near-agent.kj95hgdgnn.workers.dev';

export const onRequest: PagesFunction = async (context) => {
  const { request } = context;
  const url = new URL(request.url);

  // Build the worker URL
  const workerUrl = `${WORKER_URL}${url.pathname}${url.search}`;

  // Clone headers but remove host
  const headers = new Headers(request.headers);
  headers.delete('host');

  // Forward the request to the Worker
  const response = await fetch(workerUrl, {
    method: request.method,
    headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
  });

  // Return response as-is (cookies will be set for pages.dev domain)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};
