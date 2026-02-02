/**
 * Builders API endpoint
 * Proxies requests to NEARBlocks API with KV caching
 */

import { CacheService } from "./cache";

interface BuildersInput {
  path?: string;
  params?: Record<string, string>;
  nearblocksApiKey?: string;
  cache?: CacheService;
}

interface BuildersResult {
  success: boolean;
  error: string | null;
  status: number;
  data: unknown;
}

const CACHE_TTL_SECONDS = 86400; // 24 hours for builders list (rarely changes)
const COUNT_CACHE_TTL_SECONDS = 86400; // 24 hours for counts

/**
 * Handle builders API request
 */
export async function handleBuildersRequest(input: BuildersInput): Promise<BuildersResult> {
  try {
    const { cache } = input;

    const path = input.path || "collections";
    const params = input.params || {};

    console.log(`[API] Builders request - path: ${path}, params:`, params);

    // Build query string
    const queryString = new URLSearchParams(params).toString();
    const targetUrl = `https://api.nearblocks.io/v1/${path}${queryString ? `?${queryString}` : ""}`;

    // Check KV cache first
    if (cache) {
      // Generate cache key from URL
      const cacheKey = `nearblocks:${path}:${queryString}`;
      const cached = await cache.get<any>(cacheKey);

      if (cached) {
        console.log(`[KV CACHE HIT] Returning cached data for: ${path}`);
        return {
          success: true,
          error: null,
          status: 200,
          data: cached,
        };
      }
    }

    console.log(`[API] Proxying to NEARBlocks: ${targetUrl}`);

    // Determine TTL based on endpoint type
    const isCountEndpoint = path.includes("/count");
    const ttl = isCountEndpoint ? COUNT_CACHE_TTL_SECONDS : CACHE_TTL_SECONDS;

    // Fetch with retry logic
    let response: Response | null = null;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        response = await fetch(targetUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            ...(input.nearblocksApiKey ? {
              "x-nearblocks-api-key": input.nearblocksApiKey,
              "Authorization": `Bearer ${input.nearblocksApiKey}`
            } : {}),
          },
        });
        break;
      } catch (error) {
        retryCount++;
        if (retryCount >= maxRetries) {
          throw error;
        }
        const delay = retryCount * 2000;
        console.log(`[API] Retry ${retryCount}/${maxRetries}, waiting ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    if (!response) {
      return {
        success: false,
        error: "Failed to fetch after retries",
        status: 500,
        data: null,
      };
    }

    if (!response.ok) {
      console.error(`[API] NEARBlocks API error: ${response.status} ${response.statusText} for ${targetUrl}`);

      // If rate limited, try to return stale cached data
      if (response.status === 429 && cache) {
        console.log(`[API] Rate limited, checking for stale cache for: ${path}`);
        const staleKey = `nearblocks:${path}:${queryString}:stale`;
        const staleData = await cache.get<any>(staleKey);

        if (staleData) {
          console.log(`[API] Returning stale cached data for: ${path}`);
          return {
            success: true,
            error: null,
            status: 200,
            data: staleData,
          };
        }

        return {
          success: false,
          error: `Rate limited by NEARBlocks API (${path}). No cached data available. Please try again in a few minutes.`,
          status: response.status,
          data: null,
        };
      }

      return {
        success: false,
        error: `NEARBlocks API error ${response.status}: ${response.statusText} (path: ${path})`,
        status: response.status,
        data: null,
      };
    }

    const data = await response.json();

    // Cache successful response in KV
    if (cache) {
      const cacheKey = `nearblocks:${path}:${queryString}`;
      const staleKey = `nearblocks:${path}:${queryString}:stale`;

      // Store fresh cache with normal TTL
      await cache.set(cacheKey, data, ttl);
      // Store stale cache with much longer TTL for fallback when rate limited
      await cache.set(staleKey, data, ttl * 2); // 2x longer for stale cache (48 hours)

      console.log(`[KV CACHE] Stored data for: ${path}, TTL: ${ttl}s (stale: ${ttl * 4}s)`);
    }

    console.log(`[API] Successfully fetched data from NEARBlocks:`, Object.keys(data as object));

    return {
      success: true,
      error: null,
      status: response.status,
      data,
    };
  } catch (error) {
    console.error("[API] Error in builders API handler:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      status: 500,
      data: null,
    };
  }
}
