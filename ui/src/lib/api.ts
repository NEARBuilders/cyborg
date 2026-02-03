/**
 * API Configuration
 * Centralized API base URL configuration for all fetch calls
 */

export function getApiBaseUrl(): string {
  if (typeof window === "undefined") return "";

  const origin = window.location.origin;

  // Local development: use worker port
  if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
    return "http://localhost:8787";
  }

  // Production: always use the worker URL for API calls
  // This works for both pages.dev and custom domains
  return "https://near-agent.kj95hgdgnn.workers.dev";
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
