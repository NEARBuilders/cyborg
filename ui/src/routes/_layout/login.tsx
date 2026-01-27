import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "../../lib/auth-client";
import { queryClient } from "../../utils/orpc";

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

  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [isSigningInWithNear, setIsSigningInWithNear] = useState(false);
  const [isDisconnectingWallet, setIsDisconnectingWallet] = useState(false);

  const accountId = authClient.near.getAccountId();

  const handleWalletConnect = async () => {
    setIsConnectingWallet(true);
    try {
      await authClient.requestSignIn.near(
        { recipient: window.__RUNTIME_CONFIG__?.account ?? "every.near" },
        {
          onSuccess: () => {
            setIsConnectingWallet(false);
            toast.success("Wallet connected");
          },
          onError: (error: any) => {
            setIsConnectingWallet(false);
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
      setIsConnectingWallet(false);
      console.error("Wallet connection error:", error);
      toast.error("Failed to connect to NEAR wallet");
    }
  };

  const handleNearSignIn = async () => {
    setIsSigningInWithNear(true);
    try {
      await authClient.signIn.near(
        { recipient: window.__RUNTIME_CONFIG__?.account ?? "every.near" },
        {
          onSuccess: () => {
            setIsSigningInWithNear(false);
            queryClient.invalidateQueries({ queryKey: ['session'] });
            router.invalidate();
            navigate({ to: redirect ?? "/", replace: true });
            toast.success(`Signed in as: ${accountId}`);
          },
          onError: (error: any) => {
            setIsSigningInWithNear(false);
            console.error("NEAR sign in error:", error);

            if ((error as any)?.code === "NONCE_NOT_FOUND") {
              toast.error("Session expired. Please reconnect your wallet.");
              handleWalletDisconnect();
              return;
            }

            toast.error(
              error instanceof Error ? error.message : "Authentication failed"
            );
          },
        }
      );
    } catch (error) {
      setIsSigningInWithNear(false);
      console.error("NEAR sign in error:", error);

      if ((error as any)?.code === "NONCE_NOT_FOUND") {
        toast.error("Session expired. Please reconnect your wallet.");
        handleWalletDisconnect();
        return;
      }

      toast.error("Authentication failed");
    }
  };

  const handleWalletDisconnect = async () => {
    setIsDisconnectingWallet(true);
    try {
      await authClient.signOut();
      await authClient.near.disconnect();
      queryClient.invalidateQueries({ queryKey: ['session'] });
      router.invalidate();
      setIsDisconnectingWallet(false);
      toast.success("Wallet disconnected successfully");
    } catch (error) {
      setIsDisconnectingWallet(false);
      console.error("Wallet disconnect error:", error);
      toast.error("Failed to disconnect wallet");
    }
  };

  const isLoading =
    isConnectingWallet ||
    isSigningInWithNear ||
    isDisconnectingWallet;

  return (
    <div className="min-h-[60vh] w-full flex items-center justify-center">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-primary mb-1">Welcome</h1>
          <p className="text-sm text-muted-foreground/70">
            Connect your NEAR wallet to continue
          </p>
        </div>

        {!accountId ? (
          <button
            type="button"
            onClick={handleWalletConnect}
            disabled={isLoading}
            className="w-full px-4 py-3 text-sm font-mono border border-border/50 hover:border-primary/50 bg-muted/10 hover:bg-primary/10 text-foreground hover:text-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConnectingWallet ? "connecting..." : "connect near wallet"}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={handleNearSignIn}
              disabled={isLoading}
              className="w-full px-4 py-3 text-sm font-mono border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSigningInWithNear
                ? "signing in..."
                : `sign in as ${accountId}`}
            </button>
            <button
              type="button"
              onClick={handleWalletDisconnect}
              disabled={isLoading}
              className="w-full px-4 py-2 text-xs font-mono text-muted-foreground/60 hover:text-muted-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDisconnectingWallet ? "disconnecting..." : "disconnect"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
