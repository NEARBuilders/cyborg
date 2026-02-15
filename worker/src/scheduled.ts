/**
 * Scheduled Event Handler for Cloudflare Workers Cron Triggers
 *
 * Runs automated tasks on a schedule:
 * - Sync Legion NFT holders every 12 hours
 *
 * Cron schedule configured in wrangler.toml
 */

import type { Env } from "./types";
import { createDatabase, type Database } from "./db";
import * as schema from "./db/schema";

// =============================================================================
// ROUND-ROBIN RPC ENDPOINTS
// =============================================================================

const RPC_ENDPOINTS = [
  "https://rpc.mainnet.near.org",
  "https://near.lava.build",
  "https://near.blockpi.network/v1/rpc/public",
  "https://near.drpc.org",
  "https://go.getblock.io/624a04f3e6d34380bee5c247fcf06c4e",
  "https://api.blockeden.xyz/near/67nCBdZQSH9z3YqDDjdm",
  "https://endpoints.omniatech.io/v1/near/mainnet/public",
] as const;

let rpcIndex = 0;

function getNextRpcUrl(): string {
  const url = RPC_ENDPOINTS[rpcIndex];
  rpcIndex = (rpcIndex + 1) % RPC_ENDPOINTS.length;
  return url;
}

/**
 * Scheduled event handler - called by Cloudflare Workers Cron
 */
export async function scheduled(
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  console.log(`[SCHEDULED] Cron triggered at ${new Date().toISOString()}`);
  console.log(`[SCHEDULED] Cron: ${event.cron}`);

  try {
    const db = createDatabase(env.DB);

    // Run NFT holder sync
    await syncLegionHolders(db);

    console.log(`[SCHEDULED] Completed at ${new Date().toISOString()}`);
  } catch (error) {
    console.error("[SCHEDULED] Error:", error);
  }
}

/**
 * Sync Legion NFT holders from NEAR blockchain to D1 database
 * Uses existing accounts from D1 and queries nft_tokens_for_owner
 */
export async function syncLegionHolders(db: Database): Promise<{
  success: boolean;
  synced: number;
  error?: string;
  debug?: any;
}> {
  console.log("[SYNC] Starting Legion NFT holder sync...");

  const LEGION_CONTRACTS = [
    { id: "nearlegion.nfts.tg", name: "Legion" },
    { id: "ascendant.nearlegion.near", name: "Ascendant" },
    { id: "initiate.nearlegion.near", name: "Initiate" },
  ];

  const now = Math.floor(Date.now() / 1000);
  let totalSynced = 0;
  const debug: any = {
    contracts: [] as any[],
    errors: [] as string[],
  };

  // Get all unique accounts from D1 database
  console.log("[SYNC] Fetching existing accounts from D1...");
  const accounts = await getUniqueAccounts(db);
  console.log(`[SYNC] Found ${accounts.length} unique accounts to check`);

  for (const contract of LEGION_CONTRACTS) {
    const contractDebug: any = {
      name: contract.name,
      id: contract.id,
      holders: 0,
      error: null as string | null,
    };

    try {
      console.log(`[SYNC] Checking ${contract.name} for ${accounts.length} accounts...`);

      let contractSynced = 0;
      const BATCH_SIZE = 5; // Process 5 accounts in parallel (conservative for rate limits)
      const BATCH_DELAY = 200; // 200ms between batches

      // Process accounts in parallel batches
      for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
        const batch = accounts.slice(i, i + BATCH_SIZE);

        // Process all accounts in this batch in parallel
        const results = await Promise.allSettled(
          batch.map(async (accountId) => {
            try {
              const tokens = await getNftTokensForOwner(contract.id, accountId);

              if (tokens.length > 0) {
                // Update holder count
                await db
                  .insert(schema.legionHolders)
                  .values({
                    accountId,
                    contractId: contract.id,
                    quantity: tokens.length,
                    lastSyncedAt: now,
                    syncedAt: now,
                  })
                  .onConflictDoUpdate({
                    target: [schema.legionHolders.accountId, schema.legionHolders.contractId],
                    set: {
                      quantity: tokens.length,
                      lastSyncedAt: now,
                    },
                  });

                // Store NFT images for avatar/display
                for (const token of tokens) {
                  const mediaUrl = token.metadata?.media || token.metadata?.reference;
                  const title = token.metadata?.title || `#${token.token_id}`;

                  if (mediaUrl) {
                    // Store in legion_nft_images table
                    await db
                      .insert(schema.legionNftImages)
                      .values({
                        tokenId: token.token_id,
                        accountId,
                        contractId: contract.id,
                        imageUrl: mediaUrl,
                        title,
                        lastSyncedAt: now,
                        syncedAt: now,
                      })
                      .onConflictDoUpdate({
                        target: [schema.legionNftImages.tokenId, schema.legionNftImages.contractId],
                        set: {
                          imageUrl: mediaUrl,
                          title,
                          lastSyncedAt: now,
                        },
                      });

                    // Also update near_social_profiles with avatar if this is their first/primary NFT
                    // Use the first Legion NFT as avatar
                    if (contract.id === "nearlegion.nfts.tg") {
                      await db
                        .insert(schema.nearSocialProfiles)
                        .values({
                          accountId,
                          nftAvatarUrl: mediaUrl,
                          nftAvatarTokenId: token.token_id,
                          nftAvatarSyncedAt: now,
                          profileData: "{}",
                          lastSyncedAt: now,
                          syncedAt: now,
                        })
                        .onConflictDoUpdate({
                          target: schema.nearSocialProfiles.accountId,
                          set: {
                            nftAvatarUrl: mediaUrl,
                            nftAvatarTokenId: token.token_id,
                            nftAvatarSyncedAt: now,
                            lastSyncedAt: now,
                          },
                        });
                    }
                  }
                }

                return { accountId, quantity: tokens.length, success: true };
              }

              return { accountId, quantity: 0, success: true };
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              return { accountId, error: errorMsg, success: false };
            }
          })
        );

        // Count successful syncs and log errors
        for (const result of results) {
          if (result.status === "fulfilled") {
            if (result.value.success) {
              if (result.value.quantity > 0) {
                contractSynced++;
              }
            } else {
              debug.errors.push(`${result.value.accountId} @ ${contract.name}: ${result.value.error}`);
            }
          } else {
            debug.errors.push(`Unknown error in batch: ${result.reason}`);
          }
        }

        console.log(`[SYNC] Processed ${Math.min(i + BATCH_SIZE, accounts.length)}/${accounts.length} accounts (${contractSynced} holders found so far)...`);

        // Delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < accounts.length) {
          await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
        }
      }

      console.log(`[SYNC] Synced ${contractSynced} holders for ${contract.name}`);
      contractDebug.holders = contractSynced;
      totalSynced += contractSynced;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[SYNC] Error syncing ${contract.name}:`, errorMsg);
      contractDebug.error = errorMsg;
      debug.errors.push(`${contract.name}: ${errorMsg}`);
    }

    debug.contracts.push(contractDebug);
  }

  console.log(`[SYNC] Complete! Synced ${totalSynced} holder records across all contracts`);

  return {
    success: true,
    synced: totalSynced,
    debug,
  };
}

/**
 * Get all unique NEAR account IDs from D1 database
 */
async function getUniqueAccounts(db: Database): Promise<string[]> {
  const accounts = new Set<string>();

  // Get from legion_holders
  try {
    const holders = await db.select({ accountId: schema.legionHolders.accountId }).from(schema.legionHolders);
    for (const holder of holders) {
      accounts.add(holder.accountId);
    }
  } catch (e) {
    console.warn("[SYNC] Could not fetch legion_holders:", e);
  }

  // Get from legion_follows
  try {
    const follows = await db
      .select({
        follower: schema.legionFollows.followerAccountId,
        following: schema.legionFollows.followingAccountId,
      })
      .from(schema.legionFollows);

    for (const follow of follows) {
      accounts.add(follow.follower);
      accounts.add(follow.following);
    }
  } catch (e) {
    console.warn("[SYNC] Could not fetch legion_follows:", e);
  }

  // Get from near_social_profiles
  try {
    const profiles = await db.select({ accountId: schema.nearSocialProfiles.accountId }).from(schema.nearSocialProfiles);
    for (const profile of profiles) {
      accounts.add(profile.accountId);
    }
  } catch (e) {
    console.warn("[SYNC] Could not fetch near_social_profiles:", e);
  }

  return Array.from(accounts);
}

/**
 * Get NFT tokens for a specific owner from a contract
 * Returns full token data including metadata and image URLs
 */
async function getNftTokensForOwner(contractId: string, accountId: string): Promise<any[]> {
  const args = JSON.stringify({ account_id: accountId, limit: 100 });
  const argsBase64 = btoa(args);

  const rpcUrl = getNextRpcUrl();
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10000), // 10s timeout
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `check-${contractId}-${accountId}`,
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: contractId,
        method_name: "nft_tokens_for_owner",
        args_base64: argsBase64,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC error: ${response.statusText}`);
  }

  const result = await response.json();

  if (result.error) {
    throw new Error(result.error.message || String(result.error));
  }

  // Parse tokens
  const rawResult = result.result?.result || [];
  let tokens: any[] = [];

  if (Array.isArray(rawResult) && rawResult.length > 0 && typeof rawResult[0] === "number") {
    try {
      const uint8Array = new Uint8Array(rawResult);
      const decoder = new TextDecoder();
      const decoded = decoder.decode(uint8Array);
      tokens = JSON.parse(decoded);
    } catch (e) {
      console.error(`[getNftTokensForOwner] Failed to parse byte array for ${accountId}:`, e);
      return [];
    }
  } else if (typeof rawResult === "string" && rawResult.length > 0) {
    try {
      const binaryString = atob(rawResult);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decoder = new TextDecoder();
      tokens = JSON.parse(decoder.decode(bytes));
    } catch (e) {
      console.error(`[getNftTokensForOwner] Failed to parse base64 for ${accountId}:`, e);
      return [];
    }
  }

  return tokens;
}
