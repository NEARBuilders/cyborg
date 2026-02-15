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

export const legionKeys = {
  all: ["legion"] as const,
  followers: (accountId: string) => [...legionKeys.all, "followers", accountId] as const,
  following: (accountId: string) => [...legionKeys.all, "following", accountId] as const,
  isFollowing: (accountId: string, targetAccountId: string) =>
    [...legionKeys.all, "isFollowing", accountId, targetAccountId] as const,
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
 * Get followers list for an account (using FastData API via worker proxy)
 */
export function useLegionFollowers(accountId: string | undefined, limit = 50, offset = 0, options?: { bypassCache?: boolean }) {
  return useQuery({
    queryKey: legionKeys.followers(accountId || "").concat(String(limit), String(offset), options?.bypassCache ? 'bypass' : 'cached'),
    queryFn: async () => {
      if (!accountId) throw new Error("Account ID required");
      // Use worker API as proxy to avoid CORS - FastData API spec uses query params
      const params = new URLSearchParams({
        account_id: accountId,
        limit: String(limit),
        offset: String(offset),
      });
      if (options?.bypassCache) params.set('bypass', '1');
      const url = `/legion/followers?${params}`;
      return fetchApi(url) as Promise<LegionSocialListResponse>;
    },
    enabled: !!accountId,
    staleTime: options?.bypassCache ? 0 : 2 * 60 * 1000, // Don't cache if bypassing
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Get following list for an account (using FastData API via worker proxy)
 */
export function useLegionFollowing(accountId: string | undefined, limit = 50, offset = 0, options?: { bypassCache?: boolean }) {
  return useQuery({
    queryKey: legionKeys.following(accountId || "").concat(String(limit), String(offset), options?.bypassCache ? 'bypass' : 'cached'),
    queryFn: async () => {
      if (!accountId) throw new Error("Account ID required");
      // Use worker API as proxy to avoid CORS - FastData API spec uses query params
      const params = new URLSearchParams({
        account_id: accountId,
        limit: String(limit),
        offset: String(offset),
      });
      if (options?.bypassCache) params.set('bypass', '1');
      const url = `/legion/following?${params}`;
      return fetchApi(url) as Promise<LegionSocialListResponse>;
    },
    enabled: !!accountId,
    staleTime: options?.bypassCache ? 0 : 2 * 60 * 1000, // Don't cache if bypassing
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Check if current user is following target account in the Legion graph
 */
export function useLegionIsFollowing(accountId: string | undefined, targetAccountId: string | undefined) {
  return useQuery({
    queryKey: legionKeys.isFollowing(accountId || "", targetAccountId || ""),
    queryFn: async () => {
      if (!accountId || !targetAccountId) throw new Error("Both account IDs required");
      // FastData API spec uses query params
      const params = new URLSearchParams({
        account_id: accountId,
        target_account_id: targetAccountId,
      });
      return fetchApi(`/legion/is-following?${params}`) as Promise<{ isFollowing: boolean }>;
    },
    enabled: !!accountId && !!targetAccountId,
    // Shorter staleTime to ensure button state is accurate when navigating to profiles
    // Will refetch after 2 minutes, but also invalidated on successful follow/unfollow
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    // Refetch on window focus to ensure state is always up-to-date
    refetchOnWindowFocus: true,
  });
}

/**
 * Get stats (followers/following counts) from FastData API via worker proxy
 */
export function useLegionStats(accountId: string | undefined) {
  return useQuery({
    queryKey: legionKeys.stats(accountId || ""),
    queryFn: async () => {
      if (!accountId) throw new Error("Account ID required");
      // Use worker API as proxy to avoid CORS
      return fetchApi(`/legion/stats/${accountId}`) as Promise<{ followers: number; following: number }>;
    },
    enabled: !!accountId,
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Follow/Unfollow mutation with FastData Protocol and optimistic updates
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

      // Use the transaction args from API response (includes legion and graph data)
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
      const followingQueryKey = legionKeys.following(currentAccountId).concat("50", "0");
      const previousFollowing = queryClient.getQueryData(followingQueryKey);
      queryClient.setQueryData(followingQueryKey, (old: LegionSocialListResponse | undefined) => ({
        accounts: [...(old?.accounts || []), targetAccountId],
        count: (old?.count || 0) + 1,
        meta: old?.meta || { has_more: false },
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
    onError: (error, _variables, context) => {
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
            legionKeys.following(currentAccountId).concat("50", "0"),
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
      const currentAccountId = getCurrentAccountId();
      if (!currentAccountId) return;

      // Invalidate following list for current user (will trigger refetch)
      await queryClient.invalidateQueries({
        queryKey: legionKeys.following(currentAccountId),
      });

      // Invalidate followers list for target user
      await queryClient.invalidateQueries({
        queryKey: legionKeys.followers(data.targetAccountId),
      });

      // Invalidate stats for both users
      await queryClient.invalidateQueries({
        queryKey: legionKeys.stats(currentAccountId),
      });
      await queryClient.invalidateQueries({
        queryKey: legionKeys.stats(data.targetAccountId),
      });

      // IMPORTANT: Invalidate isFollowing query to verify the follow actually worked
      await queryClient.invalidateQueries({
        queryKey: legionKeys.isFollowing(currentAccountId, data.targetAccountId),
      });

      // After a short delay for the indexer to process, refetch with cache bypass
      setTimeout(async () => {
        // Refetch following list bypassing cache to get fresh data from indexer
        await queryClient.fetchQuery({
          queryKey: legionKeys.following(currentAccountId).concat("50", "0", 'bypass'),
          queryFn: async () => {
            const params = new URLSearchParams({
              account_id: currentAccountId,
              limit: '50',
              offset: '0',
              bypass: '1',
            });
            const url = `/legion/following?${params}`;
            return fetchApi(url) as Promise<LegionSocialListResponse>;
          },
        });

        // Also refetch isFollowing to verify the state
        await queryClient.fetchQuery({
          queryKey: legionKeys.isFollowing(currentAccountId, data.targetAccountId),
          queryFn: async () => {
            const params = new URLSearchParams({
              account_id: currentAccountId,
              target_account_id: data.targetAccountId,
              bypass: '1',
            });
            const url = `/legion/is-following?${params}`;
            return fetchApi(url) as Promise<{ isFollowing: boolean }>;
          },
        });
      }, 2000);
    },
    onSettled: async () => {
      // No global invalidation - we handle specific queries in onSuccess
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

      // Use the transaction args from API response (includes legion and graph data)
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
      const followingQueryKey = legionKeys.following(currentAccountId).concat("50", "0");
      const previousFollowing = queryClient.getQueryData(followingQueryKey);
      queryClient.setQueryData(followingQueryKey, (old: LegionSocialListResponse | undefined) => ({
        accounts: (old?.accounts || []).filter((acc) => acc !== targetAccountId),
        count: Math.max((old?.count || 0) - 1, 0),
        meta: old?.meta || { has_more: false },
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
    onError: (error, _variables, context) => {
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
            legionKeys.following(currentAccountId).concat("50", "0"),
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
      const currentAccountId = getCurrentAccountId();
      if (!currentAccountId) return;

      // Invalidate following list for current user
      await queryClient.invalidateQueries({
        queryKey: legionKeys.following(currentAccountId),
      });

      // Invalidate followers list for target user
      await queryClient.invalidateQueries({
        queryKey: legionKeys.followers(data.targetAccountId),
      });

      // Invalidate stats for both users
      await queryClient.invalidateQueries({
        queryKey: legionKeys.stats(currentAccountId),
      });
      await queryClient.invalidateQueries({
        queryKey: legionKeys.stats(data.targetAccountId),
      });

      // IMPORTANT: Invalidate isFollowing query to verify the unfollow actually worked
      await queryClient.invalidateQueries({
        queryKey: legionKeys.isFollowing(currentAccountId, data.targetAccountId),
      });

      // After a short delay for the indexer to process, refetch with cache bypass
      setTimeout(async () => {
        // Refetch following list bypassing cache to get fresh data from indexer
        await queryClient.fetchQuery({
          queryKey: legionKeys.following(currentAccountId).concat("50", "0", 'bypass'),
          queryFn: async () => {
            const params = new URLSearchParams({
              account_id: currentAccountId,
              limit: '50',
              offset: '0',
              bypass: '1',
            });
            const url = `/legion/following?${params}`;
            return fetchApi(url) as Promise<LegionSocialListResponse>;
          },
        });

        // Also refetch isFollowing to verify the state
        await queryClient.fetchQuery({
          queryKey: legionKeys.isFollowing(currentAccountId, data.targetAccountId),
          queryFn: async () => {
            const params = new URLSearchParams({
              account_id: currentAccountId,
              target_account_id: data.targetAccountId,
              bypass: '1',
            });
            const url = `/legion/is-following?${params}`;
            return fetchApi(url) as Promise<{ isFollowing: boolean }>;
          },
        });
      }, 2000);
    },
    onSettled: async () => {
      // No global invalidation - we handle specific queries in onSuccess
    },
  });

  return {
    follow: followMutation.mutate,
    unfollow: unfollowMutation.mutate,
    isPending: followMutation.isPending || unfollowMutation.isPending,
  };
}
