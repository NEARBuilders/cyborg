/**
 * Hook for fetching Legion holder types (Ascendant, Initiate, nearlegion)
 * Uses the new database-backed endpoint
 */

import { useQuery, useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

// Get API base URL - use worker URL for Pages deployments
function getApiBaseUrl(): string {
  if (typeof window === "undefined") return "";

  const origin = window.location.origin;

  // In development, use same origin
  if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
    return origin;
  }

  // In Pages production, use the worker URL for API calls
  if (origin.includes("pages.dev")) {
    return "https://near-agent.kj95hgdgnn.workers.dev";
  }

  return origin;
}

export interface HolderTypesData {
  accountId: string;
  contracts: Array<{ contractId: string; quantity: number }>;
  totalTokens: number;
  isAscendant: boolean;
  isInitiate: boolean;
  isNearlegion: boolean;
}

export const holderTypesKeys = {
  all: ["holder-types"] as const,
  user: (accountId: string) => [...holderTypesKeys.all, accountId] as const,
};

/**
 * Fetch holder types for a specific account
 * @returns Holder types data with contract information
 */
export function useHolderTypes(accountId: string | undefined) {
  return useQuery({
    queryKey: holderTypesKeys.user(accountId || ""),
    queryFn: async () => {
      if (!accountId) throw new Error("Account ID is required");

      const response = await fetch(
        `${getApiBaseUrl()}/nfts/legion/holders/${accountId}`
      );

      if (!response.ok) {
        throw new Error(`API ${response.status}: ${response.statusText}`);
      }

      return await response.json() as HolderTypesData;
    },
    enabled: !!accountId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Prefetch holder types for multiple users
 */
export function useHolderTypesBatch(accountIds: string[]) {
  const queries = useQueries({
    queries: accountIds.map((accountId) => ({
      queryKey: holderTypesKeys.user(accountId),
      queryFn: async () => {
        const response = await fetch(
          `${getApiBaseUrl()}/nfts/legion/holders/${accountId}`
        );

        if (!response.ok) {
          throw new Error(`API ${response.status}: ${response.statusText}`);
        }

        return await response.json() as HolderTypesData;
      },
      enabled: !!accountId,
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
    })),
  });

  const typesMap = useMemo(() => {
    const map = new Map<string, HolderTypesData | undefined>();
    accountIds.forEach((accountId, index) => {
      const query = queries[index];
      if (query?.data) {
        map.set(accountId, query.data);
      }
    });
    return map;
  }, [accountIds, queries]);

  const isLoading = queries.some((q) => q.isLoading);

  return { typesMap, isLoading };
}

// Re-export for backward compatibility - this now includes all contract types
import { useUserRank as useUserRankOriginal } from "./useUserRank";

export { useUserRankOriginal as useUserRank };
