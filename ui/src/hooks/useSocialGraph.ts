import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "../lib/auth-client";

// =============================================================================
// TYPES
// =============================================================================

export interface FollowerInfo {
  accountId: string;
  profile?: any;
  followedAt?: string;
}

export interface SocialListResponse {
  accounts?: string[];
  count: number;
  meta: {
    has_more: boolean;
    next_cursor?: string;
    truncated?: boolean;
  };
}

// =============================================================================
// QUERY KEYS
// =============================================================================

export const socialKeys = {
  all: ["social"] as const,
  followers: (accountId: string) => [...socialKeys.all, "followers", accountId] as const,
  following: (accountId: string) => [...socialKeys.all, "following", accountId] as const,
  isFollowing: (accountId: string, targetAccountId: string) =>
    [...socialKeys.all, "following", accountId, targetAccountId] as const,
};

// =============================================================================
// API HELPERS (Direct HTTP calls, NOT oRPC)
// =============================================================================

async function fetchApi(endpoint: string, options?: RequestInit) {
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }

  return response.json();
}

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Get followers list for an account
 */
export function useFollowers(accountId: string | undefined, limit = 50, offset = 0) {
  return useQuery({
    queryKey: socialKeys.followers(accountId || "").concat(limit, offset),
    queryFn: async () => {
      if (!accountId) throw new Error("Account ID required");
      const params = new URLSearchParams({
        account_id: accountId,
        limit: String(limit),
        offset: String(offset),
      });
      return fetchApi(`/social/followers?${params}`) as Promise<SocialListResponse>;
    },
    enabled: !!accountId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Get following list for an account
 */
export function useFollowing(accountId: string | undefined, limit = 50, offset = 0) {
  return useQuery({
    queryKey: socialKeys.following(accountId || "").concat(limit, offset),
    queryFn: async () => {
      if (!accountId) throw new Error("Account ID required");
      const params = new URLSearchParams({
        account_id: accountId,
        limit: String(limit),
        offset: String(offset),
      });
      return fetchApi(`/social/following?${params}`) as Promise<SocialListResponse>;
    },
    enabled: !!accountId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Check if current user is following target account
 */
export function useIsFollowing(accountId: string | undefined, targetAccountId: string | undefined) {
  return useQuery({
    queryKey: socialKeys.isFollowing(accountId || "", targetAccountId || ""),
    queryFn: async () => {
      if (!accountId || !targetAccountId) throw new Error("Both account IDs required");
      const params = new URLSearchParams({
        account_id: accountId,
        target_account_id: targetAccountId,
      });
      return fetchApi(`/social/is-following?${params}`) as Promise<{ isFollowing: boolean }>;
    },
    enabled: !!accountId && !!targetAccountId,
    staleTime: 2 * 60 * 1000, // 2 minutes - follow status changes more frequently
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Follow/Unfollow mutation
 * Uses client-side wallet signing via near-kit
 */
export function useFollowUnfollow() {
  const queryClient = useQueryClient();

  const followMutation = useMutation({
    mutationFn: async (targetAccountId: string) => {
      // Get transaction from API
      const result = await fetchApi("/social/follow", {
        method: "POST",
        body: JSON.stringify({ targetAccountId }),
      });

      if (!result.success || !result.transaction) {
        throw new Error("Failed to prepare follow transaction");
      }

      // Sign transaction with wallet (client-side)
      const nearAuth = authClient.near;
      if (!nearAuth) {
        throw new Error("NEAR wallet not connected");
      }

      const walletAccountId = nearAuth.getAccountId();
      if (!walletAccountId) {
        throw new Error("No wallet connected");
      }

      const near = nearAuth.getNearClient();

      // Note: .functionCall handles JSON serialization automatically
      // The FastData indexer expects KV pairs directly as args, NOT wrapped in data
      const tx = await near
        .transaction(walletAccountId)
        .functionCall(
          result.transaction.contractId,
          result.transaction.methodName,
          {
            [`graph/follow/${targetAccountId}`]: "",
          },
          {
            gas: result.transaction.gas,
            attachedDeposit: "0", // No deposit for FastData
          }
        )
        .send();

      return { targetAccountId, txHash: tx.transaction.hash };
    },
    onSuccess: async (data) => {
      toast.success("Followed successfully!");

      // Invalidate related queries
      await queryClient.invalidateQueries({
        queryKey: socialKeys.following(data.targetAccountId),
      });
      // Also invalidate isFollowing queries for this target
      queryClient.invalidateQueries({
        queryKey: socialKeys.all,
        refetchType: "none",
      });
    },
    onError: (error) => {
      console.error("Follow error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to follow user"
      );
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async (targetAccountId: string) => {
      // Get transaction from API
      const result = await fetchApi("/social/unfollow", {
        method: "POST",
        body: JSON.stringify({ targetAccountId }),
      });

      if (!result.success || !result.transaction) {
        throw new Error("Failed to prepare unfollow transaction");
      }

      // Sign transaction with wallet (client-side)
      const nearAuth = authClient.near;
      if (!nearAuth) {
        throw new Error("NEAR wallet not connected");
      }

      const walletAccountId = nearAuth.getAccountId();
      if (!walletAccountId) {
        throw new Error("No wallet connected");
      }

      const near = nearAuth.getNearClient();

      // Note: .functionCall handles JSON serialization automatically
      // The FastData indexer expects KV pairs directly as args, NOT wrapped in data
      const tx = await near
        .transaction(walletAccountId)
        .functionCall(
          result.transaction.contractId,
          result.transaction.methodName,
          {
            [`graph/follow/${targetAccountId}`]: null, // null = unfollow/delete
          },
          {
            gas: result.transaction.gas,
            attachedDeposit: "0", // No deposit for FastData
          }
        )
        .send();

      return { targetAccountId, txHash: tx.transaction.hash };
    },
    onSuccess: async (data) => {
      toast.success("Unfollowed successfully!");

      // Invalidate related queries
      await queryClient.invalidateQueries({
        queryKey: socialKeys.following(data.targetAccountId),
      });
      // Also invalidate isFollowing queries for this target
      queryClient.invalidateQueries({
        queryKey: socialKeys.all,
        refetchType: "none",
      });
    },
    onError: (error) => {
      console.error("Unfollow error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to unfollow user"
      );
    },
  });

  return {
    follow: followMutation.mutate,
    unfollow: unfollowMutation.mutate,
    isPending: followMutation.isPending || unfollowMutation.isPending,
  };
}
