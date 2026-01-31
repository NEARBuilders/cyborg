/**
 * Hook for background NFT check
 * Called when visiting builder/profile pages to add user to list if they have NFT
 * Doesn't block page load - runs silently in background
 */

import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";

interface BackgroundCheckResult {
  added: boolean;
  contract?: string;
  tokenId?: string;
}

interface BackgroundCheckError {
  checked: boolean;
  error: string;
}

function getApiBaseUrl(): string {
  if (typeof window === "undefined") return "";
  // Always use same-origin to avoid CORS issues
  // Cloudflare Pages middleware proxies /api/* requests to the worker
  return window.location.origin;
}

/**
 * Simple fire-and-forget background check
 * Call this when user visits a builder/profile page
 */
export function useBackgroundNftCheck() {
  const mutation = useMutation<
    BackgroundCheckResult,
    Error,
    { accountId: string }
  >({
    mutationFn: async ({ accountId }) => {
      const baseUrl = getApiBaseUrl();

      const response = await fetch(`${baseUrl}/api/indexers/background-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Background check failed: ${response.status}`);
      }

      return response.json() as BackgroundCheckResult | BackgroundCheckError;
    },
    retry: false,
  });

  const check = useCallback((accountId: string) => {
    if (!accountId) return;

    mutation.mutate({ accountId }, {
      onError: (error) => {
        console.warn("[BackgroundNftCheck] Check failed:", error);
      },
    });
  }, [mutation]);

  return {
    check,
    isChecking: mutation.isPending,
  };
}
