/**
 * Proxy /api/* requests to the worker
 * This allows cookies to work on the same domain
 */
export async function onRequest(context: {
  request: Request;
  env: Record<string, unknown>;
}) {
  const { request } = context;

  // Get the worker URL from environment or use default
  const workerUrl = "https://near-agent.kj95hgdgnn.workers.dev";

  // Get the full path after /api/
  const url = new URL(request.url);
  const path = url.pathname + url.search;

  // Build the target URL
  const targetUrl = `${workerUrl}${path}`;

  console.log(`[Proxy] ${request.method} ${url.pathname} -> ${targetUrl}`);

  // Create proxy request with same headers and body
  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers: request.headers,
    body: request.method !== "GET" && request.method !== "HEAD"
      ? request.body
      : undefined,
  });

  // Forward to worker
  const response = await fetch(proxyRequest);

  // Return response with all headers including Set-Cookie
  return response;
}

export const onRequestFetch: typeof onRequest = onRequest;
