/**
 * Hook for fetching Builder data from database
 * Single optimized API call - no individual profile fetching
 */

import { useInfiniteQuery } from "@tanstack/react-query";
import type { Builder } from "@/types/builders";

// Get API base URL
function getApiBaseUrl(): string {
  if (typeof window === "undefined") return "";
  const origin = window.location.origin;
  if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
    return origin;
  }
  // In Pages production, use the Pages worker
  return origin;
}

const PAGE_SIZE = 50;

interface BuildersResponse {
  builders: Builder[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

/**
 * Fetch builders with profiles from database - single optimized call
 */
async function fetchBuildersWithProfiles(page: number): Promise<BuildersResponse> {
  const offset = (page - 1) * PAGE_SIZE;
  const response = await fetch(
    `${getApiBaseUrl()}/api/builders-with-profiles?offset=${offset}&limit=${PAGE_SIZE}`
  );

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export function useBuilders() {
  const query = useInfiniteQuery({
    queryKey: ["builders"],
    queryFn: async ({ pageParam }) => {
      const page = (pageParam as number) || 1;
      return fetchBuildersWithProfiles(page);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.hasMore) {
        return (lastPage.offset / PAGE_SIZE) + 2;
      }
      return undefined;
    },
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Merge all pages into a single list
  const builders = (() => {
    const allBuilders: Builder[] = [];
    for (const page of query.data?.pages || []) {
      allBuilders.push(...page.builders);
    }
    return allBuilders;
  })();

  // Get total from first page
  const totalCounts = (() => {
    const firstPage = query.data?.pages[0];
    if (!firstPage) return { legion: 0, initiate: 0 };
    const legion = firstPage.builders.filter((b) => b.isLegion).length;
    const initiate = firstPage.builders.filter((b) => b.isInitiate).length;
    return { legion, initiate };
  })();

  const loadMoreError = query.error instanceof Error ? query.error.message : null;

  const clearLoadMoreError = () => {
    if (query.error) {
      query.refetch();
    }
  };

  return {
    builders,
    totalCounts,
    isLoading: query.isLoading,
    isLoadingMore: query.isFetchingNextPage,
    hasMore: query.hasNextPage,
    error: query.error,
    loadMoreError,
    clearLoadMoreError,
    loadMore: () => query.fetchNextPage(),
    loadedCount: builders.length,
  };
}
