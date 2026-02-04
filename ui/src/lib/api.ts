/**
 * API Configuration
 * Centralized API base URL configuration for all fetch calls
 *
 * IMPORTANT: Use same-origin for all API calls to ensure cookies are sent correctly.
 * Cloudflare Pages proxies /api/* requests to the Worker, so using window.location.origin
 * ensures authentication works on mobile browsers.
 */

export function getApiBaseUrl(): string {
  if (typeof window === "undefined") return "";

  const origin = window.location.origin;

  // Local development: use worker port
  if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
    return "http://localhost:8787";
  }

  // Production: use same origin (cookies are sent correctly)
  // Pages proxies /api/* requests to the Worker
  return origin;
}

/**
 * Fetch wrapper that automatically uses the correct API base URL
 */
export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path}`;

  return fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
}
