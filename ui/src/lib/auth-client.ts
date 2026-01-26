import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { siwnClient } from "better-near-auth/client";

function getBaseURL(): string {
  if (typeof window !== 'undefined') {
    // In standalone dev mode (port 3002), use local origin with proxy
    if (window.location.port === '3002') {
      return window.location.origin;
    }
    // When loaded via host, use hostUrl from runtime config
    if (window.__RUNTIME_CONFIG__?.hostUrl) {
      return window.__RUNTIME_CONFIG__.hostUrl;
    }
    return window.location.origin;
  }
  return '';
}

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
  plugins: [
    siwnClient({
      domain: import.meta.env.PUBLIC_ACCOUNT_ID || "every.near",
      networkId: "mainnet",
    }),
    adminClient(),
  ],
});
