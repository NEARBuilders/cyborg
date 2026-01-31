import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter } from "./router";
import type { ClientRuntimeConfig } from "./types";

// Runtime config for Cloudflare Pages deployment
// With _worker.js pattern, all APIs are served from the same domain
function getRuntimeConfig(): ClientRuntimeConfig {
  const origin = window.location.origin;

  return {
    assetsUrl: origin,
    env: "production",
    account: "near-agent",
    title: "NEAR Agent",
    hostUrl: origin, // Same origin - APIs served by _worker.js
    apiBase: "/api",
    rpcBase: "/api/rpc",
  };
}

function main() {
  const runtimeConfig = getRuntimeConfig();

  // Set global runtime config for other modules
  (window as any).__RUNTIME_CONFIG__ = runtimeConfig;

  const { router, queryClient } = createRouter({
    context: {
      assetsUrl: runtimeConfig.assetsUrl,
      runtimeConfig,
    },
  });

  const root = document.getElementById("root");
  if (root) {
    createRoot(root).render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );
  }
}

main();
