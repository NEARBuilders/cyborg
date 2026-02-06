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
 * Get followers list for an account
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
 * Get following list for an account
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
 * Check if current user is following target account in the social graph
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
 * Get stats (followers/following counts)
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
 * Follow/Unfollow mutation with optimistic updates
 */
export function useLegionFollowUnfollow() {
  const queryClient = useQueryClient();
  const nearAuth = authClient.near;

  const getCurrentAccountId = () => {
    return nearAuth?.getAccountId();
  };

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
    onMutate: async (targetAccountId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: legionKeys.all });

      // Snapshot previous values
      const currentAccountId = getCurrentAccountId();
      if (!currentAccountId) return { previousIsFollowing: undefined, previousFollowing: undefined, previousStats: undefined, currentAccountId: undefined, targetAccountId };

      // Snapshot and optimistically update isFollowing query
      const isFollowingQueryKey = legionKeys.isFollowing(currentAccountId, targetAccountId);
      const previousIsFollowing = queryClient.getQueryData(isFollowingQueryKey);
      queryClient.setQueryData(isFollowingQueryKey, { isFollowing: true });

      // Optimistically update following list
      const followingQueryKey = legionKeys.following(currentAccountId).concat(50, 0);
      const previousFollowing = queryClient.getQueryData(followingQueryKey);
      queryClient.setQueryData(followingQueryKey, (old: LegionSocialListResponse | undefined) => ({
        total: (old?.total || 0) + 1,
        followers: old?.followers,
        following: [...(old?.following || []), { accountId: targetAccountId }],
        pagination: old?.pagination || { limit: 50, offset: 0, hasMore: false },
      }));

      // Optimistically update stats
      const statsQueryKey = legionKeys.stats(currentAccountId);
      const previousStats = queryClient.getQueryData(statsQueryKey);
      queryClient.setQueryData(statsQueryKey, (old: { followers: number; following: number } | undefined) => ({
        followers: old?.followers || 0,
        following: (old?.following || 0) + 1,
      }));

      return { previousIsFollowing, previousFollowing, previousStats, currentAccountId, targetAccountId };
    },
    onError: (error, variables, context) => {
      console.error("[Follow] Error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to follow"
      );

      // Rollback all optimistic updates
      if (context) {
        const { previousIsFollowing, previousFollowing, previousStats, currentAccountId, targetAccountId } = context;

        // Rollback isFollowing query
        if (previousIsFollowing !== undefined && currentAccountId && targetAccountId) {
          queryClient.setQueryData(
            legionKeys.isFollowing(currentAccountId, targetAccountId),
            previousIsFollowing
          );
        }

        // Rollback following list
        if (previousFollowing !== undefined && currentAccountId) {
          queryClient.setQueryData(
            legionKeys.following(currentAccountId).concat(50, 0),
            previousFollowing
          );
        }

        // Rollback stats
        if (previousStats !== undefined && currentAccountId) {
          queryClient.setQueryData(
            legionKeys.stats(currentAccountId),
            previousStats
          );
        }
      }
    },
    onSuccess: async (data) => {
      toast.success("Followed!");

      // Invalidate cache on backend for both accounts
      try {
        if (data?.targetAccountId) {
          await fetch("/api/legion/invalidate-cache", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accountIds: [data.targetAccountId],
            }),
          });
        }
      } catch (error) {
        console.error("[Cache] Failed to invalidate:", error);
        // Non-critical, so don't show error to user
      }
    },
    onSettled: async (data, error, targetAccountId) => {
      // Refetch to ensure consistency
      await queryClient.invalidateQueries({
        queryKey: legionKeys.all,
        refetchType: "none",
      });
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
    onMutate: async (targetAccountId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: legionKeys.all });

      // Snapshot previous values
      const currentAccountId = getCurrentAccountId();
      if (!currentAccountId) return { previousIsFollowing: undefined, previousFollowing: undefined, previousStats: undefined, currentAccountId: undefined, targetAccountId };

      // Snapshot and optimistically update isFollowing query
      const isFollowingQueryKey = legionKeys.isFollowing(currentAccountId, targetAccountId);
      const previousIsFollowing = queryClient.getQueryData(isFollowingQueryKey);
      queryClient.setQueryData(isFollowingQueryKey, { isFollowing: false });

      // Optimistically update following list
      const followingQueryKey = legionKeys.following(currentAccountId).concat(50, 0);
      const previousFollowing = queryClient.getQueryData(followingQueryKey);
      queryClient.setQueryData(followingQueryKey, (old: LegionSocialListResponse | undefined) => ({
        total: Math.max((old?.total || 0) - 1, 0),
        followers: old?.followers,
        following: (old?.following || []).filter((f) => f.accountId !== targetAccountId),
        pagination: old?.pagination || { limit: 50, offset: 0, hasMore: false },
      }));

      // Optimistically update stats
      const statsQueryKey = legionKeys.stats(currentAccountId);
      const previousStats = queryClient.getQueryData(statsQueryKey);
      queryClient.setQueryData(statsQueryKey, (old: { followers: number; following: number } | undefined) => ({
        followers: old?.followers || 0,
        following: Math.max((old?.following || 0) - 1, 0),
      }));

      return { previousIsFollowing, previousFollowing, previousStats, currentAccountId, targetAccountId };
    },
    onError: (error, variables, context) => {
      console.error("[Unfollow] Error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to unfollow"
      );

      // Rollback all optimistic updates
      if (context) {
        const { previousIsFollowing, previousFollowing, previousStats, currentAccountId, targetAccountId } = context;

        // Rollback isFollowing query
        if (previousIsFollowing !== undefined && currentAccountId && targetAccountId) {
          queryClient.setQueryData(
            legionKeys.isFollowing(currentAccountId, targetAccountId),
            previousIsFollowing
          );
        }

        // Rollback following list
        if (previousFollowing !== undefined && currentAccountId) {
          queryClient.setQueryData(
            legionKeys.following(currentAccountId).concat(50, 0),
            previousFollowing
          );
        }

        // Rollback stats
        if (previousStats !== undefined && currentAccountId) {
          queryClient.setQueryData(
            legionKeys.stats(currentAccountId),
            previousStats
          );
        }
      }
    },
    onSuccess: async (data) => {
      toast.success("Unfollowed!");

      // Invalidate cache on backend for both accounts
      try {
        if (data?.targetAccountId) {
          await fetch("/api/legion/invalidate-cache", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accountIds: [data.targetAccountId],
            }),
          });
        }
      } catch (error) {
        console.error("[Cache] Failed to invalidate:", error);
        // Non-critical, so don't show error to user
      }
    },
    onSettled: async () => {
      // Refetch to ensure consistency
      await queryClient.invalidateQueries({
        queryKey: legionKeys.all,
        refetchType: "none",
      });
    },
  });

  return {
    follow: followMutation.mutate,
    unfollow: unfollowMutation.mutate,
    isPending: followMutation.isPending || unfollowMutation.isPending,
  };
}
