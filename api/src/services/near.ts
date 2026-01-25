/**
 * NEAR Service
 *
 * Handles NEAR blockchain interactions for NFT rank detection
 */

import { eq, and, sql } from "drizzle-orm";
import { Context, Layer } from "every-plugin/effect";
import type { Database as DrizzleDatabase } from "../db";
import * as schema from "../db/schema";

// =============================================================================
// TYPES
// =============================================================================

export interface NearConfig {
  rpcUrl: string;
  contractId: string; // nearlegion.nfts.tg for rank skillcapes
  initiateContractId: string; // initiate.nearlegion.near for onboarding SBT
}

export type RankTier = "legendary" | "epic" | "rare" | "common";

export interface RankData {
  rank: RankTier;
  tokenId: string;
  lastChecked: string;
}

interface NftToken {
  token_id: string;
  owner_id: string;
  metadata?: {
    title?: string;
    description?: string;
    media?: string;
    media_hash?: string;
    copies?: number;
    issued_at?: string;
    expires_at?: string;
    starts_at?: string;
    updated_at?: string;
    extra?: string;
    reference?: string;
    reference_hash?: string;
    [key: string]: unknown;
  };
}

interface NearRpcResponse {
  result?: {
    result?: number[];
  };
  error?: {
    message: string;
    data?: unknown;
  };
}

// =============================================================================
// CACHE CONSTANTS
// =============================================================================

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_KEY_PREFIX = "nft:rank:";
const RPC_TIMEOUT_MS = 5000; // 5 seconds

// =============================================================================
// RANK HIERARCHY
// =============================================================================

const RANK_HIERARCHY: Record<RankTier, number> = {
  legendary: 4,
  epic: 3,
  rare: 2,
  common: 1,
};

// =============================================================================
// SERVICE
// =============================================================================

export class NearService {
  constructor(
    private db: DrizzleDatabase,
    private config: NearConfig,
  ) {}

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Check if user has the initiate token (onboarding SBT)
   */
  async hasInitiateToken(nearAccountId: string): Promise<boolean> {
    try {
      const tokens = await this.fetchNftsFromChain(nearAccountId, this.config.initiateContractId);
      return tokens.length > 0;
    } catch (error) {
      console.error(`[NearService] Error checking initiate token for ${nearAccountId}:`, error);
      return false;
    }
  }

  /**
   * Get user's NFT rank (with caching)
   */
  async getUserRank(nearAccountId: string): Promise<RankData | null> {
    console.log(`[NearService] Getting rank for ${nearAccountId}`);

    // Check cache first
    const cached = await this.getCachedRank(nearAccountId);
    if (cached) {
      console.log(`[NearService] Cache hit for ${nearAccountId}: ${cached.rank}`);
      return cached;
    }

    // Cache miss - fetch from blockchain
    console.log(`[NearService] Cache miss for ${nearAccountId}, fetching from chain`);
    try {
      const tokens = await this.fetchNftsFromChain(nearAccountId, this.config.contractId);

      if (tokens.length === 0) {
        console.log(`[NearService] No rank skillcapes found for ${nearAccountId}`);
        return null;
      }

      const rankData = this.parseRankFromMetadata(tokens);

      if (rankData) {
        // Cache the result
        await this.setCachedRank(nearAccountId, rankData);
        console.log(`[NearService] Found ${rankData.rank} rank for ${nearAccountId} (token: ${rankData.tokenId})`);
      }

      return rankData;
    } catch (error) {
      console.error(`[NearService] Error fetching rank for ${nearAccountId}:`, error);
      return null;
    }
  }

  /**
   * Invalidate cached rank for a user
   */
  async invalidateCache(nearAccountId: string): Promise<void> {
    const cacheKey = `${CACHE_KEY_PREFIX}${nearAccountId}`;

    try {
      await this.db
        .delete(schema.kvStore)
        .where(
          and(
            eq(schema.kvStore.key, cacheKey),
            eq(schema.kvStore.nearAccountId, nearAccountId)
          )
        );

      console.log(`[NearService] Cache invalidated for ${nearAccountId}`);
    } catch (error) {
      console.error(`[NearService] Error invalidating cache for ${nearAccountId}:`, error);
    }
  }

  // ===========================================================================
  // BLOCKCHAIN INTERACTION
  // ===========================================================================

  /**
   * Fetch NFTs from NEAR blockchain
   */
  private async fetchNftsFromChain(nearAccountId: string, contractId?: string): Promise<NftToken[]> {
    const targetContract = contractId || this.config.contractId;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);

    try {
      // Prepare RPC request
      const args = { account_id: nearAccountId, from_index: "0", limit: 100 };
      const argsBase64 = Buffer.from(JSON.stringify(args)).toString("base64");

      const response = await fetch(this.config.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "dontcare",
          method: "query",
          params: {
            request_type: "call_function",
            finality: "final",
            account_id: targetContract,
            method_name: "nft_tokens_for_owner",
            args_base64: argsBase64,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`RPC request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as NearRpcResponse;

      if (data.error) {
        throw new Error(`RPC error: ${data.error.message}`);
      }

      if (!data.result?.result) {
        throw new Error("Invalid RPC response format");
      }

      // Decode the result
      const resultBytes = data.result.result;
      const resultString = String.fromCharCode(...resultBytes);
      const tokens: NftToken[] = JSON.parse(resultString);

      return tokens;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.warn(`[NearService] RPC timeout for ${nearAccountId}`);
        throw new Error("RPC timeout");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse rank from NFT metadata
   */
  private parseRankFromMetadata(tokens: NftToken[]): RankData | null {
    if (tokens.length === 0) return null;

    let highestRank: { rank: RankTier; tokenId: string } | null = null;
    let highestRankValue = 0;

    for (const token of tokens) {
      const rank = this.extractRankFromToken(token);

      if (rank) {
        const rankValue = RANK_HIERARCHY[rank];
        if (rankValue > highestRankValue) {
          highestRankValue = rankValue;
          highestRank = { rank, tokenId: token.token_id };
        }
      }
    }

    if (!highestRank) {
      // No rank found in metadata, default to common
      const firstToken = tokens[0];
      if (!firstToken) {
        return null;
      }
      return {
        rank: "common",
        tokenId: firstToken.token_id,
        lastChecked: new Date().toISOString(),
      };
    }

    return {
      rank: highestRank.rank,
      tokenId: highestRank.tokenId,
      lastChecked: new Date().toISOString(),
    };
  }

  /**
   * Extract rank from individual token
   */
  private extractRankFromToken(token: NftToken): RankTier | null {
    if (!token.metadata) return null;

    // Check for rank in title (case-insensitive)
    const title = token.metadata.title?.toLowerCase() || "";
    if (title.includes("legendary")) return "legendary";
    if (title.includes("epic")) return "epic";
    if (title.includes("rare")) return "rare";
    if (title.includes("common")) return "common";

    // Check for rank in description
    const description = token.metadata.description?.toLowerCase() || "";
    if (description.includes("legendary")) return "legendary";
    if (description.includes("epic")) return "epic";
    if (description.includes("rare")) return "rare";
    if (description.includes("common")) return "common";

    // Check for rank in extra metadata (JSON string)
    if (token.metadata.extra) {
      try {
        const extra = JSON.parse(token.metadata.extra);
        const rank = extra?.rank?.toLowerCase();
        if (rank === "legendary") return "legendary";
        if (rank === "epic") return "epic";
        if (rank === "rare") return "rare";
        if (rank === "common") return "common";
      } catch {
        // Invalid JSON in extra field, ignore
      }
    }

    // Check for rank as a direct property
    const metadata = token.metadata as Record<string, unknown>;
    const rankProp = metadata?.rank;
    if (typeof rankProp === "string") {
      const rank = rankProp.toLowerCase();
      if (rank === "legendary") return "legendary";
      if (rank === "epic") return "epic";
      if (rank === "rare") return "rare";
      if (rank === "common") return "common";
    }

    return null;
  }

  // ===========================================================================
  // CACHE OPERATIONS
  // ===========================================================================

  /**
   * Get cached rank data
   */
  private async getCachedRank(nearAccountId: string): Promise<RankData | null> {
    const cacheKey = `${CACHE_KEY_PREFIX}${nearAccountId}`;

    try {
      const entry = await this.db.query.kvStore.findFirst({
        where: and(
          eq(schema.kvStore.key, cacheKey),
          eq(schema.kvStore.nearAccountId, nearAccountId)
        ),
      });

      if (!entry) return null;

      // Check TTL
      const age = Date.now() - entry.updatedAt.getTime();
      if (age > CACHE_TTL_MS) {
        console.log(`[NearService] Cache expired for ${nearAccountId}`);
        // Delete expired cache
        await this.invalidateCache(nearAccountId);
        return null;
      }

      // Parse cached data
      const rankData: RankData = JSON.parse(entry.value);
      return rankData;
    } catch (error) {
      console.error(`[NearService] Error reading cache for ${nearAccountId}:`, error);
      return null;
    }
  }

  /**
   * Set cached rank data
   */
  private async setCachedRank(nearAccountId: string, rankData: RankData): Promise<void> {
    const cacheKey = `${CACHE_KEY_PREFIX}${nearAccountId}`;
    const now = new Date();

    try {
      await this.db
        .insert(schema.kvStore)
        .values({
          key: cacheKey,
          value: JSON.stringify(rankData),
          nearAccountId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [schema.kvStore.key, schema.kvStore.nearAccountId],
          set: {
            value: JSON.stringify(rankData),
            updatedAt: now,
          },
        });
    } catch (error) {
      console.error(`[NearService] Error setting cache for ${nearAccountId}:`, error);
    }
  }
}

// =============================================================================
// EFFECT LAYER
// =============================================================================

export class NearContext extends Context.Tag("NearService")<
  NearContext,
  NearService | null
>() {}

export const NearLive = (
  db: DrizzleDatabase,
  config: NearConfig,
): Layer.Layer<NearContext, never, never> => {
  const service = new NearService(db, config);
  console.log(`[NearService] Initialized with RPC: ${config.rpcUrl}`);
  return Layer.succeed(NearContext, service);
};
