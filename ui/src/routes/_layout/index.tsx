import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { sessionQueryOptions } from "../../lib/session";

export const Route = createFileRoute("/_layout/")({
  component: LandingPage,
});

function LandingPage() {
  const { data: session } = useQuery(sessionQueryOptions);
  const isLoggedIn = !!session?.user;

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
      <h1 className="text-3xl font-bold mb-4">Welcome</h1>
      <p className="text-muted-foreground mb-8">
        Connect with the NEAR ecosystem
      </p>
      {!isLoggedIn && (
        <Link
          to="/login"
          className="px-6 py-3 text-sm font-mono border border-border hover:border-primary/50 bg-muted/20 hover:bg-muted/40 transition-all rounded-lg"
        >
          Sign in with NEAR
        </Link>
      )}
    </div>
  );
}
