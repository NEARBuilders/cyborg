import type { ClientRuntimeConfig } from "./types";

export async function hydrate() {
  console.log("[Hydrate] Starting...");

  const runtimeConfig = (window as { __RUNTIME_CONFIG__?: ClientRuntimeConfig })
    .__RUNTIME_CONFIG__;
  if (!runtimeConfig) {
    console.error("[Hydrate] No runtime config found");
    return;
  }

  const { hydrateRoot, createRoot } = await import("react-dom/client");
  const { QueryClientProvider } = await import("@tanstack/react-query");
  const { createRouter } = await import("./router");

  const { router, queryClient } = createRouter({
    context: {
      assetsUrl: runtimeConfig.assetsUrl,
      runtimeConfig,
    },
  });

  const rootElement = document.getElementById("root");
  const hasSSRContent = rootElement && rootElement.innerHTML.trim() !== "";
  const hasSSRBootstrap = !!(window as any).$_TSR;

  if (hasSSRContent && hasSSRBootstrap) {
    // SSR mode - hydrate with RouterClient
    console.log("[Hydrate] SSR mode, using hydrateRoot");
    const { RouterClient } = await import("@tanstack/react-router/ssr/client");
    hydrateRoot(
      document,
      <QueryClientProvider client={queryClient}>
        <RouterClient router={router} />
      </QueryClientProvider>,
    );
  } else {
    // Client-only mode - render with RouterProvider
    console.log("[Hydrate] Client-only mode, using createRoot");
    const { RouterProvider } = await import("@tanstack/react-router");
    if (rootElement) {
      createRoot(rootElement).render(
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      );
    }
  }

  console.log("[Hydrate] Complete!");
}

export default hydrate;

// Auto-run in dev mode when loaded directly
if (typeof window !== "undefined" && window.__RUNTIME_CONFIG__) {
  hydrate();
}
