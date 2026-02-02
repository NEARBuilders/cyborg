/**
 * Sync Ascendant NFT Holders from RPC to D1 Database
 *
 * This script fetches all Ascendant NFT holders from the NEAR blockchain
 * via RPC and upserts them to the D1 database.
 *
 * Usage:
 *   bun run scripts/sync-holders.ts           # Preview changes
 *   bun run scripts/sync-holders.ts --apply   # Apply to local DB
 *   bun run scripts/sync-holders.ts --remote  # Apply to remote DB
 */

// Multiple RPC endpoints for fallback (ordered by priority)
const RPC_ENDPOINTS = [
  "https://near.lava.build",     // Try this first (no rate limits in testing)
  "https://rpc.mainnet.near.org", // Official RPC (may be rate limited)
];

const CONTRACT_ID = "ascendant.nearlegion.near";

interface NEARToken {
  token_id?: string;
  owner_id?: string;
  metadata?: any;
}

interface HoldersMap {
  [accountId: string]: number;
}

/**
 * Fetch a batch of NFT tokens from the contract via RPC
 */
async function fetchTokenBatch(fromIndex: number, limit: number, rpcUrl: string): Promise<NEARToken[]> {
  const args = JSON.stringify({ from_index: String(fromIndex), limit });
  const argsBase64 = Buffer.from(args).toString("base64");

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `ascendants-sync-${fromIndex}`,
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: CONTRACT_ID,
        method_name: "nft_tokens",
        args_base64: argsBase64,
      }
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC request failed: ${response.statusText}`);
  }

  const result = await response.json();

  if (result.error) {
    throw new Error(`RPC error: ${result.error.message}`);
  }

  // The result can be in different formats:
  // 1. Array of byte arrays (from RPC response) - most common
  // 2. Base64 encoded string
  // 3. Already parsed array
  const rawResult = result.result?.result || [];

  let parsedTokens: NEARToken[] = [];

  // Handle byte array format from RPC
  if (Array.isArray(rawResult) && rawResult.length > 0 && typeof rawResult[0] === 'number') {
    // RPC returns byte array - convert to buffer then parse JSON
    const buffer = Buffer.from(new Uint8Array(rawResult));
    parsedTokens = JSON.parse(buffer.toString()) as NEARToken[];
  } else if (typeof rawResult === "string" && rawResult.length > 0) {
    // Base64 encoded string
    try {
      const buffer = Buffer.from(rawResult, "base64");
      parsedTokens = JSON.parse(buffer.toString()) as NEARToken[];
    } catch {
      // If base64 decode fails, try parsing directly
      parsedTokens = JSON.parse(rawResult);
    }
  } else if (Array.isArray(rawResult) && rawResult.length > 0) {
    // Already parsed array
    parsedTokens = rawResult as NEARToken[];
  }

  return parsedTokens;
}

/**
 * Fetch all NFT tokens from the contract via RPC
 * Uses pagination with batch requests to avoid rate limits
 * Tries multiple RPC endpoints with fallback
 */
async function fetchAllTokens(): Promise<NEARToken[]> {
  console.log(`[RPC] Fetching from ${CONTRACT_ID}...`);

  const allTokens: NEARToken[] = [];
  let fromIndex = 0;
  const batchSize = 100; // Lower batch size to avoid limits
  let currentRpcUrl = RPC_ENDPOINTS[0];
  let hasMore = true;

  while (hasMore) {
    try {
      const batch = await fetchTokenBatch(fromIndex, batchSize, currentRpcUrl);
      allTokens.push(...batch);
      console.log(`[RPC] Fetched ${batch.length} tokens (from index ${fromIndex})`);

      // Check if we need to fetch more
      if (batch.length < batchSize) {
        hasMore = false;
      } else {
        fromIndex += batchSize;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (error) {
      const errorMsg = (error as Error).message;

      // Try next RPC endpoint on error
      const nextRpcIndex = RPC_ENDPOINTS.indexOf(currentRpcUrl) + 1;
      if (nextRpcIndex < RPC_ENDPOINTS.length) {
        currentRpcUrl = RPC_ENDPOINTS[nextRpcIndex];
        console.log(`[RPC] Switching to endpoint: ${currentRpcUrl}`);
        continue;
      }

      throw new Error(`All RPC endpoints failed: ${errorMsg}`);
    }
  }

  console.log(`[RPC] Total tokens fetched: ${allTokens.length}`);
  return allTokens;
}

/**
 * Aggregate tokens by owner to get holder quantities
 */
function aggregateHolders(tokens: NEARToken[]): HoldersMap {
  console.log("[AGGREGATE] Processing tokens...");

  const holders: HoldersMap = {};

  for (const token of tokens) {
    const ownerId = token?.owner_id;
    if (ownerId) {
      holders[ownerId] = (holders[ownerId] || 0) + 1;
    }
  }

  console.log(`[AGGREGATE] Found ${Object.keys(holders).length} unique holders`);
  return holders;
}

/**
 * Generate SQL upsert statements for holders
 */
function generateUpsertSQL(holders: HoldersMap): string {
  const now = Math.floor(Date.now() / 1000);
  const statements: string[] = [];

  for (const [accountId, quantity] of Object.entries(holders)) {
    // Use INSERT OR REPLACE for SQLite upsert
    statements.push(
      `INSERT OR REPLACE INTO ascendant_holders (account_id, quantity, last_synced_at, synced_at) VALUES ('${accountId}', ${quantity}, ${now}, ${now});`
    );
  }

  return statements.join("\n");
}

/**
 * Execute SQL against D1 via wrangler
 */
async function executeSQL(sql: string, remote: boolean): Promise<void> {
  const dbName = "near-agent-db";
  const remoteFlag = remote ? "--remote" : "--local";

  console.log(`\n[D1] Applying to ${remote ? "remote" : "local"} database...`);

  // Split into batches to avoid command line length limits
  const statements = sql.split(";\n").filter((s) => s.trim());

  for (let i = 0; i < statements.length; i += 50) {
    const batch = statements.slice(i, i + 50).join(";\n") + ";";
    const tempFile = `/tmp/holders_batch_${i}.sql`;

    // Write batch to temp file
    await Bun.write(tempFile, batch);

    // Execute via wrangler
    const command = `wrangler d1 execute ${dbName} ${remoteFlag} --file=${tempFile}`;
    console.log(`[D1] Batch ${Math.floor(i / 50) + 1}/${Math.ceil(statements.length / 50)}...`);

    const proc = Bun.spawn(["sh", "-c", command], {
      stdout: "inherit",
      stderr: "inherit",
    });

    const exitCode = await proc.exited;

    // Clean up temp file
    // Note: unlink in bun doesn't throw if file doesn't exist
    // @ts-ignore
    Bun.file(tempFile).size && (await Bun.$`rm ${tempFile}`.quiet());

    if (exitCode !== 0) {
      throw new Error(`Wrangler command failed with exit code ${exitCode}`);
    }
  }

  console.log(`[D1] Successfully synced ${statements.length} holders`);
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const remote = args.includes("--remote");

  console.log("=".repeat(60));
  console.log("Ascendant NFT Holders Sync");
  console.log("=".repeat(60));

  // Fetch from RPC
  const tokens = await fetchAllTokens();

  // Aggregate by holder
  const holders = aggregateHolders(tokens);

  // Generate SQL
  const sql = generateUpsertSQL(holders);

  console.log("\n[SUMMARY]");
  console.log(`  Total tokens: ${tokens.length}`);
  console.log(`  Unique holders: ${Object.keys(holders).length}`);
  console.log(`  SQL statements: ${sql.split(";\n").length}`);

  if (!apply) {
    console.log("\n[PREVIEW MODE] Run with --apply to execute the changes.");
    console.log("  bun run scripts/sync-holders.ts --apply     # Local database");
    console.log("  bun run scripts/sync-holders.ts --apply --remote  # Remote database");
    return;
  }

  // Execute SQL
  await executeSQL(sql, remote);

  console.log("\n✅ Sync complete!");
}

main().catch((error) => {
  console.error("\n❌ Error:", error);
  process.exit(1);
});
