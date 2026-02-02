/**
 * Shared hook for fetching user Legion rank with proper caching.
 * This ensures rank data is shared across components and not refetched unnecessarily.
 */

import { useQuery, useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

export interface RankData {
  rank: "legendary" | "epic" | "rare" | "common" | null;
  tokenId: string | null;
  hasNft: boolean;
  hasInitiate: boolean;
}

export const rankKeys = {
  all: ["user-rank"] as const,
  user: (accountId: string) => [...rankKeys.all, accountId] as const,
};

export function useUserRank(accountId: string | undefined) {
  return useQuery({
    queryKey: rankKeys.user(accountId || ""),
    queryFn: async () => {
      try {
        const response = await fetch(`/api/rank/${accountId}`);
        if (!response.ok) {
          // If endpoint doesn't exist, return null rank
          return { rank: null, tokenId: null, hasNft: false, hasInitiate: false };
        }
        return response.json();
      } catch {
        // On error, return null rank
        return { rank: null, tokenId: null, hasNft: false, hasInitiate: false };
      }
    },
    enabled: !!accountId,
    staleTime: 5 * 60 * 1000, // 5 minutes - don't refetch if data is less than 5 min old
    gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache for 30 min
    retry: false, // Don't retry on failure
  });
}

/**
 * Prefetch ranks for multiple users. This populates the React Query cache
 * so individual useUserRank calls return instantly from cache.
 */
export function useUserRanks(accountIds: string[]) {
  const queries = useQueries({
    queries: accountIds.map((accountId) => ({
      queryKey: rankKeys.user(accountId),
      queryFn: () => apiClient.getUserRank({ accountId }),
      enabled: !!accountId,
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
    })),
  });

  const ranks = useMemo(() => {
    const map = new Map<string, RankData | undefined>();
    accountIds.forEach((accountId, index) => {
      const query = queries[index];
      if (query?.data) {
        map.set(accountId, query.data);
      }
    });
    return map;
  }, [accountIds, queries]);

  const isLoading = queries.some((q) => q.isLoading);

  return { ranks, isLoading, queries };
}
