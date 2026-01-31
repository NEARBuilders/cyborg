/**
 * Proxy /api/auth/* requests to the worker
 * This allows cookies to work on the same domain
 */
export async function onRequest(context: {
  request: Request;
  env: Record<string, unknown>;
}) {
  const { request } = context;

  // Get the worker URL from environment or use default
  const workerUrl = "https://near-agent.kj95hgdgnn.workers.dev";

  // Get the path after /api/auth/
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/auth/, "/api/auth");
  const queryString = url.search;

  // Build the target URL
  const targetUrl = `${workerUrl}${path}${queryString}`;

  console.log(`[Proxy] ${request.method} ${path} -> ${targetUrl}`);

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
