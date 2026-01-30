import type { ClientRuntimeConfig } from "./types";

// Auto-detect Cloudflare Pages deployment and set runtime config
function getOrCreateRuntimeConfig(): ClientRuntimeConfig | undefined {
  // Check if already set (by host server)
  if ((window as any).__RUNTIME_CONFIG__) {
    return (window as any).__RUNTIME_CONFIG__;
  }

  // Auto-detect Cloudflare Pages deployment
  const hostname = window.location.hostname;
  if (hostname.includes('.pages.dev') || hostname.includes('near-agent')) {
    const workerUrl = 'https://near-agent.kj95hgdgnn.workers.dev';
    const config: ClientRuntimeConfig = {
      assetsUrl: window.location.origin,
      env: 'production',
      account: 'example.near',
      title: 'NEAR Agent',
      hostUrl: workerUrl,
      apiBase: '/api',
      rpcBase: '/api/rpc',
    };
    (window as any).__RUNTIME_CONFIG__ = config;
    console.log('[Hydrate] Auto-configured for Cloudflare Pages');
    return config;
  }

  return undefined;
}

export async function hydrate() {
  const runtimeConfig = getOrCreateRuntimeConfig();

  if (!runtimeConfig) {
    console.error("[Hydrate] No runtime config");
    return;
  }

  const { createRoot } = await import("react-dom/client");
  const { RouterProvider } = await import("@tanstack/react-router");
  const { QueryClientProvider } = await import("@tanstack/react-query");
  const { createRouter } = await import("./router");

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

export default hydrate;

// Check if we should auto-hydrate
function shouldAutoHydrate(): boolean {
  if (typeof window === "undefined") return false;
  if ((window as any).__HYDRATED__) return false;

  // Already has runtime config (injected by host)
  if ((window as any).__RUNTIME_CONFIG__) return true;

  // Cloudflare Pages deployment - will create config during hydration
  const hostname = window.location.hostname;
  if (hostname.includes('.pages.dev') || hostname.includes('near-agent')) return true;

  return false;
}

// Run once
if (shouldAutoHydrate()) {
  (window as any).__HYDRATED__ = true;
  hydrate();
}
