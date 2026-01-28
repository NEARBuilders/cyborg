/**
 * Hook for fetching Builder data from NEARBlocks API
 * Fetches NFT holders from Legion and Initiate contracts
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Builder,
  NearBlocksHolder,
  NearBlocksHoldersResponse,
  NearBlocksCountResponse,
} from "@/types/builders";

// Configuration constants
const API_PAGE_SIZE = 100; // Number of holders to fetch per page
const LEGION_CONTRACT = "ascendant.nearlegion.near";
const INITIATE_CONTRACT = "initiate.nearlegion.near";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Helper function to delay execution
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface FetchPageResult {
  holders: string[];
  hasMore: boolean;
  error?: string;
}

interface FetchCountResult {
  count: number;
  error?: string;
}

// Fetch total holder count from NearBlocks API via our proxy
async function fetchCount(contractId: string): Promise<FetchCountResult> {
  try {
    const url = `/api/builders`;
    const requestBody = {
      path: `nfts/${contractId}/holders/count`,
    };

    console.log(`[useBuilders] Fetching count for contract ${contractId}`);
    console.log(`[useBuilders] Request URL: ${url}`);
    console.log(`[useBuilders] Request body:`, requestBody);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    console.log(
      `[useBuilders] Response status: ${response.status} ${response.statusText}`,
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(
        `[useBuilders] Failed to fetch count for contract ${contractId}`,
        errorData,
      );
      return {
        count: 0,
        error: `Failed to fetch count for contract ${contractId}: ${response.status} ${response.statusText}`,
      };
    }

    const data: NearBlocksCountResponse = await response.json();
    console.log(`[useBuilders] Count response for contract ${contractId}:`, data);

    const count = parseInt(data.holders?.[0]?.count || "0", 10);
    console.log(`[useBuilders] Parsed count for contract ${contractId}: ${count}`);

    return { count };
  } catch (error) {
    console.error(
      `[useBuilders] Error fetching count for contract ${contractId}:`,
      error,
    );
    return {
      count: 0,
      error: `Error fetching count for contract ${contractId}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// Fetch a specific page of holders for a token from NearBlocks API via our proxy
async function fetchHoldersPage(
  contractId: string,
  page: number,
): Promise<FetchPageResult> {
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(`[useBuilders] Fetching page ${page} for contract ${contractId}`);
      const url = `/api/builders`;
      const requestBody = {
        path: `nfts/${contractId}/holders`,
        params: {
          per_page: API_PAGE_SIZE,
          page,
        },
      };
      console.log(`[useBuilders] Request URL: ${url}`);
      console.log(`[useBuilders] Request body:`, requestBody);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      console.log(
        `[useBuilders] Response status: ${response.status} ${response.statusText}`,
      );

      if (response.status === 429) {
        retryCount++;
        if (retryCount >= MAX_RETRIES) {
          console.warn(
            `[useBuilders] Rate limited on ${contractId} page ${page}, stopping`,
          );
          return { holders: [], hasMore: false };
        }
        console.warn(
          `[useBuilders] Rate limited, waiting ${RETRY_DELAY_MS}ms... (retry ${retryCount}/${MAX_RETRIES})`,
        );
        await delay(RETRY_DELAY_MS);
        continue;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`[useBuilders] API error: ${response.status}`, errorData);
        return {
          holders: [],
          hasMore: false,
          error: `API error: ${response.status} ${response.statusText}`,
        };
      }

      const data: NearBlocksHoldersResponse = await response.json();
      console.log(
        `[useBuilders] Holders response for ${contractId} page ${page}:`,
        data,
      );

      const holdersList = data.holders || [];

      // Check if we got valid data
      if (holdersList.length === 0) {
        console.log(
          `[useBuilders] No holders found for ${contractId} page ${page}`,
        );
        return { holders: [], hasMore: false };
      }

      const holders = holdersList
        .filter((h: NearBlocksHolder) => h.account)
        .map((h: NearBlocksHolder) => h.account);

      const hasMore = holdersList.length === API_PAGE_SIZE;

      console.log(
        `[useBuilders] Found ${holders.length} holders for ${contractId} page ${page}, hasMore: ${hasMore}`,
      );

      return { holders, hasMore };
    } catch (error) {
      console.error(
        `[useBuilders] Network error on ${contractId} page ${page}:`,
        error,
      );
      if (retryCount >= MAX_RETRIES - 1) {
        return {
          holders: [],
          hasMore: false,
          error: "Network error while fetching holders",
        };
      }
      retryCount++;
      await delay(RETRY_DELAY_MS);
    }
  }

  return { holders: [], hasMore: false };
}

// Transform account ID to a builder with mock additional data
// In a real implementation, you might fetch this from additional APIs
function transformToBuilder(
  accountId: string,
  isLegion: boolean,
  isInitiate: boolean,
): Builder {
  // Extract a display name from account ID (simplified)
  const displayName = accountId.split(".")[0];

  // Generate a role based on NFT holdings
  const role = isLegion ? "Ascendant" : isInitiate ? "Initiate" : "Member";

  // Generate mock tags based on role
  const tags = isLegion
    ? ["NEAR Expert", "Developer", "Community Leader"]
    : isInitiate
      ? ["Web3 Enthusiast", "NEAR Builder"]
      : ["Community Member"];

  // Generate mock social handles
  const githubHandle = accountId
    .replace(".near", "")
    .replace(/[^a-z0-9]/g, "")
    .toLowerCase();
  const twitterHandle = githubHandle;

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
        description:
          "Organizing and participating in community events and hackathons.",
        status: "Active",
      },
    ],
    socials: {
      github: githubHandle,
      twitter: twitterHandle,
    },
    isLegion,
    isInitiate,
  };
}

export function useBuilders() {
  const [builders, setBuilders] = useState<Builder[]>([]);
  const [totalCounts, setTotalCounts] = useState({ legion: 0, initiate: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  // Track which API pages we've loaded
  const [loadedPages, setLoadedPages] = useState({
    legion: [] as number[],
    initiate: [] as number[],
  });

  // Track if there are more pages to load
  const [hasMore, setHasMore] = useState({
    legion: true,
    initiate: true,
  });

  // Refs for stable loadMore callback
  const buildersRef = useRef(builders);
  const loadedPagesRef = useRef(loadedPages);
  const hasMoreRef = useRef(hasMore);

  // Keep refs in sync
  useEffect(() => {
    buildersRef.current = builders;
  }, [builders]);

  useEffect(() => {
    loadedPagesRef.current = loadedPages;
  }, [loadedPages]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  // Deduplicate and merge holders into builders
  const mergeHolders = useCallback(
    (
      currentBuilders: Builder[],
      newLegionHolders: string[],
      newInitiateHolders: string[],
    ): Builder[] => {
      const builderMap = new Map<string, Builder>();

      // Clone existing builders to avoid mutation
      for (const builder of currentBuilders) {
        builderMap.set(builder.accountId, { ...builder });
      }

      // Add/update with Legion holders
      for (const accountId of newLegionHolders) {
        const existing = builderMap.get(accountId);
        if (existing) {
          builderMap.set(accountId, { ...existing, isLegion: true });
        } else {
          builderMap.set(accountId, transformToBuilder(accountId, true, false));
        }
      }

      // Add/update with Initiate holders
      for (const accountId of newInitiateHolders) {
        const existing = builderMap.get(accountId);
        if (existing) {
          builderMap.set(accountId, { ...existing, isInitiate: true });
        } else {
          builderMap.set(accountId, transformToBuilder(accountId, false, true));
        }
      }

      return Array.from(builderMap.values());
    },
    [],
  );

  // Load more holders from both tokens when user scrolls or clicks "load more"
  const loadMore = useCallback(async () => {
    const currentHasMore = hasMoreRef.current;

    if (isLoadingMore || (!currentHasMore.legion && !currentHasMore.initiate)) {
      return;
    }

    setIsLoadingMore(true);

    try {
      const currentLoadedPages = loadedPagesRef.current;
      const nextLegionPage = currentLoadedPages.legion.length + 1;
      const nextInitiatePage = currentLoadedPages.initiate.length + 1;

      const promises: Promise<{
        type: "legion" | "initiate";
        result: FetchPageResult;
      }>[] = [];

      // Fetch next Legion page if there's more
      if (currentHasMore.legion) {
        promises.push(
          fetchHoldersPage(LEGION_CONTRACT, nextLegionPage).then((result) => ({
            type: "legion" as const,
            result,
          })),
        );
      }

      // Fetch next Initiate page if there's more
      if (currentHasMore.initiate) {
        promises.push(
          fetchHoldersPage(INITIATE_CONTRACT, nextInitiatePage).then(
            (result) => ({
              type: "initiate" as const,
              result,
            }),
          ),
        );
      }

      const results = await Promise.all(promises);

      let legionHolders: string[] = [];
      let initiateHolders: string[] = [];
      let legionHasMore = currentHasMore.legion;
      let initiateHasMore = currentHasMore.initiate;
      const newLegionPages = currentLoadedPages.legion.slice();
      const newInitiatePages = currentLoadedPages.initiate.slice();

      let legionResult: FetchPageResult | null = null;
      let initiateResult: FetchPageResult | null = null;
      let hadError = false;

      for (const { type, result } of results) {
        if (result.error) {
          hadError = true;
        }
        if (type === "legion") {
          legionResult = result;
          legionHolders = result.holders;
          if (
            result.holders.length > 0 &&
            !newLegionPages.includes(nextLegionPage)
          ) {
            newLegionPages.push(nextLegionPage);
          }
          legionHasMore = result.error ? false : result.hasMore;
        } else {
          initiateResult = result;
          initiateHolders = result.holders;
          if (
            result.holders.length > 0 &&
            !newInitiatePages.includes(nextInitiatePage)
          ) {
            newInitiatePages.push(nextInitiatePage);
          }
          initiateHasMore = result.error ? false : result.hasMore;
        }
      }

      if (legionResult?.error && initiateResult?.error) {
        setHasMore({ legion: false, initiate: false });
        setLoadMoreError("Failed to load more builders");
        return;
      }

      const currentBuilders = buildersRef.current;
      const mergedBuilders = mergeHolders(
        currentBuilders,
        legionHolders,
        initiateHolders,
      );

      // React 19 automatically batches all state updates
      setLoadedPages({ legion: newLegionPages, initiate: newInitiatePages });
      setHasMore({ legion: legionHasMore, initiate: initiateHasMore });
      setBuilders(mergedBuilders);
      if (hadError) {
        setLoadMoreError("Failed to load more builders");
      } else {
        setLoadMoreError(null);
      }
    } catch (err) {
      console.error("Failed to load more:", err);
      setLoadMoreError(
        err instanceof Error ? err.message : "Failed to load more",
      );
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, mergeHolders]);

  // Initial load: fetch counts and first page from both contracts
  useEffect(() => {
    let cancelled = false;

    async function fetchInitial() {
      if (cancelled) return;

      try {
        console.log("[useBuilders] Starting initial load of builders data");
        setIsLoading(true);
        setError(null);

        // Fetch counts and first pages in parallel
        const [
          legionCountResult,
          initiateCountResult,
          legionResult,
          initiateResult,
        ] = await Promise.all([
          fetchCount(LEGION_CONTRACT),
          fetchCount(INITIATE_CONTRACT),
          fetchHoldersPage(LEGION_CONTRACT, 1),
          fetchHoldersPage(INITIATE_CONTRACT, 1),
        ]);

        if (cancelled) return;

        console.log("[useBuilders] Initial fetch results:", {
          legionCount: legionCountResult.count,
          initiateCount: initiateCountResult.count,
          legionHolders: legionResult.holders.length,
          initiateHolders: initiateResult.holders.length,
          legionError: legionResult.error,
          initiateError: initiateResult.error,
        });

        setTotalCounts({
          legion: legionCountResult.count,
          initiate: initiateCountResult.count,
        });

        if (cancelled) return;

        if (legionResult.error || initiateResult.error) {
          const message =
            legionResult.error ||
            initiateResult.error ||
            "Failed to load builders";
          console.error("[useBuilders] Error in initial load:", message);
          setError(new Error(message));
        }

        // Update loaded pages
        if (legionResult.holders.length > 0) {
          console.log("[useBuilders] Marking legion page 1 as loaded");
          setLoadedPages((prev) => {
            if (prev.legion.includes(1)) {
              return prev;
            }
            return { ...prev, legion: [...prev.legion, 1] };
          });
        }
        if (initiateResult.holders.length > 0) {
          console.log("[useBuilders] Marking initiate page 1 as loaded");
          setLoadedPages((prev) => {
            if (prev.initiate.includes(1)) {
              return prev;
            }
            return { ...prev, initiate: [...prev.initiate, 1] };
          });
        }

        // Update hasMore flags
        setHasMore({
          legion: legionResult.hasMore,
          initiate: initiateResult.hasMore,
        });

        // Merge initial holders
        const initialBuilders = mergeHolders(
          [],
          legionResult.holders,
          initiateResult.holders,
        );

        console.log(
          "[useBuilders] Setting initial builders:",
          initialBuilders.length,
        );
        setBuilders(initialBuilders);
      } catch (err) {
        if (!cancelled) {
          console.error("[useBuilders] Exception in initial load:", err);
          setError(err as Error);
        }
      } finally {
        if (!cancelled) {
          console.log("[useBuilders] Initial load completed");
          setIsLoading(false);
        }
      }
    }

    fetchInitial();

    return () => {
      cancelled = true;
    };
  }, [mergeHolders]);

  return {
    builders,
    totalCounts,
    isLoading,
    isLoadingMore,
    error,
    loadMoreError,
    hasMore: hasMore.legion || hasMore.initiate,
    loadMore,
    clearLoadMoreError: () => setLoadMoreError(null),
    loadedCount: builders.length,
    loadedPages: loadedPages.legion.length + loadedPages.initiate.length,
    pageSize: API_PAGE_SIZE,
  };
}
