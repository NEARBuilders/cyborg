import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { siwnClient } from "better-near-auth/client";

function getBaseURL(): string {
  if (typeof window !== 'undefined' && window.__RUNTIME_CONFIG__?.hostUrl) {
    return window.__RUNTIME_CONFIG__.hostUrl;
  }
  if (typeof window !== 'undefined') {
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
