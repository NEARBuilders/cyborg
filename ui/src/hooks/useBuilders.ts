/**
 * Hook for fetching Builder data from NEARBlocks API
 * X-style progressive loading:
 * 1. Show small initial batch (for immediate display)
 * 2. Pre-load buffer in background
 * 3. Fetch more as user scrolls near bottom
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Builder,
  NearBlocksHolder,
  NearBlocksHoldersResponse,
  NearBlocksCountResponse,
} from "@/types/builders";

// Get API base URL - always use same-origin to avoid CORS issues
// Cloudflare Pages middleware proxies /api/* requests to the worker
function getApiBaseUrl(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

// Configuration constants
const INITIAL_BATCH_SIZE = 12; // Initial visible items
const BUFFER_BATCH_SIZE = 24; // Pre-loaded buffer
const SCROLL_THRESHOLD = 300; // px from bottom to trigger next fetch
const LEGION_CONTRACT = "ascendant.nearlegion.near";
const INITIATE_CONTRACT = "initiate.nearlegion.near";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const CACHE_KEY = "builders-cache-v7";
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

interface CachedBuildersData {
  builders: Builder[];
  totalCounts: { legion: number; initiate: number };
  timestamp: number;
}

function getCachedBuilders(): CachedBuildersData | null {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const data = JSON.parse(cached) as CachedBuildersData;
    if (Date.now() - data.timestamp > CACHE_DURATION_MS) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCachedBuilders(data: Omit<CachedBuildersData, "timestamp">) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, timestamp: Date.now() }));
  } catch {
    // Ignore storage errors
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface FetchResult {
  holders: string[];
  hasMore: boolean;
  error?: string;
}

// Fetch count
async function fetchCount(contractId: string): Promise<number> {
  try {
    const url = `${getApiBaseUrl()}/api/builders`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: `nfts/${contractId}/holders/count` }),
    });

    if (!response.ok) return 0;

    const data = await response.json() as NearBlocksCountResponse;
    return parseInt(data.holders?.[0]?.count || "0", 10);
  } catch {
    return 0;
  }
}

// Fetch holders with custom limit
async function fetchHolders(
  contractId: string,
  page: number,
  limit: number,
): Promise<FetchResult> {
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      const url = `${getApiBaseUrl()}/api/builders`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: `nfts/${contractId}/holders`,
          params: { per_page: String(limit), page: String(page) },
        }),
      });

      if (response.status === 429) {
        retryCount++;
        if (retryCount >= MAX_RETRIES) return { holders: [], hasMore: false };
        await delay(RETRY_DELAY_MS);
        continue;
      }

      if (!response.ok) {
        return { holders: [], hasMore: false, error: `API ${response.status}` };
      }

      const data = await response.json() as NearBlocksHoldersResponse;
      const holdersList = data.holders || [];

      const holders = holdersList
        .filter((h: NearBlocksHolder) => h.account)
        .map((h: NearBlocksHolder) => h.account);

      const hasMore = holdersList.length === limit;

      return { holders, hasMore };
    } catch {
      if (retryCount >= MAX_RETRIES - 1) {
        return { holders: [], hasMore: false, error: "Network error" };
      }
      retryCount++;
      await delay(RETRY_DELAY_MS);
    }
  }

  return { holders: [], hasMore: false };
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

interface UseBuildersOptions {
  initialBatchSize?: number;
  bufferBatchSize?: number;
  scrollThreshold?: number;
}

export function useBuilders(options: UseBuildersOptions = {}) {
  const {
    initialBatchSize = INITIAL_BATCH_SIZE,
    bufferBatchSize = BUFFER_BATCH_SIZE,
    scrollThreshold = SCROLL_THRESHOLD,
  } = options;

  const cachedData = useRef(getCachedBuilders());

  const [builders, setBuilders] = useState<Builder[]>(cachedData.current?.builders || []);
  const [totalCounts, setTotalCounts] = useState(cachedData.current?.totalCounts || { legion: 0, initiate: 0 });
  const [isLoading, setIsLoading] = useState(!cachedData.current);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  // Track pagination state
  const paginationRef = useRef({
    legionPage: 1,
    initiatePage: 1,
    hasMoreLegion: true,
    hasMoreInitiate: true,
  });

  // Refs for values that loadMore needs (avoiding closure issues)
  const stateRef = useRef({
    isLoadingMore,
    hasMore,
    totalCounts,
  });

  // Keep state refs in sync
  useEffect(() => {
    stateRef.current = { isLoadingMore, hasMore, totalCounts };
  }, [isLoadingMore, hasMore, totalCounts]);

  const buildersRef = useRef(builders);
  useEffect(() => { buildersRef.current = builders; }, [builders]);

  // Merge new holders into existing builders
  const mergeHolders = useCallback(
    (current: Builder[], legionHolders: string[], initiateHolders: string[]) => {
      const builderMap = new Map<string, Builder>();

      for (const builder of current) {
        builderMap.set(builder.accountId, { ...builder });
      }

      for (const accountId of legionHolders) {
        const existing = builderMap.get(accountId);
        if (existing) {
          builderMap.set(accountId, { ...existing, isLegion: true });
        } else {
          builderMap.set(accountId, transformToBuilder(accountId, true, false));
        }
      }

      for (const accountId of initiateHolders) {
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

  // Load next batch - using ref to avoid being in dependency arrays
  const loadMoreRef = useRef<(() => Promise<void>) | null>(null);

  loadMoreRef.current = async () => {
    const { isLoadingMore: loading, hasMore: more } = stateRef.current;
    if (loading || !more) return;

    setIsLoadingMore(true);
    setLoadMoreError(null);

    try {
      const { legionPage, initiatePage } = paginationRef.current;

      const promises: Promise<{ type: "legion" | "initiate"; result: FetchResult }>[] = [];

      if (paginationRef.current.hasMoreLegion) {
        promises.push(
          fetchHolders(LEGION_CONTRACT, legionPage, bufferBatchSize).then(r => ({ type: "legion" as const, result: r })),
        );
      }

      if (paginationRef.current.hasMoreInitiate) {
        promises.push(
          fetchHolders(INITIATE_CONTRACT, initiatePage, bufferBatchSize).then(r => ({ type: "initiate" as const, result: r })),
        );
      }

      const results = await Promise.all(promises);

      let legionHolders: string[] = [];
      let initiateHolders: string[] = [];

      // Check for errors in results
      for (const { type, result } of results) {
        if (result.error) {
          setLoadMoreError(result.error);
          return;
        }
      }

      for (const { type, result } of results) {
        if (type === "legion") {
          legionHolders = result.holders;
          paginationRef.current.hasMoreLegion = result.hasMore;
          if (result.holders.length > 0) paginationRef.current.legionPage++;
        } else {
          initiateHolders = result.holders;
          paginationRef.current.hasMoreInitiate = result.hasMore;
          if (result.holders.length > 0) paginationRef.current.initiatePage++;
        }
      }

      const merged = mergeHolders(buildersRef.current, legionHolders, initiateHolders);
      setBuilders(merged);
      setHasMore(paginationRef.current.hasMoreLegion || paginationRef.current.hasMoreInitiate);

      // Update cache
      setCachedBuilders({
        builders: merged,
        totalCounts: stateRef.current.totalCounts,
      });
    } catch (err) {
      console.error("[useBuilders] Load more error:", err);
      setLoadMoreError(err instanceof Error ? err.message : "Failed to load more builders");
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Stable loadMore callback for external use
  const loadMore = useCallback(() => {
    loadMoreRef.current?.();
  }, []);

  // Clear load more error callback
  const clearLoadMoreError = useCallback(() => {
    setLoadMoreError(null);
  }, []);

  // Intersection Observer
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Set up intersection observer - only runs once
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && stateRef.current.hasMore && !stateRef.current.isLoadingMore) {
          loadMoreRef.current?.();
        }
      },
      { rootMargin: `${scrollThreshold}px` },
    );

    observerRef.current = observer;

    return () => {
      observer.disconnect();
    };
  }, [scrollThreshold]); // Only recreate when scrollThreshold changes

  // Connect observer to sentinel when sentinel ref is set
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const observer = observerRef.current;

    if (sentinel && observer) {
      observer.observe(sentinel);
    }

    return () => {
      if (sentinel && observer) {
        observer.unobserve(sentinel);
      }
    };
  }, [sentinelRef.current]); // Re-run when sentinel ref changes

  // Initial load - only runs once
  useEffect(() => {
    let cancelled = false;
    let bufferTimeout: ReturnType<typeof setTimeout> | null = null;

    async function loadInitial() {
      if (cancelled) return;

      if (cachedData.current) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Step 1: Fetch counts
        const [legionCount, initiateCount] = await Promise.all([
          fetchCount(LEGION_CONTRACT),
          fetchCount(INITIATE_CONTRACT),
        ]);

        if (cancelled) return;

        setTotalCounts({ legion: legionCount, initiate: initiateCount });

        // Step 2: Fetch initial batch for display
        const [legionResult, initiateResult] = await Promise.all([
          fetchHolders(LEGION_CONTRACT, 1, initialBatchSize),
          fetchHolders(INITIATE_CONTRACT, 1, initialBatchSize),
        ]);

        if (cancelled) return;

        // Update pagination state
        paginationRef.current.hasMoreLegion = legionResult.hasMore;
        paginationRef.current.hasMoreInitiate = initiateResult.hasMore;

        if (legionResult.holders.length > 0) {
          paginationRef.current.legionPage++;
        }
        if (initiateResult.holders.length > 0) {
          paginationRef.current.initiatePage++;
        }

        // Merge initial builders
        const initialBuilders = mergeHolders(
          [],
          legionResult.holders,
          initiateResult.holders,
        );

        setBuilders(initialBuilders);
        setHasMore(legionResult.hasMore || initiateResult.hasMore);

        // Cache
        setCachedBuilders({
          builders: initialBuilders,
          totalCounts: { legion: legionCount, initiate: initiateCount },
        });

        // Step 3: Pre-load buffer in background
        if ((legionResult.hasMore || initiateResult.hasMore) && !cancelled) {
          bufferTimeout = setTimeout(() => {
            if (!cancelled) {
              loadMoreRef.current?.();
            }
          }, 500);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[useBuilders] Initial load error:", err);
          setError(err as Error);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadInitial();

    return () => {
      cancelled = true;
      if (bufferTimeout) clearTimeout(bufferTimeout);
    };
  }, [initialBatchSize, mergeHolders]); // Only run on mount

  return {
    builders,
    totalCounts,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    loadMoreError,
    clearLoadMoreError,
    sentinelRef,
    loadedCount: builders.length,
  };
}
