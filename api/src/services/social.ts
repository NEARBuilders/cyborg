import { Context, Layer, Effect } from "every-plugin/effect";
import type { Database as DrizzleDatabase } from "../db";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";

// =============================================================================
// TYPES
// =============================================================================

export interface SocialConfig {
  network: "mainnet" | "testnet";
  rpcUrl?: string; // Deprecated: round-robin is now used by default
  fastDataContract?: string;
  fastdataApiUrl?: string; // Optional: use fastdata-social API for reads
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

// Multiple RPC endpoints for round-robin
const RPC_ENDPOINTS = [
  "https://rpc.mainnet.near.org",
  "https://near.lava.build",
  "https://near.blockpi.network/v1/rpc/public",
  "https://near.drpc.org",
  "https://go.getblock.io/624a04f3e6d34380bee5c247fcf06c4e",
  "https://api.blockeden.xyz/near/67nCBdZQSH9z3YqDDjdm",
  "https://endpoints.omniatech.io/v1/near/mainnet/public",
] as const;

const FASTDATA_CONFIG = {
  CONTRACT_ID: "contextual.near",
  METHOD_NAME: "__fastdata_kv",
  KEY_PREFIX: "graph/follow",
} as const;

// =============================================================================
// ROUND-ROBIN RPC
// =============================================================================

let rpcIndex = 0;

function getNextRpcUrl(): string {
  const url = RPC_ENDPOINTS[rpcIndex];
  rpcIndex = (rpcIndex + 1) % RPC_ENDPOINTS.length;
  return url;
}

// =============================================================================
// SERVICE
// =============================================================================

export class SocialService {
  private fastDataContract: string;
  private fastdataApiUrl?: string;

  constructor(
    private db: DrizzleDatabase,
    config: SocialConfig
  ) {
    this.fastDataContract = config.fastDataContract || FASTDATA_CONFIG.CONTRACT_ID;
    this.fastdataApiUrl = config.fastdataApiUrl;
  }

  /**
   * Fetch from fastdata-social API if available
   */
  private async fetchFromFastdataAPI<T>(
    endpoint: string
  ): Promise<T | null> {
    if (!this.fastdataApiUrl) {
      return null;
    }

    try {
      const response = await fetch(`${this.fastdataApiUrl}${endpoint}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        console.error('[SocialService] API error:', response.status, response.statusText);
        return null;
      }

      return await response.json() as T;
    } catch (error) {
      console.error('[SocialService] API fetch error:', error);
      return null;
    }
  }

  /**
   * Query NEAR RPC for contract state with round-robin fallback
   */
  private async queryContractState(
    accountId: string,
    prefix: string,
    retries = 3
  ): Promise<Record<string, string | null>> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const rpcUrl = getNextRpcUrl();
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: `social-${accountId}-${Date.now()}`,
            method: 'query',
            params: {
              request_type: 'view_state',
              finality: 'final',
              account_id: accountId,
              prefix_base64: btoa(prefix),
            },
          }),
        });

        if (!response.ok) {
          console.warn(`[SocialService] RPC failed (${attempt + 1}/${retries}): ${response.status}`);
          if (attempt === retries - 1) return {};
          continue;
        }

        const json: unknown = await response.json();
        const rpcResponse = json as { error?: unknown; result?: { values?: Record<string, string | null> } };

        if (rpcResponse.error) {
          console.warn(`[SocialService] RPC error (${attempt + 1}/${retries}):`, rpcResponse.error);
          if (attempt === retries - 1) return {};
          continue;
        }

        // Parse the values from base64
        const result: Record<string, string | null> = {};
        const data = rpcResponse.result;
        if (data && data.values) {
          for (const [key, value] of Object.entries(data.values)) {
            // Decode base64 key
            const decodedKey = atob(key);
            // Decode base64 value if it exists
            const decodedValue = value ? atob(value as string) : null;
            result[decodedKey] = decodedValue;
          }
        }

        return result;
      } catch (error) {
        console.warn(`[SocialService] RPC exception (${attempt + 1}/${retries}):`, error);
        if (attempt === retries - 1) return {};
        continue;
      }
    }

    return {};
  }

  /**
   * Prepare follow transaction (client-side signing required)
   * Uses FastData Protocol: writes key "graph/follow/{target}" with value ""
   */
  async prepareFollowTransaction(
    accountId: string,
    targetAccountId: string
  ): Promise<{ success: boolean; transaction?: any; error?: string }> {
    try {
      const followKey = `${FASTDATA_CONFIG.KEY_PREFIX}/${targetAccountId}`;

      return {
        success: true,
        transaction: {
          contractId: this.fastDataContract,
          methodName: FASTDATA_CONFIG.METHOD_NAME,
          args: {
            data: {
              [followKey]: "",
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
   * Uses FastData Protocol: writes key "graph/follow/{target}" with value null (deletes)
   */
  async prepareUnfollowTransaction(
    accountId: string,
    targetAccountId: string
  ): Promise<{ success: boolean; transaction?: any; error?: string }> {
    try {
      const followKey = `${FASTDATA_CONFIG.KEY_PREFIX}/${targetAccountId}`;

      return {
        success: true,
        transaction: {
          contractId: this.fastDataContract,
          methodName: FASTDATA_CONFIG.METHOD_NAME,
          args: {
            data: {
              [followKey]: null,
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
   * Get following list with caching
   * Uses fastdata-social API if available, otherwise falls back to RPC queries with round-robin
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

      // Try fastdata-social API first
      const apiResult = await this.fetchFromFastdataAPI<{ accounts: string[] }>(
        `/social/${accountId}/following?limit=${limit}&offset=${offset}`
      );

      if (apiResult && apiResult.accounts) {
        const following: FollowerInfo[] = apiResult.accounts.map(acc => ({
          accountId: acc,
          followedAt: new Date().toISOString(),
        }));

        // Cache the results
        await this.setCached(cacheKey, following);

        return this.paginate(following, limit, offset);
      }

      // Fallback: Query FastData contract state for all graph/follow/* keys (with round-robin)
      const prefix = `${FASTDATA_CONFIG.KEY_PREFIX}/`;
      const state = await this.queryContractState(accountId, prefix);

      // Extract followed accounts from keys
      const following: FollowerInfo[] = Object.keys(state)
        .filter(key => key.startsWith(`${FASTDATA_CONFIG.KEY_PREFIX}/`))
        .map(key => {
          // Extract target account ID from key
          const targetAccountId = key.replace(`${FASTDATA_CONFIG.KEY_PREFIX}/`, '');
          return {
            accountId: targetAccountId,
            followedAt: new Date().toISOString(), // FastData doesn't store timestamps
          };
        });

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
   * Uses fastdata-social API if available, otherwise falls back to RPC queries with round-robin
   */
  async isFollowing(
    accountId: string,
    targetAccountId: string
  ): Promise<boolean> {
    try {
      // Try fastdata-social API first
      const apiResult = await this.fetchFromFastdataAPI<{ isFollowing: boolean }>(
        `/social/${accountId}/following/${targetAccountId}`
      );

      if (apiResult !== null) {
        return apiResult.isFollowing;
      }

      // Fallback: Query FastData contract state for the specific follow key (with round-robin)
      const prefix = `${FASTDATA_CONFIG.KEY_PREFIX}/${targetAccountId}`;
      const state = await this.queryContractState(accountId, prefix);

      // Check if the key exists and has a non-null value
      const key = `${FASTDATA_CONFIG.KEY_PREFIX}/${targetAccountId}`;
      return state[key] !== null && state[key] !== undefined;
    } catch (error) {
      console.error(`[SocialService] Error checking follow status:`, error);
      return false;
    }
  }

  /**
   * Get followers list with caching
   * Uses fastdata-social API if available (requires index for reverse lookup)
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

      // Try fastdata-social API first (this supports reverse lookups via index)
      const apiResult = await this.fetchFromFastdataAPI<{ accounts: string[] }>(
        `/social/${accountId}/followers?limit=${limit}&offset=${offset}`
      );

      if (apiResult && apiResult.accounts) {
        const followers: FollowerInfo[] = apiResult.accounts.map(acc => ({
          accountId: acc,
          followedAt: new Date().toISOString(),
        }));

        // Cache the results
        await this.setCached(cacheKey, followers);

        return this.paginate(followers, limit, offset);
      }

      // FastData doesn't support reverse lookups natively without an index
      // Return empty results if API is not available
      console.warn(`[SocialService] getFollowers requires fastdata-social API for reverse lookups`);
      return { items: [], total: 0, hasMore: false };
    } catch (error) {
      console.error(`[SocialService] Error fetching followers for ${accountId}:`, error);
      return { items: [], total: 0, hasMore: false };
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
// CONTEXT TAG
// =============================================================================

export class SocialContext extends Context.Tag("SocialService")<
  SocialContext,
  SocialService | null
>() {}

export const SocialLive = (
  db: DrizzleDatabase,
  config: SocialConfig
): Layer.Layer<SocialContext, never, never> => {
  const service = new SocialService(db, config);
  return Layer.succeed(SocialContext, service);
};
