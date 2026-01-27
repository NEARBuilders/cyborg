import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import type { RouterContext } from "@/types";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});

function RootComponent() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <Outlet />
      <Toaster position="bottom-right" richColors closeButton />
    </ThemeProvider>
  );
}
