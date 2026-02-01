import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "../../lib/auth-client";

type SearchParams = {
  redirect?: string;
  debug?: string;
};

export const Route = createFileRoute("/_layout/login")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    debug: typeof search.debug === "string" ? search.debug : undefined,
  }),
  beforeLoad: async ({ search }) => {
    // Check if already authenticated
    const authClient = (await import("../../lib/auth-client")).authClient;
    const { data: session } = await authClient.getSession();
    if (session?.user) {
      throw redirect({ to: search.redirect as string || "/chat" });
    }
  },
  component: LoginPage,
  head: () => {
    return {
      meta: [
        { title: "Sign In - Legion Social" },
        { name: "description", content: "Sign in to Legion Social with your NEAR account" },
        { property: "og:title", content: "Sign In - Legion Social" },
        { property: "og:description", content: "Sign in to Legion Social with your NEAR account" },
        { property: "og:image", content: `${typeof window !== "undefined" ? window.location.origin : ""}/og.jpg` },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: `${typeof window !== "undefined" ? window.location.origin : ""}/og.jpg` },
      ],
    };
  },
});

function LoginPage() {
  const router = useRouter();
  const { redirect, debug } = Route.useSearch();
  const { data: session } = authClient.useSession();
  const nearState = authClient.useNearState();

  const [isSigningIn, setIsSigningIn] = useState(false);
  const [debugInfo, setDebugInfo] = useState("");

  const addDebug = (msg: string) => {
    console.log(`[Auth Debug] ${msg}`);
    setDebugInfo((prev) => prev + `[${new Date().toLocaleTimeString()}] ${msg}\n`);
  };

  // If already authenticated, redirect
  if (session?.user) {
    router.invalidate();
    throw redirect({ to: redirect || "/chat" });
  }

  const recipient = "near-agent";
  const isWalletConnected = !!nearState?.accountId;

  // Handle successful sign-in
  const onSignInSuccess = async (accountId: string, response: any) => {
    addDebug(`✓ Sign-in success for: ${accountId}`);
    addDebug(`Response: ${JSON.stringify(response, null, 2)}`);
    addDebug(`Response has user: ${!!response?.user}`);
    addDebug(`Response user name: ${response?.user?.name || "none"}`);

    toast.success(`Signed in as: ${accountId}`);

    // Wait a moment for cookie to be set, then check session
    addDebug(`Checking session in 2s...`);
    setTimeout(async () => {
      const sessionData = await authClient.getSession();
      addDebug(`Session after delay: ${!!sessionData?.user}`);
      addDebug(`Session user: ${sessionData?.user?.name || "none"}`);
    }, 2000);

    // Invalidate router to trigger session refresh
    await router.invalidate();
  };

  // Handle sign-in error
  const onSignInError = (error: any) => {
    setIsSigningIn(false);
    const errorMsg = error?.message || String(error);
    const errorCode = error?.code || "UNKNOWN";

    addDebug(`✗ Error: ${errorCode} - ${errorMsg}`);

    // Detailed error messages for common issues
    let userMessage = errorMsg;
    if (errorMsg.includes("fetch") || errorMsg.includes("network")) {
      userMessage = "Network error - check your connection";
    } else if (errorMsg.includes("nonce") || errorMsg.includes("verification")) {
      userMessage = "Session expired - please try again";
    } else if (errorMsg.includes("signature") || errorMsg.includes("verify")) {
      userMessage = "Signature verification failed";
    } else if (errorMsg.includes("wallet") || errorMsg.includes("signer")) {
      userMessage = "Wallet error - make sure NEAR wallet is installed";
    }

    toast.error(`${userMessage}`);
  };

  // Get response data from better-auth signIn
  const handleSignInResponse = async (response: any) => {
    addDebug(`Sign-in response received`);
    // better-auth doesn't return user in response - cookie is set instead
    // Use the wallet accountId from nearState
    const accountId = nearState?.accountId;

    if (accountId) {
      addDebug(`Account ID from wallet: ${accountId}`);

      // Wait a bit for cookie to be processed, then check session
      await new Promise(resolve => setTimeout(resolve, 500));

      const sessionData = await authClient.getSession();
      addDebug(`Session check: ${!!sessionData?.user}`);
      addDebug(`Session user: ${sessionData?.user?.name || "none"}`);

      if (sessionData?.user) {
        addDebug(`✓ Sign-in successful!`);
        toast.success(`Signed in as: ${accountId}`);
        // Invalidate router to trigger session refresh across app
        await router.invalidate();
      } else {
        addDebug(`⚠ Sign-in completed but session not found`);
        toast.success(`Signed in as: ${accountId}`);
        // Still proceed - might be a timing issue
        await router.invalidate();
      }
      setIsSigningIn(false);
    } else {
      addDebug(`No account ID found`);
      toast.error("Sign-in completed but no account found");
      setIsSigningIn(false);
    }
  };

  // Debug: Check environment
  const checkEnvironment = async () => {
    const ua = navigator.userAgent;
    const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
    const isMobile = /Mobile|Android|iPhone|iPad/.test(ua);

    addDebug(`--- Environment ---`);
    addDebug(`User Agent: ${ua.substring(0, 100)}...`);
    addDebug(`Mobile: ${isMobile}`);
    addDebug(`Safari: ${isSafari}`);
    addDebug(`Cookies enabled: ${navigator.cookieEnabled}`);
    addDebug(`Origin: ${window.location.origin}`);

    // Test cookie functionality
    addDebug(`--- Testing cookies ---`);
    document.cookie = "test=1; SameSite=None; Secure";
    const testCookie = document.cookie.includes("test=1");
    addDebug(`Cross-site cookie test: ${testCookie ? "PASS" : "FAIL"}`);
    document.cookie = "test=; Max-Age=-9999";

    // Check session
    addDebug(`--- Session check ---`);
    try {
      const sessionData = await authClient.getSession();
      addDebug(`Session exists: ${!!sessionData?.user}`);
      addDebug(`Session user: ${sessionData?.user?.name || "none"}`);
    } catch (e) {
      addDebug(`Session check error: ${(e as Error).message}`);
    }

    addDebug(`---`);
  };

  // Sign in with already connected wallet (single signature)
  const handleSignInOnly = async () => {
    setIsSigningIn(true);
    const accountId = nearState?.accountId;
    addDebug(`Starting sign-in for: ${accountId}`);
    addDebug(`Recipient: ${recipient}`);

    try {
      // Step 1: Get nonce
      addDebug(`Step 1: Requesting nonce...`);
      await authClient.requestSignIn.near(
        { recipient },
        {
          onSuccess: async () => {
            addDebug(`Step 2: Nonce received, signing...`);
            // Step 2: Sign and verify
            await authClient.signIn.near(
              { recipient },
              {
                onSuccess: (response) => handleSignInResponse(response),
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
    addDebug(`Starting connect + sign-in flow...`);
    addDebug(`Recipient: ${recipient}`);

    try {
      // Step 1: Connect wallet and get nonce
      addDebug(`Step 1: Connecting wallet...`);
      await authClient.requestSignIn.near(
        { recipient },
        {
          onSuccess: async () => {
            const connectedAccountId = authClient.near.getAccountId();
            addDebug(`Wallet connected: ${connectedAccountId}`);
            addDebug(`Step 2: Requesting nonce...`);
            try {
              // Step 2: Sign and verify
              await authClient.signIn.near(
                { recipient },
                {
                  onSuccess: (response) => handleSignInResponse(response),
                  onError: onSignInError,
                }
              );
            } catch (error) {
              onSignInError(error);
            }
          },
          onError: (error: any) => {
            setIsSigningIn(false);
            const errorMsg = error?.message || String(error);
            addDebug(`Wallet connection failed: ${errorMsg}`);
            const errorMessage =
              error.code === "SIGNER_NOT_AVAILABLE"
                ? "NEAR wallet app not found. Please install a NEAR wallet."
                : error.message || "Failed to connect wallet";
            toast.error(errorMessage);
          },
        }
      );
    } catch (error) {
      setIsSigningIn(false);
      onSignInError(error);
    }
  };

  // Disconnect wallet
  const handleDisconnect = async () => {
    await authClient.near.disconnect();
    setDebugInfo("");
  };

  // Enable debug mode
  const toggleDebug = () => {
    if (!debugInfo) {
      checkEnvironment();
    } else {
      setDebugInfo("");
    }
  };

  return (
    <div className="min-h-[60vh] w-full flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-primary mb-1">Welcome</h1>
          <p className="text-sm text-muted-foreground/70">
            {isWalletConnected
              ? `Connected as ${nearState.accountId}`
              : "Connect your NEAR wallet to continue"}
          </p>
        </div>

        {debugInfo && (
          <div className="p-3 text-xs font-mono bg-muted rounded border border-border/50 max-h-60 overflow-y-auto">
            <pre className="whitespace-pre-wrap break-words">{debugInfo}</pre>
          </div>
        )}

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

        {/* Debug toggle - always visible on mobile, small on desktop */}
        <button
          type="button"
          onClick={toggleDebug}
          className="w-full text-xs text-muted-foreground/40 hover:text-muted-foreground py-2"
        >
          {debugInfo ? "Hide debug info" : "Debug info"}
        </button>
      </div>
    </div>
  );
}
