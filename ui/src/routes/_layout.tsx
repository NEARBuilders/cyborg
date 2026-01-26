import { useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Outlet,
  useRouter,
} from "@tanstack/react-router";
import { Header, Footer } from "../components/layout";
import { authClient } from "../lib/auth-client";
import { sessionQueryOptions } from "../lib/session";
import { queryClient } from "../utils/orpc";

export const Route = createFileRoute("/_layout")({
  beforeLoad: async ({ context }) => {
    await context.queryClient.ensureQueryData(sessionQueryOptions);
  },
  component: Layout,
});

function Layout() {
  const router = useRouter();
  const { data: session } = useSuspenseQuery(sessionQueryOptions);
  const accountId = session?.user?.id;
  const userRole = (session?.user as { role?: string })?.role;

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
      await authClient.near.disconnect();
      queryClient.invalidateQueries({ queryKey: ["session"] });
      router.invalidate();
      window.location.href = "/";
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  return (
    <div className="h-dvh w-full flex flex-col bg-background text-foreground overflow-hidden">
      <Header
        accountId={accountId}
        userRole={userRole}
        onSignOut={handleSignOut}
      />

      {/* Main content area - this is the ONLY scroll container */}
      <main className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
