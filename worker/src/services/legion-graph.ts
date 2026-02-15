/**
 * Legion Graph Service
 *
 * Custom follow graph using contextual.near contract with Graph API.
 * Stores under: {accountId}/graph/follow/{targetAccountId} = "legion"
 *
 * Separate from main social graph by using "legion" value
 */

import { Graph } from "near-social-js";
import type { Database } from "../db";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { buildFollowArgs, buildUnfollowArgs } from "./fastdata-builders";

// =============================================================================
// TYPES
// =============================================================================

export interface FollowerInfo {
  accountId: string;
  profile?: any;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  nextCursor?: string;
}

// =============================================================================
// LEGION NFT CONTRACTS (all Legion-related)
// =============================================================================

const LEGION_CONTRACTS = [
  "nearlegion.nfts.tg", // Main Legion NFTs
  "ascendant.nearlegion.near", // Ascendant Legion
  "initiate.nearlegion.near", // Initiate Legion
  // Add more Legion contracts as needed
];

// =============================================================================
// CONSTANTS
// =============================================================================

const CACHE_TTL_MS = 1 * 60 * 1000; // 1 minute for legion graph (more fresh data)

// =============================================================================
// SERVICE
// =============================================================================

export class LegionGraphService {
  private graph: Graph;

  constructor(
    private db: Database,
    network: "mainnet" | "testnet" = "mainnet",
  ) {
    this.graph = new Graph({ network });
  }

  /**
   * Strip network suffix from account ID
   * e.g., "jemartel.near:mainnet" -> "jemartel.near"
   */
  private stripNetworkSuffix(accountId: string): string {
    return accountId.replace(/:(mainnet|testnet)$/, "");
  }

  /**
   * Prepare Legion follow transaction
   * Uses FastData protocol pattern: flat KV pairs
   */
  async prepareFollowTransaction(
    accountId: string,
    targetAccountId: string,
  ): Promise<{ success: boolean; transaction?: any; error?: string }> {
    try {
      // Strip network suffix for contextual.near contract
      const fromAccount = this.stripNetworkSuffix(accountId);
      const toAccount = this.stripNetworkSuffix(targetAccountId);

      console.log("[LegionGraphService] Preparing follow transaction:", {
        from: fromAccount,
        to: toAccount,
        originalFrom: accountId,
        originalTo: targetAccountId,
      });

      // Use FastData builder to create KV pairs
      const kvPairs = buildFollowArgs(fromAccount, toAccount);

      console.log(
        "[LegionGraphService] Transaction KV pairs:",
        JSON.stringify(kvPairs, null, 2),
      );

      return {
        success: true,
        transaction: {
          contractId: "contextual.near",
          methodName: "__fastdata_kv",
          args: kvPairs, // Flat KV pairs directly as args
          gas: "300000000000000",
          deposit: "0 NEAR",
        },
      };
    } catch (error) {
      console.error(
        "[LegionGraphService] Error preparing follow transaction:",
        error,
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Prepare Legion unfollow transaction
   * Uses FastData protocol pattern: flat KV pairs
   */
  async prepareUnfollowTransaction(
    accountId: string,
    targetAccountId: string,
  ): Promise<{ success: boolean; transaction?: any; error?: string }> {
    try {
      // Strip network suffix for contextual.near contract
      const fromAccount = this.stripNetworkSuffix(accountId);
      const toAccount = this.stripNetworkSuffix(targetAccountId);

      console.log("[LegionGraphService] Preparing unfollow transaction:", {
        from: fromAccount,
        to: toAccount,
        originalFrom: accountId,
        originalTo: targetAccountId,
      });

      // Use FastData builder to create KV pairs
      const kvPairs = buildUnfollowArgs(fromAccount, toAccount);

      console.log(
        "[LegionGraphService] Unfollow KV pairs:",
        JSON.stringify(kvPairs, null, 2),
      );

      return {
        success: true,
        transaction: {
          contractId: "contextual.near",
          methodName: "__fastdata_kv",
          args: kvPairs, // Flat KV pairs directly as args
          gas: "300000000000000",
          deposit: "0 NEAR",
        },
      };
    } catch (error) {
      console.error(
        "[LegionGraphService] Error preparing unfollow transaction:",
        error,
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get Legion followers from FastData indexer API
   * Queries the FastData API to get all accounts that follow this account
   */
  async getFollowers(
    accountId: string,
    limit = 50,
    offset = 0,
    bypassCache = false,
    afterAccount?: string,
  ): Promise<PaginatedResult<FollowerInfo>> {
    const cacheKey = `legion:followers:${accountId}`;
    const cleanAccountId = this.stripNetworkSuffix(accountId);

    try {
      // Try D1 cache first (only if not using cursor and not bypassing)
      if (!bypassCache && !afterAccount) {
        const cached = await this.getCachedFromD1<FollowerInfo[]>(cacheKey);
        if (cached) {
          console.log("[LegionGraphService] Using cached followers data");
          return this.paginate(cached, limit, offset);
        }
      } else {
        console.log("[LegionGraphService] Bypassing cache per request");
      }

      console.log(
        "[LegionGraphService] Fetching legion followers from FastData API:",
        cleanAccountId,
        afterAccount ? `(after ${afterAccount})` : "",
      );

      // Query FastData API for followers (reads from blockchain index)
      const apiUrl = "https://fastdata.up.railway.app";
      const afterParam = afterAccount ? `&after_account=${afterAccount}` : '';
      const url = `${apiUrl}/v1/social/followers?account_id=${cleanAccountId}&contract_id=contextual.near&limit=${limit}&offset=${offset}${afterParam}`;

      console.log(`[LegionGraphService] FastData API URL: ${url}`);

      const response = await fetch(url);

      console.log(`[LegionGraphService] FastData API response status: ${response.status}`);

      if (!response.ok) {
        console.error("[LegionGraphService] FastData API response:", response.status, await response.text());
        throw new Error(`FastData API error: ${response.status}`);
      }

      // FastData API returns: { data: string[], count, meta }
      const data = await response.json() as { data?: string[]; accounts?: string[]; count?: number; meta?: { has_more?: boolean; next_cursor?: string } };

      console.log(`[LegionGraphService] FastData API raw response:`, JSON.stringify(data, null, 2));

      // FastData API returns 'data' field, but also check 'accounts' for backwards compatibility
      const followersList = data.data || data.accounts || [];
      const followers: FollowerInfo[] = followersList.map((id: string) => ({
        accountId: id,
      }));

      const hasMore = data.meta?.has_more ?? false;
      const nextCursor = data.meta?.next_cursor;

      console.log(
        "[LegionGraphService] Processed - page size:",
        followers.length,
        "hasMore:",
        hasMore,
        "nextCursor:",
        nextCursor,
      );

      // Cache to D1 (only if not using cursor and not bypassing)
      if (!bypassCache && !afterAccount) {
        if (offset === 0 && hasMore) {
          // Fetch more for cache on first page when there are more results
          console.log(`[LegionGraphService] Fetching more for cache (has_more=${hasMore})`);
          const allResponse = await fetch(
            `${apiUrl}/v1/social/followers?account_id=${cleanAccountId}&contract_id=contextual.near&limit=1000`,
          );
          if (allResponse.ok) {
            const allData = await allResponse.json() as { data?: string[]; accounts?: string[] };
            const allFollowers: FollowerInfo[] = (allData.data || allData.accounts || []).map((id: string) => ({
              accountId: id,
            }));
            console.log(`[LegionGraphService] Cached ${allFollowers.length} followers for ${cacheKey}`);
            await this.setCachedToD1(cacheKey, allFollowers);
          }
        } else {
          await this.setCachedToD1(cacheKey, followers);
        }
      }

      const result: PaginatedResult<FollowerInfo> = {
        items: followers,
        total: followers.length,
        hasMore,
      };

      // Only add cursor if there are more results
      if (hasMore && nextCursor) {
        result.nextCursor = nextCursor;
      } else if (hasMore && followers.length > 0) {
        // Fallback: use last account ID as cursor
        result.nextCursor = followers[followers.length - 1].accountId;
      }

      return result;
    } catch (error) {
      console.error(
        `[LegionGraphService] Error fetching legion followers for ${accountId}:`,
        error,
      );
      return { items: [], total: 0, hasMore: false };
    }
  }

  /**
   * Get Legion following (accounts this account follows in Legion graph)
   * Uses FastData API to get accurate data from contextual.near
   */
  async getFollowing(
    accountId: string,
    limit = 50,
    offset = 0,
    bypassCache = false,
    afterAccount?: string,
  ): Promise<PaginatedResult<FollowerInfo>> {
    const cacheKey = `legion:following:${accountId}`;
    const cleanAccountId = this.stripNetworkSuffix(accountId);

    try {
      console.log(
        "[LegionGraphService] Fetching legion following from FastData API:",
        cleanAccountId,
        bypassCache ? "(bypassing cache)" : "",
        afterAccount ? `(after ${afterAccount})` : "",
      );

      // Try D1 cache first (only if not using cursor and not bypassing)
      if (!bypassCache && !afterAccount) {
        const cached = await this.getCachedFromD1<FollowerInfo[]>(cacheKey);
        if (cached) {
          console.log("[LegionGraphService] Using cached following data");
          return this.paginate(cached, limit, offset);
        }
      } else {
        console.log("[LegionGraphService] Bypassing cache per request");
      }

      // Query FastData API for following (reads from blockchain index)
      const apiUrl = "https://fastdata.up.railway.app";
      const afterParam = afterAccount ? `&after_account=${afterAccount}` : '';
      const url = `${apiUrl}/v1/social/following?account_id=${cleanAccountId}&contract_id=contextual.near&limit=${limit}&offset=${offset}${afterParam}`;

      console.log(`[LegionGraphService] FastData API URL: ${url}`);

      const response = await fetch(url);

      console.log(`[LegionGraphService] FastData API response status: ${response.status}`);

      if (!response.ok) {
        console.error("[LegionGraphService] FastData API response:", response.status, await response.text());
        throw new Error(`FastData API error: ${response.status}`);
      }

      // FastData API returns: { data: string[], count, meta }
      const data = await response.json() as { data?: string[]; accounts?: string[]; count?: number; meta?: { has_more?: boolean; next_cursor?: string } };

      console.log(`[LegionGraphService] FastData API raw response:`, JSON.stringify(data, null, 2));

      // FastData API returns 'data' field, but also check 'accounts' for backwards compatibility
      const followingList = data.data || data.accounts || [];
      const following: FollowerInfo[] = followingList.map((id: string) => ({
        accountId: id,
      }));

      const hasMore = data.meta?.has_more ?? false;
      const nextCursor = data.meta?.next_cursor;

      console.log(
        "[LegionGraphService] Processed - page size:",
        following.length,
        "hasMore:",
        hasMore,
        "nextCursor:",
        nextCursor,
      );

      // Cache to D1 (only if not using cursor and not bypassing)
      if (!bypassCache && !afterAccount) {
        if (offset === 0 && hasMore) {
          // Fetch more for cache on first page when there are more results
          console.log(`[LegionGraphService] Fetching more for cache (has_more=${hasMore})`);
          const allResponse = await fetch(
            `${apiUrl}/v1/social/following?account_id=${cleanAccountId}&contract_id=contextual.near&limit=1000`,
          );
          if (allResponse.ok) {
            const allData = await allResponse.json() as { data?: string[]; accounts?: string[] };
            const allFollowing: FollowerInfo[] = (allData.data || allData.accounts || []).map((id: string) => ({
              accountId: id,
            }));
            console.log(`[LegionGraphService] Cached ${allFollowing.length} following for ${cacheKey}`);
            await this.setCachedToD1(cacheKey, allFollowing);
          }
        } else {
          await this.setCachedToD1(cacheKey, following);
        }
      }

      const result: PaginatedResult<FollowerInfo> = {
        items: following,
        total: following.length,
        hasMore,
      };

      // Only add cursor if there are more results
      if (hasMore && nextCursor) {
        result.nextCursor = nextCursor;
      } else if (hasMore && following.length > 0) {
        // Fallback: use last account ID as cursor
        result.nextCursor = following[following.length - 1].accountId;
      }

      return result;
    } catch (error) {
      console.error(
        `[LegionGraphService] Error fetching legion following for ${accountId}:`,
        error,
      );
      return { items: [], total: 0, hasMore: false };
    }
  }

  /**
   * Check if accountId follows targetAccountId in Legion graph
   */
  async isFollowing(
    accountId: string,
    targetAccountId: string,
  ): Promise<boolean> {
    try {
      // Strip network suffix for contextual.near query
      const cleanAccountId = this.stripNetworkSuffix(accountId);
      const cleanTargetAccountId = this.stripNetworkSuffix(targetAccountId);

      console.log("[LegionGraphService] Checking legion follow status:", {
        from: cleanAccountId,
        to: cleanTargetAccountId,
      });

      const data = await this.graph.get({
        keys: [`${cleanAccountId}/graph/follow/${cleanTargetAccountId}`],
      }) as Record<string, any> | undefined;

      const isFollowing =
        data?.[cleanAccountId]?.graph?.follow?.[cleanTargetAccountId] !==
        undefined;

      console.log("[LegionGraphService] Follow status result:", {
        from: cleanAccountId,
        to: cleanTargetAccountId,
        isFollowing,
      });

      return isFollowing;
    } catch (error) {
      console.error(
        "[LegionGraphService] Error checking legion follow status:",
        error,
      );
      return false;
    }
  }

  /**
   * Get Legion follow stats (followers/following counts)
   * Uses cached D1 data when available for instant counts,
   * otherwise fetches first page from FastData API
   */
  async getStats(
    accountId: string,
  ): Promise<{ followers: number; following: number }> {
    try {
      const cleanAccountId = this.stripNetworkSuffix(accountId);
      const apiUrl = "https://fastdata.up.railway.app";

      // Check D1 cache first for instant stats
      const followersCacheKey = `legion:followers:${cleanAccountId}`;
      const followingCacheKey = `legion:following:${cleanAccountId}`;

      const [cachedFollowers, cachedFollowing] = await Promise.all([
        this.getCachedFromD1<{ accountId: string }[]>(followersCacheKey),
        this.getCachedFromD1<{ accountId: string }[]>(followingCacheKey),
      ]);

      // If we have cached data, use it for instant stats
      if (cachedFollowers && cachedFollowing) {
        const stats = {
          followers: cachedFollowers.length,
          following: cachedFollowing.length,
        };
        console.log("[LegionGraphService] Stats from cache for", cleanAccountId, stats);
        return stats;
      }

      // Otherwise, fetch first page from FastData API with larger limit
      const [followersResponse, followingResponse] = await Promise.all([
        fetch(`${apiUrl}/v1/social/followers?account_id=${cleanAccountId}&contract_id=contextual.near&limit=1000`),
        fetch(`${apiUrl}/v1/social/following?account_id=${cleanAccountId}&contract_id=contextual.near&limit=1000`),
      ]);

      let followersCount = 0;
      let followingCount = 0;

      if (followersResponse.ok) {
        const data = await followersResponse.json() as {
          data?: string[];
          accounts?: string[];
          count: number;
          meta: { has_more: boolean; next_cursor?: string };
        };
        followersCount = (data.data || data.accounts || []).length;
        if (data.meta.has_more) {
          console.log("[LegionGraphService] Followers has more pages, count is at least:", followersCount);
        }
      } else {
        console.error("[LegionGraphService] Followers API error:", followersResponse.status);
      }

      if (followingResponse.ok) {
        const data = await followingResponse.json() as {
          data?: string[];
          accounts?: string[];
          count: number;
          meta: { has_more: boolean; next_cursor?: string };
        };
        followingCount = (data.data || data.accounts || []).length;
        if (data.meta.has_more) {
          console.log("[LegionGraphService] Following has more pages, count is at least:", followingCount);
        }
      } else {
        console.error("[LegionGraphService] Following API error:", followingResponse.status);
      }

      const stats = { followers: followersCount, following: followingCount };
      console.log("[LegionGraphService] Stats from API for", cleanAccountId, stats);
      return stats;
    } catch (error) {
      console.error("[LegionGraphService] Error fetching legion stats:", error);
      return { followers: 0, following: 0 };
    }
  }

  /**
   * Record a follow relationship in the database
   * Call this after a successful follow transaction
   */
  async recordFollow(
    followerAccountId: string,
    followingAccountId: string,
  ): Promise<void> {
    try {
      const followerAccount = this.stripNetworkSuffix(followerAccountId);
      const followingAccount = this.stripNetworkSuffix(followingAccountId);

      await this.db
        .insert(schema.legionFollows)
        .values({
          followerAccountId: followerAccount,
          followingAccountId: followingAccount,
          createdAt: new Date(),
        })
        .onConflictDoNothing({
          target: [schema.legionFollows.followerAccountId, schema.legionFollows.followingAccountId],
        });

      console.log(
        "[LegionGraphService] Recorded follow:",
        followerAccount,
        "->",
        followingAccount,
      );

      // Invalidate cache
      await this.invalidateCache([followerAccount, followingAccount]);
    } catch (error) {
      console.error("[LegionGraphService] Error recording follow:", error);
    }
  }

  /**
   * Remove a follow relationship from the database
   * Call this after a successful unfollow transaction
   */
  async recordUnfollow(
    followerAccountId: string,
    followingAccountId: string,
  ): Promise<void> {
    try {
      const followerAccount = this.stripNetworkSuffix(followerAccountId);
      const followingAccount = this.stripNetworkSuffix(followingAccountId);

      await this.db
        .delete(schema.legionFollows)
        .where(
          and(
            eq(schema.legionFollows.followerAccountId, followerAccount),
            eq(schema.legionFollows.followingAccountId, followingAccount),
          ),
        );

      console.log(
        "[LegionGraphService] Removed follow:",
        followerAccount,
        "->",
        followingAccount,
      );

      // Invalidate cache
      await this.invalidateCache([followerAccount, followingAccount]);
    } catch (error) {
      console.error("[LegionGraphService] Error removing follow:", error);
    }
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Check if account holds any Legion NFT
   * Queries the legionHolders table
   */
  private async hasLegionNft(accountId: string): Promise<boolean> {
    try {
      // Check holdings from our database (cached NFT data)
      const holders = await this.db.query.legionHolders.findMany({
        where: eq(schema.legionHolders.accountId, accountId),
      });

      return holders.length > 0;
    } catch (error) {
      console.error("[LegionGraphService] Error checking Legion NFT:", error);
      return false;
    }
  }

  private paginate<T>(
    items: T[],
    limit: number,
    offset: number,
  ): PaginatedResult<T> {
    const total = items.length;
    const paginatedItems = items.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return { items: paginatedItems, total, hasMore };
  }

  private async getCachedFromD1<T>(key: string): Promise<T | null> {
    try {
      const entry = await this.db.query.kvStore.findFirst({
        where: eq(schema.kvStore.key, key),
      });

      if (!entry) return null;

      // Check TTL
      const age = Date.now() - entry.updatedAt.getTime();
      if (age > CACHE_TTL_MS) {
        await this.db.delete(schema.kvStore).where(eq(schema.kvStore.key, key));
        return null;
      }

      return JSON.parse(entry.value) as T;
    } catch (error) {
      console.error("[LegionGraphService] D1 cache read error:", error);
      return null;
    }
  }

  private async setCachedToD1(key: string, value: any): Promise<void> {
    const now = new Date();
    try {
      const valueStr = JSON.stringify(value);
      console.log(`[LegionGraphService] Writing to D1 cache: key=${key}, valueLength=${valueStr.length}`);

      await this.db
        .insert(schema.kvStore)
        .values({
          key,
          value: valueStr,
          nearAccountId: "system",
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [schema.kvStore.key, schema.kvStore.nearAccountId],
          set: {
            value: valueStr,
            updatedAt: now,
          },
        });

      console.log(`[LegionGraphService] D1 cache write successful: ${key}`);
    } catch (error) {
      console.error("[LegionGraphService] D1 cache write error:", error);
      // Don't throw - cache failures shouldn't break the API
    }
  }

  /**
   * Invalidate cached data for specific accounts
   * Call this after a successful follow/unfollow to refresh the data
   */
  async invalidateCache(accountIds: string[]): Promise<void> {
    try {
      const keysToDelete = [
        // Invalidate followers cache
        ...accountIds.map((id) => `legion:followers:${id}`),
        // Invalidate following cache
        ...accountIds.map((id) => `legion:following:${id}`),
        // Invalidate stats cache
        ...accountIds.map((id) => `legion:stats:${id}`),
      ];

      for (const key of keysToDelete) {
        await this.db.delete(schema.kvStore).where(eq(schema.kvStore.key, key));
      }

      console.log("[LegionGraphService] Invalidated cache for:", accountIds);
    } catch (error) {
      console.error("[LegionGraphService] Cache invalidation error:", error);
    }
  }
}
