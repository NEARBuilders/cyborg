import { authClient } from "@/lib/auth-client";
import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/_authenticated")({
  beforeLoad: async ({ location }) => {
    const { data: session } = await authClient.getSession();
    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.pathname,
        },
      });
    }
    return { session };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <div className="h-full overflow-y-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6">
      <Outlet />
    </div>
  );
}
