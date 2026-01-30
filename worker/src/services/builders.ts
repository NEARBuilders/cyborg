/**
 * Builders API endpoint
 * Proxies requests to NEARBlocks API
 *
 * Adapted from api/src/builders.ts for Cloudflare Workers
 */

// Simple in-memory cache (will be reset on Worker restart, but that's fine for edge)
const apiCache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface BuildersInput {
  path?: string;
  params?: Record<string, string>;
}

interface BuildersResult {
  success: boolean;
  error: string | null;
  status: number;
  data: unknown;
}

/**
 * Handle builders API request
 */
export async function handleBuildersRequest(input: BuildersInput): Promise<BuildersResult> {
  try {
    const path = input.path || "collections";
    const params = input.params || {};

    console.log(`[API] Builders request - path: ${path}, params:`, params);

    // Build query string
    const queryString = new URLSearchParams(params).toString();
    const targetUrl = `https://api.nearblocks.io/v1/${path}${queryString ? `?${queryString}` : ""}`;

    // Check cache
    const cacheKey = targetUrl;
    const cached = apiCache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.timestamp < CACHE_TTL) {
      console.log(`[CACHE HIT] Returning cached data for: ${path}`);
      return {
        success: true,
        error: null,
        status: 200,
        data: cached.data,
      };
    }

    console.log(`[API] Proxying to NEARBlocks: ${targetUrl}`);

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
            Authorization: "Bearer 10D94E2ECC9F460CB105030A47006C3D",
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

      if (response.status === 429) {
        return {
          success: false,
          error: `Rate limited by NEARBlocks API (${path}). Please try again later.`,
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

    // Cache successful response
    apiCache.set(cacheKey, { data, timestamp: now });

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
