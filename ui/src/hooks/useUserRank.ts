/**
 * Shared hook for fetching user Legion rank with proper caching.
 * This ensures rank data is shared across components and not refetched unnecessarily.
 */

import { useQuery, useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiClient } from "@/utils/orpc";

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
    queryFn: () => apiClient.getUserRank({ accountId: accountId! }),
    enabled: !!accountId,
    staleTime: 5 * 60 * 1000, // 5 minutes - don't refetch if data is less than 5 min old
    gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache for 30 min
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
