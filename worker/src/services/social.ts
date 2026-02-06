/**
 * Social Service for Worker
 *
 * Uses D1 database (kvStore table) for caching, NOT Cloudflare KV
 * Uses near-social-js to interact with social.near contract
 */

import { Social } from "near-social-js";
import type { Database } from "../db";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";

// =============================================================================
// TYPES
// =============================================================================

export interface FollowerInfo {
  accountId: string;
  profile?: any;
  followedAt?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes for social data

// =============================================================================
// SERVICE
// =============================================================================

export class SocialService {
  private social: Social;

  constructor(private db: Database, network: "mainnet" | "testnet" = "mainnet") {
    this.social = new Social({ network });
  }

  /**
   * Strip network suffix from account ID
   * e.g., "jemartel.near:mainnet" -> "jemartel.near"
   */
  private stripNetworkSuffix(accountId: string): string {
    return accountId.replace(/:(mainnet|testnet)$/, "");
  }

  /**
   * Prepare follow transaction (client-side signing required)
   */
  async prepareFollowTransaction(
    accountId: string,
    targetAccountId: string
  ): Promise<{ success: boolean; transaction?: any; error?: string }> {
    try {
      // Strip network suffix for social.near contract
      const fromAccount = this.stripNetworkSuffix(accountId);
      const toAccount = this.stripNetworkSuffix(targetAccountId);

      return {
        success: true,
        transaction: {
          contractId: "social.near",
          methodName: "set",
          args: {
            data: {
              [fromAccount]: {
                graph: {
                  follow: {
                    [toAccount]: true,
                  },
                },
              },
            },
          },
          gas: "300000000000000",
          deposit: "0",
        },
      };
    } catch (error) {
      console.error("[SocialService] Error preparing follow transaction:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Prepare unfollow transaction (client-side signing required)
   */
  async prepareUnfollowTransaction(
    accountId: string,
    targetAccountId: string
  ): Promise<{ success: boolean; transaction?: any; error?: string }> {
    try {
      return {
        success: true,
        transaction: {
          contractId: "social.near",
          methodName: "set",
          args: {
            data: {
              [accountId]: {
                graph: {
                  follow: {
                    [targetAccountId]: null, // null = delete/unfollow
                  },
                },
              },
            },
          },
          gas: "300000000000000",
          deposit: "0",
        },
      };
    } catch (error) {
      console.error("[SocialService] Error preparing unfollow transaction:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get followers list with D1 caching
   * Uses built-in social.getFollowers() method
   */
  async getFollowers(
    accountId: string,
    limit = 50,
    offset = 0
  ): Promise<PaginatedResult<FollowerInfo>> {
    const cacheKey = `social:followers:${accountId}`;

    try {
      // Try D1 cache first
      const cached = await this.getCachedFromD1<FollowerInfo[]>(cacheKey);
      if (cached) {
        return this.paginate(cached, limit, offset);
      }

      // Fetch from social.near using built-in method
      const followersList = await this.social.getFollowers(accountId);

      // Transform to our format
      const followers: FollowerInfo[] = Object.keys(followersList || {}).map((id) => ({
        accountId: id,
      }));

      // Cache to D1
      await this.setCachedToD1(cacheKey, followers);

      return this.paginate(followers, limit, offset);
    } catch (error) {
      console.error(`[SocialService] Error fetching followers for ${accountId}:`, error);
      return { items: [], total: 0, hasMore: false };
    }
  }

  /**
   * Get following list with D1 caching
   * Uses built-in social.getFollowing() method
   */
  async getFollowing(
    accountId: string,
    limit = 50,
    offset = 0
  ): Promise<PaginatedResult<FollowerInfo>> {
    const cacheKey = `social:following:${accountId}`;

    try {
      // Try D1 cache first
      const cached = await this.getCachedFromD1<FollowerInfo[]>(cacheKey);
      if (cached) {
        return this.paginate(cached, limit, offset);
      }

      // Fetch from social.near using built-in method
      const followingList = await this.social.getFollowing(accountId);

      const following: FollowerInfo[] = Object.keys(followingList || {}).map((id) => ({
        accountId: id,
      }));

      // Cache to D1
      await this.setCachedToD1(cacheKey, following);

      return this.paginate(following, limit, offset);
    } catch (error) {
      console.error(`[SocialService] Error fetching following for ${accountId}:`, error);
      return { items: [], total: 0, hasMore: false };
    }
  }

  /**
   * Check if accountId is following targetAccountId
   */
  async isFollowing(
    accountId: string,
    targetAccountId: string
  ): Promise<boolean> {
    try {
      // Check D1 cache first
      const cacheKey = `social:following:${accountId}:${targetAccountId}`;
      const cached = await this.getCachedFromD1<boolean>(cacheKey);
      if (cached !== null) {
        return cached;
      }

      // Fetch from social.near
      const data = await this.social.get({
        keys: [`graph.follow.${accountId}.${targetAccountId}`],
      });

      const isFollowing = !!data?.[accountId]?.graph?.follow?.[targetAccountId];

      // Cache to D1
      await this.setCachedToD1(cacheKey, isFollowing);

      return isFollowing;
    } catch (error) {
      console.error(`[SocialService] Error checking follow status:`, error);
      return false;
    }
  }

  // ===========================================================================
  // PRIVATE HELPERS (using D1 database, NOT Cloudflare KV)
  // ===========================================================================

  private paginate<T>(
    items: T[],
    limit: number,
    offset: number
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
        // Delete expired entry
        await this.db
          .delete(schema.kvStore)
          .where(eq(schema.kvStore.key, key));
        return null;
      }

      return JSON.parse(entry.value) as T;
    } catch (error) {
      console.error("[SocialService] D1 cache read error:", error);
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
          nearAccountId: "system", // System cache, not user-specific
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
      console.error("[SocialService] D1 cache write error:", error);
    }
  }
}
