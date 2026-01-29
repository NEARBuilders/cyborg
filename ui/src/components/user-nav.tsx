import { Link, useRouter } from "@tanstack/react-router";
import { authClient } from "../lib/auth-client";
import { queryClient } from "../utils/orpc";

export function UserNav() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const nearState = authClient.useNearState();

  // Get account ID from multiple sources:
  // 1. nearState from wallet connection (most reliable when connected)
  // 2. session.user.nearAccount from server session
  // 3. session.user.name as fallback (set to accountId on user creation)
  const nearName =
    nearState?.accountId ||
    session?.user?.nearAccount?.accountId ||
    session?.user?.name;

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

  if (session?.user && nearName) {
    return (
      <>
        <Link
          to="/profile/$accountId"
          params={{ accountId: nearName }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
        >
          {nearName}
        </Link>
        <Link
          to="/builders"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
        >
          builders
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
