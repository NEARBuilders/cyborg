/**
 * Builders API endpoint
 * Proxies requests to NEARBlocks API with edge runtime support
 */

import { Effect } from "every-plugin/effect";
import { z } from "every-plugin/zod";

// Input schema for the builders API
const buildersInputSchema = z.object({
  path: z.string().optional().default("collections"),
  params: z
    .record(z.string(), z.union([z.string(), z.number()]).transform(String))
    .optional()
    .default({}),
});

// Input schema for POST requests (matching what the UI sends)
const buildersPostInputSchema = z.object({
  path: z.string(),
  params: z
    .record(z.string(), z.union([z.string(), z.number()]).transform(String))
    .optional()
    .default({}),
});

// Simple cache to store API responses and reduce redundant requests
const apiCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minute cache (increased for rate limiting)

// Main handler function for the builders API
export const handleBuildersRequest = (
  input: z.infer<typeof buildersInputSchema>,
) => {
  return Effect.gen(function* () {
    try {
      const { path, params } = input;

      // Build query string from params
      const queryString = new URLSearchParams(
        params as Record<string, string>,
      ).toString();

      // Construct the target URL - path already contains 'nfts/' from UI
      const targetUrl = `https://api.nearblocks.io/v1/${path}${queryString ? `?${queryString}` : ""}`;

      // Check cache first
      const cacheKey = `${targetUrl}`;
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

      console.log(`[API] Proxying request to: ${targetUrl}`);

      // Fetch data from NEARBlocks API with retry logic for rate limiting
      let response: Response | null = null;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          response = yield* Effect.tryPromise(() =>
            fetch(targetUrl, {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer 10D94E2ECC9F460CB105030A47006C3D`,
              },
            }),
          );

          // If we got a response, break out of retry loop
          break;
        } catch (error) {
          retryCount++;
          if (retryCount >= maxRetries) {
            throw error;
          }

          // Wait longer with each retry
          const delay = retryCount * 2000;
          console.log(
            `[API] Retry ${retryCount}/${maxRetries}, waiting ${delay}ms...`,
          );
          yield* Effect.sleep(delay);
        }
      }

      if (!response.ok) {
        console.error(
          `[API] NEARBlocks API error: ${response.status} ${response.statusText}`,
        );

        // Check for rate limiting
        if (response.status === 429) {
          return {
            success: false,
            error: `Rate limited by NEARBlocks API. Please try again later.`,
            status: response.status,
            data: null,
          };
        }

        return {
          success: false,
          error: `API error: ${response.statusText}`,
          status: response.status,
          data: null,
        };
      }

      // Parse the response
      const data = yield* Effect.tryPromise(() => response.json());

      // Cache successful response
      apiCache.set(cacheKey, { data, timestamp: now });

      console.log(
        `[API] Successfully fetched data from NEARBlocks:`,
        Object.keys(data),
      );

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
  });
};

// Function to be exported for use in the main router
export const createBuildersRoute = (builder: any) => {
  return {
    // Endpoint to get all ascendant holders at once
    getAllAscendantHolders: builder.route({
      method: "GET",
      path: "/ascendant-holders",
      input: z.object({}),
      handler: () => {
        return getAllAscendantHolders();
      },
    }),

    // Endpoint to get builders data from NEARBlocks API (GET)
    get: builder.route({
      method: "GET",
      path: "/builders",
      input: buildersInputSchema,
      handler: async ({
        input,
      }: {
        input: z.infer<typeof buildersInputSchema>;
      }) => {
        const result = await Effect.runPromise(handleBuildersRequest(input));

        if (result.success) {
          return Response.json(result.data, {
            status: result.status,
            headers: {
              "Cache-Control":
                "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
            },
          });
        } else {
          return Response.json(
            { error: result.error },
            { status: result.status },
          );
        }
      },
    }),

    // Endpoint to get builders data from NEARBlocks API (POST)
    post: builder.route({
      method: "POST",
      path: "/builders",
      input: buildersPostInputSchema,
      handler: async ({
        input,
      }: {
        input: z.infer<typeof buildersPostInputSchema>;
      }) => {
        const result = await Effect.runPromise(handleBuildersRequest(input));

        if (result.success) {
          return Response.json(result.data, {
            status: result.status,
            headers: {
              "Cache-Control":
                "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
            },
          });
        } else {
          return Response.json(
            { error: result.error },
            { status: result.status },
          );
        }
      },
    }),

    // Endpoint to get builder details by ID
    getById: builder.route({
      method: "GET",
      path: "/builders/{id}",
      input: z.object({
        id: z.string(),
        params: z
          .record(
            z.string(),
            z.union([z.string(), z.number()]).transform(String),
          )
          .optional()
          .default({}),
      }),
      handler: async ({
        input,
      }: {
        input: { id: string; params: Record<string, string> };
      }) => {
        const request = {
          path: `collections/${input.id}`,
          params: input.params,
        };

        const result = await Effect.runPromise(handleBuildersRequest(request));

        if (result.success) {
          return Response.json(result.data, {
            status: result.status,
            headers: {
              "Cache-Control":
                "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
            },
          });
        } else {
          return Response.json(
            { error: result.error },
            { status: result.status },
          );
        }
      },
    }),
  };
};

// Standalone function to fetch all holders (not part of createBuildersRoute)
export const getAllAscendantHolders = async () => {
  // Fetch all holders across multiple pages
  const allHolders = [];
  let page = 1;
  let hasMore = true;
  const DELAY = 3000; // 3 second delay between requests

  while (hasMore) {
    const input = {
      path: "nfts/ascendant.nearlegion.near/holders",
      params: { per_page: "100", page: String(page) },
    };

    try {
      // Check cache first
      const cacheKey = `nfts/ascendant.nearlegion.near/holders?per_page=100&page=${page}`;
      const cached = apiCache.get(cacheKey);
      const now = Date.now();

      if (cached && now - cached.timestamp < CACHE_TTL) {
        console.log(`[CACHE HIT] Page ${page}`);
        allHolders.push(...cached.data.holders);

        // Check if there are more pages
        hasMore = cached.data.holders.length === 100;
        page++;

        if (hasMore) {
          await new Promise((resolve) => setTimeout(resolve, 500)); // Short delay for cached data
        }
        continue;
      }

      console.log(`[API] Fetching ascendant holders page ${page}...`);
      const result = await Effect.runPromise(handleBuildersRequest(input));

      if (!result.success || !result.data.holders) {
        console.error(`[API] Failed to fetch page ${page}: ${result.error}`);
        break;
      }

      // Cache response
      apiCache.set(cacheKey, { data: result.data, timestamp: now });

      allHolders.push(...result.data.holders);
      console.log(
        `[API] Page ${page}: Found ${result.data.holders.length} holders (total: ${allHolders.length})`,
      );

      hasMore = result.data.holders.length === 100;
      page++;

      // Add delay between requests to avoid rate limiting
      if (hasMore) {
        console.log(
          `[API] Waiting ${DELAY / 1000} seconds before next request...`,
        );
        await new Promise((resolve) => setTimeout(resolve, DELAY));
      }
    } catch (error) {
      console.error(`[API] Error on page ${page}:`, error);
      break;
    }
  }

  return Response.json(
    {
      holders: allHolders.map((h) => ({
        account: h.account,
        quantity: h.quantity,
      })),
      count: allHolders.length,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "s-maxage=300, stale-while-revalidate", // 5 minute cache for full list
      },
    },
  );
};
