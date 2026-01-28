import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { authClient } from "../lib/auth-client";
import { sessionQueryOptions } from "../lib/session";
import { queryClient } from "../utils/orpc";

export function UserNav() {
  const router = useRouter();
  const { data: session } = useQuery(sessionQueryOptions);
  const accountId = session?.user?.id;
  const nearName = session?.user?.nearAccountId || session?.user?.id;

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

  if (nearName) {
    return (
      <>
        <Link
          to="/profile/$nearName"
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
