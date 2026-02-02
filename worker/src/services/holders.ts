/**
 * NFT Holders Service
 * Queries Legion NFT holders from local D1 database
 *
 * Holders should be synced locally using:
 *   bun run worker/scripts/sync-holders.ts --apply
 */

import { desc, eq, sql } from "drizzle-orm";
import type { Database } from "../db";
import { ascendantHolders, legionHolders, LEGION_CONTRACTS } from "../db/schema";

interface HoldersData {
  holders: Array<{
    account: string;
    quantity: string;
    contractId: string; // NEW: include contract type
  }>;
  lastUpdated: string;
}

interface HoldersInput {
  db: Database;
}

/**
 * Fetch all Legion NFT holders from local D1 database
 * Returns holders with their contract types (Ascendant, Initiate, nearlegion)
 * This is fast and doesn't require RPC calls on the edge
 */
export async function getAscendantHolders(
  input: HoldersInput
): Promise<HoldersData> {
  const { db } = input;

  console.log("[HOLDERS] Querying from local D1 database...");

  try {
    // Query all holders from the new legion_holders table
    const holders = await db
      .select({
        account: legionHolders.accountId,
        contractId: legionHolders.contractId,
        quantity: legionHolders.quantity,
        lastSyncedAt: legionHolders.lastSyncedAt,
      })
      .from(legionHolders)
      .orderBy(legionHolders.accountId)
      .orderBy(legionHolders.contractId);

    if (holders.length === 0) {
      console.warn("[HOLDERS] No holders found in database. Run: bun run worker/scripts/sync-holders.ts --apply");
    }

    // Get the most recent sync timestamp
    const lastSyncResult = await db
      .select({ max: sql<number>`MAX(last_synced_at)` })
      .from(legionHolders);

    const lastSyncedAt = lastSyncResult[0]?.max
      ? new Date(lastSyncResult[0].max * 1000).toISOString()
      : new Date().toISOString();

    const data: HoldersData = {
      holders: holders.map((h) => ({
        account: h.account,
        quantity: String(h.quantity),
        contractId: h.contractId,
      })),
      lastUpdated: lastSyncedAt,
    };

    console.log(`[HOLDERS] Found ${holders.length} holder records (${new Set(holders.map(h => h.account)).size} unique accounts)`);

    return data;
  } catch (error) {
    console.error("[HOLDERS] Error querying database:", error);
    throw error;
  }
}

/**
 * Get holders count from database
 */
export async function getHoldersCount(
  input: HoldersInput
): Promise<number> {
  const { db } = input;

  try {
    const result = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(ascendantHolders);

    return result[0]?.count || 0;
  } catch (error) {
    console.error("[HOLDERS] Error counting holders:", error);
    throw error;
  }
}

/**
 * Get paginated holders from database
 */
export async function getHoldersPaginated(
  input: HoldersInput & { limit?: number; offset?: number }
): Promise<{ holders: Array<{ account: string; quantity: string }>; total: number }> {
  const { db, limit = 100, offset = 0 } = input;

  try {
    // Get total count
    const countResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(ascendantHolders);
    const total = countResult[0]?.count || 0;

    // Get paginated holders
    const holders = await db
      .select({
        account: ascendantHolders.accountId,
        quantity: ascendantHolders.quantity,
      })
      .from(ascendantHolders)
      .orderBy(ascendantHolders.accountId)
      .limit(limit)
      .offset(offset);

    return {
      holders: holders.map((h) => ({
        account: h.account,
        quantity: String(h.quantity),
      })),
      total,
    };
  } catch (error) {
    console.error("[HOLDERS] Error querying paginated holders:", error);
    throw error;
  }
}

/**
 * Check if a specific account is an Ascendant holder (from local DB)
 * Fast, non-blocking check that never throws
 */
export async function isAscendantHolder(
  input: HoldersInput & { accountId: string }
): Promise<boolean> {
  const { db, accountId } = input;

  try {
    const result = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(ascendantHolders)
      .where(eq(ascendantHolders.accountId, accountId));

    return (result[0]?.count || 0) > 0;
  } catch (error) {
    console.error("[HOLDERS] Error checking holder status:", error);
    return false; // Never throw, always return false on error
  }
}

// =============================================================================
// LEGION CONTRACTS FOR REAL-TIME VERIFICATION
// =============================================================================

const LEGION_CONTRACTS = [
  "nearlegion.nfts.tg",
  "ascendant.nearlegion.near",
  "initiate.nearlegion.near",
];

const RPC_URL = "https://rpc.mainnet.near.org";

interface VerificationResult {
  isHolder: boolean;
  contracts: Array<{ contract: string; count: number }>;
  totalTokens: number;
}

/**
 * Verify if an account holds any Legion NFTs via RPC
 * This is slower than the DB check but always accurate
 * Use this for new users or to refresh holder status
 *
 * IMPORTANT: This function has built-in timeout and error handling
 * to prevent login issues. Returns {isHolder: false} on any error.
 */
export async function verifyLegionHolderRPC(accountId: string): Promise<VerificationResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout

  try {
    console.log(`[HOLDERS] Verifying ${accountId} via RPC...`);

    const results = Array<{ contract: string; count: number }>();
    let totalTokens = 0;

    // Check each Legion contract
    for (const contractId of LEGION_CONTRACTS) {
      try {
        const args = JSON.stringify({
          account_id: accountId,
          limit: 50,
        });
        const argsBase64 = Buffer.from(args).toString("base64");

        const response = await fetch(RPC_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: `verify-${contractId}-${accountId}`,
            method: "query",
            params: {
              request_type: "call_function",
              finality: "optimistic", // Use optimistic for faster reads
              account_id: contractId,
              method_name: "nft_tokens_for_owner",
              args_base64: argsBase64,
            },
          }),
        });

        if (!response.ok) {
          console.warn(`[HOLDERS] RPC failed for ${contractId}: ${response.statusText}`);
          continue;
        }

        const result = await response.json();

        if (result.error) {
          // Method not found or other error - try next contract
          continue;
        }

        // Parse tokens
        const rawResult = result.result?.result || [];
        let tokens: any[] = [];

        if (Array.isArray(rawResult) && rawResult.length > 0 && typeof rawResult[0] === "number") {
          const buffer = Buffer.from(new Uint8Array(rawResult));
          try {
            tokens = JSON.parse(buffer.toString());
          } catch {
            tokens = [];
          }
        } else if (typeof rawResult === "string" && rawResult.length > 0) {
          try {
            const buffer = Buffer.from(rawResult, "base64");
            tokens = JSON.parse(buffer.toString());
          } catch {
            tokens = [];
          }
        }

        if (tokens.length > 0) {
          results.push({ contract: contractId, count: tokens.length });
          totalTokens += tokens.length;
        }
      } catch (contractError) {
        // Continue to next contract if one fails
        console.warn(`[HOLDERS] Error checking ${contractId}:`, contractError);
        continue;
      }
    }

    clearTimeout(timeout);

    const isHolder = totalTokens > 0;

    console.log(`[HOLDERS] Verification for ${accountId}: ${isHolder ? "HOLDER" : "NOT HOLDER"} (${totalTokens} tokens)`);

    return {
      isHolder,
      contracts: results,
      totalTokens,
    };
  } catch (error) {
    clearTimeout(timeout);

    if (error instanceof Error && error.name === "AbortError") {
      console.warn(`[HOLDERS] Verification timeout for ${accountId}`);
    } else {
      console.error("[HOLDERS] Verification error:", error);
    }

    // Always return a safe default on error
    return {
      isHolder: false,
      contracts: [],
      totalTokens: 0,
    };
  }
}

/**
 * Get holder types from local database (FAST, no RPC)
 * Returns which NFT contracts/tiers the user holds
 *
 * This is the recommended function for login - it's instant
 */
export async function getHolderTypes(db: Database, accountId: string): Promise<{
  contracts: Array<{ contractId: string; quantity: number }>;
  totalTokens: number;
  isAscendant: boolean;
  isInitiate: boolean;
  isNearlegion: boolean;
}> {
  try {
    const holders = await db
      .select()
      .from(legionHolders)
      .where(eq(legionHolders.accountId, accountId));

    const contracts = holders.map((h) => ({
      contractId: h.contractId,
      quantity: h.quantity,
    }));

    const totalTokens = holders.reduce((sum, h) => sum + h.quantity, 0);

    return {
      contracts,
      totalTokens,
      isAscendant: holders.some((h) => h.contractId === LEGION_CONTRACTS.ASCENDANT),
      isInitiate: holders.some((h) => h.contractId === LEGION_CONTRACTS.INITIATE),
      isNearlegion: holders.some((h) => h.contractId === LEGION_CONTRACTS.NEARLEGION),
    };
  } catch (error) {
    console.error("[HOLDERS] Error getting holder types:", error);
    return {
      contracts: [],
      totalTokens: 0,
      isAscendant: false,
      isInitiate: false,
      isNearlegion: false,
    };
  }
}

/**
 * Check holder status and update DB with latest NFT types
 *
 * OPTIONS:
 * - skipVerification: Use DB only (instant), don't call RPC
 * - background: Return immediately, update DB in background (non-blocking)
 *
 * Usage during login (NON-BLOCKING):
 *   // Fire and forget - updates in background
 *   checkAndAddHolder({ db, accountId, background: true });
 *
 *   // Or use cached data only (instant)
 *   const types = await getHolderTypes(db, accountId);
 */
export async function checkAndAddHolder(input: HoldersInput & {
  accountId: string;
  skipVerification?: boolean; // Skip RPC check if true (DB only, instant)
  background?: boolean; // Return immediately, update in background
}): Promise<{ isHolder: boolean; isNewHolder: boolean; types?: Awaited<ReturnType<typeof getHolderTypes>> }> {
  const { db, accountId, skipVerification = false, background = false } = input;

  // Helper to update holder data
  const updateHolderData = async (): Promise<{
    isHolder: boolean;
    isNewHolder: boolean;
    types: Awaited<ReturnType<typeof getHolderTypes>>;
  }> => {
    try {
      // Get current holders from DB to check if new
      const existingHolders = await db
        .select()
        .from(legionHolders)
        .where(eq(legionHolders.accountId, accountId));

      const isNewHolder = existingHolders.length === 0;

      // If skipVerification and they have data, return it
      if (skipVerification && existingHolders.length > 0) {
        const types = await getHolderTypes(db, accountId);
        return { isHolder: true, isNewHolder: false, types };
      }

      // Verify via RPC to get fresh data
      console.log(`[HOLDERS] Refreshing holder data for ${accountId}...`);
      const verification = await verifyLegionHolderRPC(accountId);

      const now = Math.floor(Date.now() / 1000);
      const contractsToUpdate = verification.contracts;

      if (verification.isHolder) {
        // Update or insert each contract
        for (const contract of contractsToUpdate) {
          await db
            .insert(legionHolders)
            .values({
              accountId,
              contractId: contract.contract,
              quantity: contract.count,
              lastSyncedAt: now,
              syncedAt: now,
            })
            .onConflictDoUpdate({
              target: [legionHolders.accountId, legionHolders.contractId],
              set: {
                quantity: contract.count,
                lastSyncedAt: now,
              },
            });
        }

        // Remove contracts that user no longer holds
        const currentContractIds = contractsToUpdate.map((c) => c.contract);
        for (const existing of existingHolders) {
          if (!currentContractIds.includes(existing.contractId)) {
            await db
              .delete(legionHolders)
              .where(
                eq(legionHolders.accountId, accountId)
              )
              .where(
                eq(legionHolders.contractId, existing.contractId)
              );
          }
        }

        console.log(`[HOLDERS] Updated holder: ${accountId} (${contractsToUpdate.length} contract types)`);

        const types = await getHolderTypes(db, accountId);
        return { isHolder: true, isNewHolder, types };
      } else {
        // Not a holder anymore - remove all records
        await db
          .delete(legionHolders)
          .where(eq(legionHolders.accountId, accountId));

        console.log(`[HOLDERS] Removed former holder: ${accountId}`);

        return {
          isHolder: false,
          isNewHolder: false,
          types: {
            contracts: [],
            totalTokens: 0,
            isAscendant: false,
            isInitiate: false,
            isNearlegion: false,
          },
        };
      }
    } catch (error) {
      console.error("[HOLDERS] Error in checkAndAddHolder:", error);
      // Return safe default on error
      return {
        isHolder: false,
        isNewHolder: false,
        types: {
          contracts: [],
          totalTokens: 0,
          isAscendant: false,
          isInitiate: false,
          isNearlegion: false,
        },
      };
    }
  };

  // Background mode - return immediately, update in background
  if (background) {
    // Return current DB data immediately (or empty if not found)
    const currentTypes = await getHolderTypes(db, accountId).catch(() => ({
      contracts: [],
      totalTokens: 0,
      isAscendant: false,
      isInitiate: false,
      isNearlegion: false,
    }));

    // Fire and forget the update
    updateHolderData().then(({ isHolder, isNewHolder }) => {
      if (isHolder && isNewHolder) {
        console.log(`[HOLDERS] Background: Discovered new holder ${accountId}`);
      }
    }).catch((err) => {
      console.error("[HOLDERS] Background update failed:", err);
    });

    return {
      isHolder: currentTypes.totalTokens > 0,
      isNewHolder: false,
      types: currentTypes,
    };
  }

  // Foreground mode - wait for update
  return updateHolderData();
}
