import { Link, useRouter } from "@tanstack/react-router";
import { authClient } from "../lib/auth-client";
import { queryClient } from "../utils/orpc";

export function UserNav() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const nearState = authClient.useNearState();

  // Get actual account ID (for profile link) and display name (for UI)
  const accountId =
    nearState?.accountId ||
    (session?.user as any)?.nearAccount?.accountId ||
    session?.user?.name;
  const displayName = session?.user?.name || nearState?.accountId;

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
      await authClient.near.disconnect();
      queryClient.invalidateQueries({ queryKey: ["session"] });
      router.invalidate();
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  if (session?.user && accountId) {
    return (
      <>
        <Link
          to="/profile/$accountId"
          params={{ accountId }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
        >
          {displayName}
        </Link>

        <button
          type="button"
          onClick={handleSignOut}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
        >
          sign out
        </button>
      </>
    );
  }

  return (
    <Link
      to="/login"
      className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
    >
      login
    </Link>
  );
}
