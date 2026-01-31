import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter } from "./router";
import type { ClientRuntimeConfig } from "./types";

// Runtime config for Cloudflare Pages deployment
function getRuntimeConfig(): ClientRuntimeConfig {
  const workerUrl = "https://near-agent.kj95hgdgnn.workers.dev";

  return {
    assetsUrl: window.location.origin,
    env: "production",
    account: "near-agent",
    title: "NEAR Agent",
    hostUrl: workerUrl,
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
