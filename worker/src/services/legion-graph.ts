/**
 * Legion Graph Service
 *
 * Custom follow graph using social.near contract with Graph API.
 * Stores under: {accountId}/graph/follow/{targetAccountId} = "legion"
 *
 * Separate from main social graph by using "legion" value
 */

import { Graph } from "near-social-js";
import type { Database } from "../db";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";

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

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for legion graph

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
   * Stores:
   * - Data: {accountId}/legion/follow/{targetAccountId} = true
   * - Index: {accountId}/index/graph/legion/{targetAccountId} = {key: accountId}
   */
  async prepareFollowTransaction(
    accountId: string,
    targetAccountId: string,
  ): Promise<{ success: boolean; transaction?: any; error?: string }> {
    try {
      // Strip network suffix for social.near contract
      const fromAccount = this.stripNetworkSuffix(accountId);
      const toAccount = this.stripNetworkSuffix(targetAccountId);

      console.log("[LegionGraphService] Preparing follow transaction:", {
        from: fromAccount,
        to: toAccount,
        originalFrom: accountId,
        originalTo: targetAccountId,
      });

      // Store data + index for discoverability
      const args = {
        data: {
          [fromAccount]: {
            // Data storage (for reading)
            legion: {
              follow: {
                [toAccount]: "1",
              },
            },
            // Index (for discovering who follows this account via legion)
            index: {
              graph: {
                legion: {
                  [toAccount]: {
                    key: fromAccount, // Store who is following
                    type: "legion",
                  },
                },
              },
            },
          },
        },
      };

      console.log(
        "[LegionGraphService] Transaction args:",
        JSON.stringify(args, null, 2),
      );

      return {
        success: true,
        transaction: {
          contractId: "social.near",
          methodName: "set",
          args,
          gas: "300000000000000",
          deposit: "0.001 NEAR",
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
   */
  async prepareUnfollowTransaction(
    accountId: string,
    targetAccountId: string,
  ): Promise<{ success: boolean; transaction?: any; error?: string }> {
    try {
      // Strip network suffix for social.near contract
      const fromAccount = this.stripNetworkSuffix(accountId);
      const toAccount = this.stripNetworkSuffix(targetAccountId);

      console.log("[LegionGraphService] Preparing unfollow transaction:", {
        from: fromAccount,
        to: toAccount,
        originalFrom: accountId,
        originalTo: targetAccountId,
      });

      const args = {
        data: {
          [fromAccount]: {
            legion: {
              follow: {
                [toAccount]: null, // null = delete
              },
            },
          },
        },
      };

      console.log(
        "[LegionGraphService] Unfollow args:",
        JSON.stringify(args, null, 2),
      );

      return {
        success: true,
        transaction: {
          contractId: "social.near",
          methodName: "set",
          args,
          gas: "300000000000000",
          deposit: "0",
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
   * Get Legion followers using graph.index()
   * Reads index: index/graph/legion/{accountId}
   */
  async getFollowers(
    accountId: string,
    limit = 50,
    offset = 0,
  ): Promise<PaginatedResult<FollowerInfo>> {
    const cacheKey = `legion:followers:${accountId}`;
    const cleanAccountId = this.stripNetworkSuffix(accountId);

    try {
      // Try D1 cache first
      const cached = await this.getCachedFromD1<FollowerInfo[]>(cacheKey);
      if (cached) {
        return this.paginate(cached, limit, offset);
      }

      console.log(
        "[LegionGraphService] Fetching legion followers for:",
        cleanAccountId,
      );

      // Use graph.index to discover who follows this account via legion
      const result = await this.graph.index({
        action: "graph",
        key: `legion/${cleanAccountId}`,
        limit: limit + offset, // Fetch enough to handle offset
      });

      console.log("[LegionGraphService] Graph.index() followers returned:", {
        accountId: cleanAccountId,
        result,
      });

      // Extract follower IDs from index result
      const followers: FollowerInfo[] = result
        .map((item: any) => {
          // Index stores: {key: followerAccountId, type: "legion"}
          if (item.key) {
            return {
              accountId: item.key,
            };
          }
          return null;
        })
        .filter((item): item is FollowerInfo => item !== null);

      console.log(
        "[LegionGraphService] Found legion followers:",
        followers.length,
      );

      // Cache to D1
      await this.setCachedToD1(cacheKey, followers);

      return this.paginate(followers, limit, offset);
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
   * Reads: {accountId}/legion/follow/**
   */
  async getFollowing(
    accountId: string,
    limit = 50,
    offset = 0,
  ): Promise<PaginatedResult<FollowerInfo>> {
    const cacheKey = `legion:following:${accountId}`;

    try {
      // Strip network suffix for social.near query
      const cleanAccountId = this.stripNetworkSuffix(accountId);

      console.log(
        "[LegionGraphService] Fetching legion following for:",
        cleanAccountId,
      );

      // Try D1 cache first
      const cached = await this.getCachedFromD1<FollowerInfo[]>(cacheKey);
      if (cached) {
        console.log("[LegionGraphService] Using cached following data");
        return this.paginate(cached, limit, offset);
      }

      // Read from legion/follow namespace
      const data = await this.graph.get({
        keys: [`${cleanAccountId}/legion/follow/**`],
      });

      console.log("[LegionGraphService] Graph.get() following returned:", {
        accountId: cleanAccountId,
        hasData: !!data,
        keys: data ? Object.keys(data) : [],
      });

      const followList = data?.[cleanAccountId]?.legion?.follow || {};

      // Convert to array of account IDs
      const following: FollowerInfo[] = Object.keys(followList).map((id) => ({
        accountId: id,
      }));

      console.log(
        "[LegionGraphService] Found legion following:",
        following.length,
      );

      // Cache to D1
      await this.setCachedToD1(cacheKey, following);

      return this.paginate(following, limit, offset);
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
      // Strip network suffix for social.near query
      const cleanAccountId = this.stripNetworkSuffix(accountId);
      const cleanTargetAccountId = this.stripNetworkSuffix(targetAccountId);

      console.log("[LegionGraphService] Checking legion follow status:", {
        from: cleanAccountId,
        to: cleanTargetAccountId,
      });

      const data = await this.graph.get({
        keys: [`${cleanAccountId}/legion/follow/${cleanTargetAccountId}`],
      });

      const isFollowing =
        data?.[cleanAccountId]?.legion?.follow?.[cleanTargetAccountId] !==
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
   */
  async getStats(
    accountId: string,
  ): Promise<{ followers: number; following: number }> {
    try {
      // Strip network suffix for social.near query
      const cleanAccountId = this.stripNetworkSuffix(accountId);

      // Get following count from direct data
      const followingData = await this.graph.get({
        keys: [`${cleanAccountId}/legion/follow/**`],
      });

      const followList = followingData?.[cleanAccountId]?.legion?.follow || {};
      const followingCount = Object.keys(followList).length;

      console.log(
        "[LegionGraphService] Stats for",
        cleanAccountId,
        "following:",
        followingCount,
      );

      // Get followers count using index
      const followersResult = await this.graph.index({
        action: "graph",
        key: `legion/${cleanAccountId}`,
        limit: 1000, // Fetch up to 1000 for accurate count
      });

      const followersCount = followersResult.length;

      console.log(
        "[LegionGraphService] Stats for",
        cleanAccountId,
        "followers:",
        followersCount,
      );

      return { followers: followersCount, following: followingCount };
    } catch (error) {
      console.error("[LegionGraphService] Error fetching legion stats:", error);
      return { followers: 0, following: 0 };
    }
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Check if account holds any Legion NFT
   * Queries all known Legion contracts
   */
  private async hasLegionNft(accountId: string): Promise<boolean> {
    try {
      // Check holdings from our database (cached NFT data)
      const holder = await this.db.query.nftHoldings.findFirst({
        where: eq(schema.nftHoldings.accountId, accountId),
      });

      if (!holder) return false;

      // Parse holdings JSON and check if any contract is a Legion contract
      const holdings = holder.holdings as any;
      if (!Array.isArray(holdings)) return false;

      return holdings.some(
        (h: any) =>
          h.contractId &&
          LEGION_CONTRACTS.some((contract) =>
            h.contractId.includes(
              contract.replace(".near", "").replace(".tg", ""),
            ),
          ),
      );
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
      await this.db
        .insert(schema.kvStore)
        .values({
          key,
          value: JSON.stringify(value),
          nearAccountId: "system",
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [schema.kvStore.key],
          set: {
            value: JSON.stringify(value),
            updatedAt: now,
          },
        });
    } catch (error) {
      console.error("[LegionGraphService] D1 cache write error:", error);
    }
  }
}
