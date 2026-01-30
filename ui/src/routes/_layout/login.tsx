import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "../../lib/auth-client";

type SearchParams = {
  redirect?: string;
};

export const Route = createFileRoute("/_layout/login")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const { data: session } = await authClient.getSession();
    if (session?.user) {
      throw redirect({ to: search.redirect || "/chat" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const { redirect } = Route.useSearch();
  const session = authClient.useSession();
  const nearState = authClient.useNearState();

  const [isSigningIn, setIsSigningIn] = useState(false);

  const recipient = window.__RUNTIME_CONFIG__?.account ?? "every.near";
  const isWalletConnected = !!nearState?.accountId;

  // Handle successful sign-in
  const onSignInSuccess = async (accountId: string) => {
    setIsSigningIn(false);
    await session.refetch();
    router.invalidate();
    navigate({ to: redirect ?? "/", replace: true });
    toast.success(`Signed in as: ${accountId}`);
  };

  // Handle sign-in error
  const onSignInError = (error: any) => {
    setIsSigningIn(false);
    console.error("NEAR sign in error:", error);
    toast.error(error instanceof Error ? error.message : "Authentication failed");
  };

  // Sign in with already connected wallet (single signature)
  const handleSignInOnly = async () => {
    setIsSigningIn(true);
    const accountId = nearState?.accountId;

    try {
      // Need to get nonce first via requestSignIn, but wallet is already connected
      // so it should skip the wallet modal
      await authClient.requestSignIn.near(
        { recipient },
        {
          onSuccess: async () => {
            await authClient.signIn.near(
              { recipient },
              {
                onSuccess: () => onSignInSuccess(accountId!),
                onError: onSignInError,
              }
            );
          },
          onError: onSignInError,
        }
      );
    } catch (error) {
      onSignInError(error);
    }
  };

  // Full flow: connect wallet then sign in
  const handleConnectAndSignIn = async () => {
    setIsSigningIn(true);
    try {
      await authClient.requestSignIn.near(
        { recipient },
        {
          onSuccess: async () => {
            const connectedAccountId = authClient.near.getAccountId();
            try {
              await authClient.signIn.near(
                { recipient },
                {
                  onSuccess: () => onSignInSuccess(connectedAccountId!),
                  onError: onSignInError,
                }
              );
            } catch (error) {
              onSignInError(error);
            }
          },
          onError: (error: any) => {
            setIsSigningIn(false);
            console.error("Wallet connection failed:", error);
            const errorMessage =
              error.code === "SIGNER_NOT_AVAILABLE"
                ? "NEAR wallet not available"
                : error.message || "Failed to connect wallet";
            toast.error(errorMessage);
          },
        }
      );
    } catch (error) {
      setIsSigningIn(false);
      console.error("Sign in error:", error);
      toast.error("Failed to sign in");
    }
  };

  // Disconnect wallet
  const handleDisconnect = async () => {
    await authClient.near.disconnect();
  };

  return (
    <div className="min-h-[60vh] w-full flex items-center justify-center">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-primary mb-1">Welcome</h1>
          <p className="text-sm text-muted-foreground/70">
            {isWalletConnected
              ? `Connected as ${nearState.accountId}`
              : "Connect your NEAR wallet to continue"}
          </p>
        </div>

        {isWalletConnected ? (
          <>
            <button
              type="button"
              onClick={handleSignInOnly}
              disabled={isSigningIn}
              className="w-full px-4 py-3 text-sm font-mono border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSigningIn ? "signing in..." : `sign in as ${nearState.accountId}`}
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={isSigningIn}
              className="w-full px-4 py-2 text-xs font-mono text-muted-foreground/60 hover:text-muted-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              use different wallet
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleConnectAndSignIn}
            disabled={isSigningIn}
            className="w-full px-4 py-3 text-sm font-mono border border-border/50 hover:border-primary/50 bg-muted/10 hover:bg-primary/10 text-foreground hover:text-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSigningIn ? "signing in..." : "sign in with near"}
          </button>
        )}
      </div>
    </div>
  );
}
