import { adminClient } from "better-auth/client/plugins";
import { createAuthClient as createBetterAuthClient } from "better-auth/react";
import { siwnClient } from "better-near-auth/client";

function getAuthBaseUrl(): string {
  if (typeof window === "undefined") return "";

  const hostname = window.location.hostname;

  // For Pages deployment - use same origin (proxied to worker via Pages Function)
  if (hostname.includes('.pages.dev')) {
    return window.location.origin;
  }

  // For Workers deployment (everything served from worker)
  if (hostname.includes('.workers.dev')) {
    return window.location.origin;
  }

  // For local development
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return window.__RUNTIME_CONFIG__?.hostUrl ?? "http://localhost:8787";
  }

  return window.location.origin;
}

function createAuthClient() {
  return createBetterAuthClient({
    baseURL: getAuthBaseUrl(),
    fetchOptions: {
      credentials: "include",
    },
    plugins: [
      siwnClient({
        domain: "near-agent",
        networkId: "mainnet",
      }),
      adminClient(),
    ],
  });
}

let _authClient: ReturnType<typeof createAuthClient> | undefined;

export function getAuthClient() {
  if (_authClient === undefined) {
    _authClient = createAuthClient();
  }
  return _authClient;
}

export const authClient = getAuthClient();
