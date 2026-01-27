import type { ClientRuntimeConfig } from "./types";

export async function hydrate() {
  const runtimeConfig = (window as any).__RUNTIME_CONFIG__ as ClientRuntimeConfig | undefined;

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

// Run once
if (typeof window !== "undefined" && (window as any).__RUNTIME_CONFIG__ && !(window as any).__HYDRATED__) {
  (window as any).__HYDRATED__ = true;
  hydrate();
}
