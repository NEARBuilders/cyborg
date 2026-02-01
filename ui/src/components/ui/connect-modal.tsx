import { useState, useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { X } from "lucide-react";

interface ConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  redirect?: string;
}

export function ConnectModal({ isOpen, onClose, redirect = "/chat" }: ConnectModalProps) {
  const router = useRouter();
  const nearState = authClient.useNearState();
  const { data: session } = authClient.useSession();

  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isClosing) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.width = "100%";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
    };
  }, [isOpen, isClosing]);

  // If already authenticated, redirect
  if (session?.user && isOpen) {
    setTimeout(() => {
      handleClose();
      router.invalidate();
      throw router.navigate({ to: redirect });
    }, 100);
  }

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 150);
  };

  const recipient = "near-agent";
  const isWalletConnected = !!nearState?.accountId;

  // Handle sign-in response
  const handleSignInResponse = async (response: any) => {
    const accountId = nearState?.accountId;

    if (accountId) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const sessionData = await authClient.getSession();

      if (sessionData?.user) {
        toast.success(`Signed in as: ${accountId}`);
        await router.invalidate();
        handleClose();
        throw router.navigate({ to: redirect });
      } else {
        toast.success(`Signed in as: ${accountId}`);
        await router.invalidate();
        handleClose();
        throw router.navigate({ to: redirect });
      }
      setIsSigningIn(false);
    } else {
      toast.error("Sign-in completed but no account found");
      setIsSigningIn(false);
    }
  };

  // Handle sign-in error
  const onSignInError = (error: any) => {
    setIsSigningIn(false);
    const errorMsg = error?.message || String(error);
    toast.error(errorMsg);
  };

  // Sign in with already connected wallet
  const handleSignInOnly = async () => {
    setIsSigningIn(true);
    try {
      await authClient.requestSignIn.near(
        { recipient },
        {
          onSuccess: async () => {
            await authClient.signIn.near(
              { recipient },
              {
                onSuccess: handleSignInResponse,
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
                  onSuccess: handleSignInResponse,
                  onError: onSignInError,
                }
              );
            } catch (error) {
              onSignInError(error);
            }
          },
          onError: (error: any) => {
            setIsSigningIn(false);
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
  };

  if (!isOpen) return null;

  const isBottomSheet = isMobile;

  return (
    <div
      className={`fixed inset-0 z-50 ${isBottomSheet ? "flex items-end justify-center" : "flex items-center justify-center p-4"}`}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
          isClosing ? "opacity-0" : "opacity-100"
        }`}
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className={`relative bg-background shadow-2xl ${
          isBottomSheet
            ? `w-full max-h-[85vh] rounded-t-2xl transform transition-transform duration-200 ${
                isClosing ? "translate-y-full" : "translate-y-0"
              }`
            : `w-full max-w-md rounded-2xl transform transition-all duration-200 ${
                isClosing ? "scale-95 opacity-0" : "scale-100 opacity-100"
              }`
        } overflow-hidden flex flex-col`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border/50 bg-background/95 backdrop-supports-[backdrop-filter]">
          <h2 className="text-base sm:text-lg font-semibold text-foreground pr-4">
            {isWalletConnected ? "Sign In" : "Connect Wallet"}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1 -mr-1 rounded-lg hover:bg-muted/50"
            aria-label="Close"
          >
            <X className="size-5 sm:size-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground/70 mb-4">
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
                  className="w-full px-4 py-3 text-sm font-mono border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed rounded-xl"
                >
                  {isSigningIn ? "Signing in..." : `Sign in as ${nearState.accountId}`}
                </button>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={isSigningIn}
                  className="w-full px-4 py-2 text-xs font-mono text-muted-foreground/60 hover:text-muted-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Use different wallet
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleConnectAndSignIn}
                disabled={isSigningIn}
                className="w-full px-4 py-3 text-sm font-mono border border-border/50 hover:border-primary/50 bg-muted/10 hover:bg-primary/10 text-foreground hover:text-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed rounded-xl"
              >
                {isSigningIn ? "Signing in..." : "Sign in with NEAR"}
              </button>
            )}
          </div>
        </div>

        {/* Mobile drag handle */}
        {isBottomSheet && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-muted-foreground/20 rounded-full" />
        )}
      </div>
    </div>
  );
}
