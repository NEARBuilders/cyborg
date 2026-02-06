import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "../lib/auth-client";

// =============================================================================
// TYPES
// =============================================================================

export interface LegionFollowerInfo {
  accountId: string;
  profile?: any;
}

export interface LegionSocialListResponse {
  followers?: LegionFollowerInfo[];
  following?: LegionFollowerInfo[];
  total: number;
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// =============================================================================
// QUERY KEYS
// =============================================================================

export const legionKeys = {
  all: ["legion"] as const,
  followers: (accountId: string) => [...legionKeys.all, "followers", accountId] as const,
  following: (accountId: string) => [...legionKeys.all, "following", accountId] as const,
  isFollowing: (accountId: string, targetAccountId: string) =>
    [...legionKeys.all, "following", accountId, targetAccountId] as const,
  stats: (accountId: string) => [...legionKeys.all, "stats", accountId] as const,
};

// =============================================================================
// API HELPERS (Direct HTTP calls)
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
 * Get Legion followers list for an account
 */
export function useLegionFollowers(accountId: string | undefined, limit = 50, offset = 0) {
  return useQuery({
    queryKey: legionKeys.followers(accountId || "").concat(limit, offset),
    queryFn: async () => {
      if (!accountId) throw new Error("Account ID required");
      return fetchApi(
        `/legion/followers/${accountId}?limit=${limit}&offset=${offset}`
      ) as Promise<LegionSocialListResponse>;
    },
    enabled: !!accountId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Get Legion following list for an account
 */
export function useLegionFollowing(accountId: string | undefined, limit = 50, offset = 0) {
  return useQuery({
    queryKey: legionKeys.following(accountId || "").concat(limit, offset),
    queryFn: async () => {
      if (!accountId) throw new Error("Account ID required");
      return fetchApi(
        `/legion/following/${accountId}?limit=${limit}&offset=${offset}`
      ) as Promise<LegionSocialListResponse>;
    },
    enabled: !!accountId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Check if current user is following target account in Legion graph
 */
export function useLegionIsFollowing(accountId: string | undefined, targetAccountId: string | undefined) {
  return useQuery({
    queryKey: legionKeys.isFollowing(accountId || "", targetAccountId || ""),
    queryFn: async () => {
      if (!accountId || !targetAccountId) throw new Error("Both account IDs required");
      return fetchApi(
        `/legion/following/${accountId}/check/${targetAccountId}`
      ) as Promise<{ isFollowing: boolean }>;
    },
    enabled: !!accountId && !!targetAccountId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Get Legion stats (followers/following counts)
 */
export function useLegionStats(accountId: string | undefined) {
  return useQuery({
    queryKey: legionKeys.stats(accountId || ""),
    queryFn: async () => {
      if (!accountId) throw new Error("Account ID required");
      return fetchApi(
        `/legion/stats/${accountId}`
      ) as Promise<{ followers: number; following: number }>;
    },
    enabled: !!accountId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Legion Follow/Unfollow mutation
 * Requires both accounts to hold Legion NFTs
 */
export function useLegionFollowUnfollow() {
  const queryClient = useQueryClient();

  const followMutation = useMutation({
    mutationFn: async (targetAccountId: string) => {
      // Get transaction from API
      const result = await fetchApi("/legion/follow", {
        method: "POST",
        body: JSON.stringify({ targetAccountId }),
      });

      if (!result.success || !result.transaction) {
        throw new Error(result.error || "Failed to prepare follow transaction");
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

      const tx = await near
        .transaction(walletAccountId)
        .functionCall(
          result.transaction.contractId,
          result.transaction.methodName,
          result.transaction.args,
          {
            gas: result.transaction.gas,
            attachedDeposit: result.transaction.deposit,
          }
        )
        .send();

      return { targetAccountId, txHash: tx.transaction.hash };
    },
    onSuccess: async (data) => {
      toast.success("Followed in Legion graph!");

      // Invalidate related queries
      await queryClient.invalidateQueries({
        queryKey: legionKeys.following(data.targetAccountId),
      });
      queryClient.invalidateQueries({
        queryKey: legionKeys.all,
        refetchType: "none",
      });
    },
    onError: (error) => {
      console.error("[Legion] Follow error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to follow in Legion graph"
      );
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async (targetAccountId: string) => {
      const result = await fetchApi("/legion/unfollow", {
        method: "POST",
        body: JSON.stringify({ targetAccountId }),
      });

      if (!result.success || !result.transaction) {
        throw new Error(result.error || "Failed to prepare unfollow transaction");
      }

      const nearAuth = authClient.near;
      if (!nearAuth) {
        throw new Error("NEAR wallet not connected");
      }

      const walletAccountId = nearAuth.getAccountId();
      if (!walletAccountId) {
        throw new Error("No wallet connected");
      }

      const near = nearAuth.getNearClient();

      const tx = await near
        .transaction(walletAccountId)
        .functionCall(
          result.transaction.contractId,
          result.transaction.methodName,
          result.transaction.args,
          {
            gas: result.transaction.gas,
            attachedDeposit: result.transaction.deposit,
          }
        )
        .send();

      return { targetAccountId, txHash: tx.transaction.hash };
    },
    onSuccess: async (data) => {
      toast.success("Unfollowed in Legion graph!");

      // Invalidate related queries
      await queryClient.invalidateQueries({
        queryKey: legionKeys.following(data.targetAccountId),
      });
      queryClient.invalidateQueries({
        queryKey: legionKeys.all,
        refetchType: "none",
      });
    },
    onError: (error) => {
      console.error("[Legion] Unfollow error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to unfollow in Legion graph"
      );
    },
  });

  return {
    follow: followMutation.mutate,
    unfollow: unfollowMutation.mutate,
    isPending: followMutation.isPending || unfollowMutation.isPending,
  };
}
