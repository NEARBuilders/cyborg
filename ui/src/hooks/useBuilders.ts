/**
 * Hook for fetching Builder data from NEARBlocks API
 * Uses TanStack Query's useInfiniteQuery for reliable infinite scroll
 */

import { useInfiniteQuery } from "@tanstack/react-query";
import type {
  Builder,
  NearBlocksHolder,
  NearBlocksHoldersResponse,
} from "@/types/builders";

// Get API base URL - always use same-origin to avoid CORS issues
function getApiBaseUrl(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

// Configuration constants
const PAGE_SIZE = 25;
const LEGION_CONTRACT = "ascendant.nearlegion.near";
const INITIATE_CONTRACT = "initiate.nearlegion.near";

interface FetchHoldersParams {
  contractId: string;
  page: number;
  limit: number;
}

async function fetchHolders({ contractId, page, limit }: FetchHoldersParams): Promise<{
  holders: string[];
  hasMore: boolean;
}> {
  const response = await fetch(`${getApiBaseUrl()}/api/builders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: `nfts/${contractId}/holders`,
      params: { per_page: String(limit), page: String(page) },
    }),
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${response.statusText}`);
  }

  if (response.status === 429) {
    throw new Error("Rate limited by NEARBlocks API. Please try again later.");
  }

  const data = await response.json() as NearBlocksHoldersResponse;
  const holdersList = data.holders || [];

  const holders = holdersList
    .filter((h: NearBlocksHolder) => h.account)
    .map((h: NearBlocksHolder) => h.account);

  const hasMore = holdersList.length === limit;

  return { holders, hasMore };
}

function transformToBuilder(
  accountId: string,
  isLegion: boolean,
  isInitiate: boolean,
): Builder {
  const displayName = accountId.split(".")[0];
  const role = isLegion ? "Ascendant" : isInitiate ? "Initiate" : "Member";
  const tags = isLegion
    ? ["NEAR Expert", "Developer", "Community Leader"]
    : isInitiate
      ? ["Web3 Enthusiast", "NEAR Builder"]
      : ["Community Member"];

  const githubHandle = accountId
    .replace(".near", "")
    .replace(/[^a-z0-9]/g, "")
    .toLowerCase();

  return {
    id: accountId,
    accountId,
    displayName,
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${accountId}`,
    role,
    tags,
    description: `A passionate builder in the NEAR ecosystem. ${
      isLegion
        ? "As an Ascendant member of the Legion, I contribute to advanced NEAR protocol development."
        : isInitiate
          ? "Currently on an Initiate journey, learning and contributing to the NEAR ecosystem."
          : "Active participant in the NEAR community."
    }`,
    projects: [
      {
        name: isLegion ? "NEAR Protocol Core" : "NEAR Learning Path",
        description: isLegion
          ? "Contributing to the core protocol features and improvements."
          : "Exploring and documenting NEAR protocol capabilities.",
        status: isLegion ? "Active" : "In Development",
      },
      {
        name: "Community Initiatives",
        description: "Organizing and participating in community events and hackathons.",
        status: "Active",
      },
    ],
    socials: {
      github: githubHandle,
      twitter: githubHandle,
    },
    isLegion,
    isInitiate,
  };
}

export function useBuilders() {
  const query = useInfiniteQuery({
    queryKey: ["builders"],
    queryFn: async ({ pageParam }) => {
      const page = pageParam as number || 1;

      // Fetch both contracts in parallel
      const [legionResult, initiateResult] = await Promise.all([
        fetchHolders({ contractId: LEGION_CONTRACT, page, limit: PAGE_SIZE }),
        fetchHolders({ contractId: INITIATE_CONTRACT, page, limit: PAGE_SIZE }),
      ]);

      return {
        legionHolders: legionResult.holders,
        initiateHolders: initiateResult.holders,
        legionPage: page,
        initiatePage: page,
        hasMoreLegion: legionResult.hasMore,
        hasMoreInitiate: initiateResult.hasMore,
      };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      // Continue if either contract has more data
      if (lastPage.hasMoreLegion || lastPage.hasMoreInitiate) {
        return lastPage.legionPage + 1;
      }
      return undefined;
    },
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Merge all pages into a single list of builders
  const builders = (() => {
    const builderMap = new Map<string, Builder>();

    for (const page of query.data?.pages || []) {
      // Add legion holders
      for (const accountId of page.legionHolders) {
        const existing = builderMap.get(accountId);
        if (existing) {
          builderMap.set(accountId, { ...existing, isLegion: true });
        } else {
          builderMap.set(accountId, transformToBuilder(accountId, true, false));
        }
      }

      // Add initiate holders
      for (const accountId of page.initiateHolders) {
        const existing = builderMap.get(accountId);
        if (existing) {
          builderMap.set(accountId, { ...existing, isInitiate: true });
        } else {
          builderMap.set(accountId, transformToBuilder(accountId, false, true));
        }
      }
    }

    return Array.from(builderMap.values());
  })();

  // Calculate total counts (sum of all holders across all pages)
  const totalCounts = (() => {
    let legionCount = 0;
    let initiateCount = 0;

    for (const page of query.data?.pages || []) {
      legionCount += page.legionHolders.length;
      initiateCount += page.initiateHolders.length;
    }

    return { legion: legionCount, initiate: initiateCount };
  })();

  const loadMoreError = query.error instanceof Error ? query.error.message : null;

  const clearLoadMoreError = () => {
    // Clear error by refetching
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
