import { Effect } from "every-plugin/effect";
import { Social } from "near-social-js";
import type { Database as DrizzleDatabase } from "../db";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";

// =============================================================================
// TYPES
// =============================================================================

export interface SocialConfig {
  network: "mainnet" | "testnet";
}

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

  constructor(
    private db: DrizzleDatabase,
    config: SocialConfig
  ) {
    this.social = new Social({ network: config.network });
  }

  /**
   * Prepare follow transaction (client-side signing required)
   */
  async prepareFollowTransaction(
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
                    [targetAccountId]: true,
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
   * Get followers list with caching
   */
  async getFollowers(
    accountId: string,
    limit = 50,
    offset = 0
  ): Promise<PaginatedResult<FollowerInfo>> {
    const cacheKey = `social:followers:${accountId}`;

    try {
      // Try cache first
      const cached = await this.getCached<FollowerInfo[]>(cacheKey);
      if (cached) {
        return this.paginate(cached, limit, offset);
      }

      // Fetch from social.near using near-social-js
      const data = await this.social.get({
        keys: [`graph.followers.${accountId}`],
      });

      const followersList = data?.[accountId]?.graph?.followers || {};

      // Transform to our format
      const followers: FollowerInfo[] = Object.keys(followersList).map((id) => ({
        accountId: id,
        followedAt: followersList[id] || new Date().toISOString(),
      }));

      // Cache the results
      await this.setCached(cacheKey, followers);

      return this.paginate(followers, limit, offset);
    } catch (error) {
      console.error(`[SocialService] Error fetching followers for ${accountId}:`, error);
      return { items: [], total: 0, hasMore: false };
    }
  }

  /**
   * Get following list with caching
   */
  async getFollowing(
    accountId: string,
    limit = 50,
    offset = 0
  ): Promise<PaginatedResult<FollowerInfo>> {
    const cacheKey = `social:following:${accountId}`;

    try {
      // Try cache first
      const cached = await this.getCached<FollowerInfo[]>(cacheKey);
      if (cached) {
        return this.paginate(cached, limit, offset);
      }

      // Fetch from social.near
      const data = await this.social.get({
        keys: [`graph.follow.${accountId}`],
      });

      const followingList = data?.[accountId]?.graph?.follow || {};

      const following: FollowerInfo[] = Object.keys(followingList).map((id) => ({
        accountId: id,
        followedAt: followingList[id] || new Date().toISOString(),
      }));

      // Cache the results
      await this.setCached(cacheKey, following);

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
      // Fetch from social.near
      const data = await this.social.get({
        keys: [`graph.follow.${accountId}.${targetAccountId}`],
      });

      return !!data?.[accountId]?.graph?.follow?.[targetAccountId];
    } catch (error) {
      console.error(`[SocialService] Error checking follow status:`, error);
      return false;
    }
  }

  // ===========================================================================
  // PRIVATE HELPERS
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

  private async getCached<T>(key: string): Promise<T | null> {
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
      console.error("[SocialService] Cache read error:", error);
      return null;
    }
  }

  private async setCached(key: string, value: any): Promise<void> {
    const now = new Date();
    try {
      await this.db
        .insert(schema.kvStore)
        .values({
          key,
          value: JSON.stringify(value),
          nearAccountId: "system", // System cache
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
      console.error("[SocialService] Cache write error:", error);
    }
  }
}

// =============================================================================
// EFFECT LAYER
// =============================================================================

export const SocialContext = Effect.Tag("SocialService")<SocialService, SocialService | null>();

export const SocialLive = (
  db: DrizzleDatabase,
  config: SocialConfig
): Effect.Effect<SocialService, never, never> => {
  const service = new SocialService(db, config);
  return Effect.succeed(service);
};
