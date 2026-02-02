/**
 * Sync NEAR Legion Holders from NearBlocks API
 *
 * NearBlocks has indexed all NFT data, so we can get the complete list
 * of holders without relying on the limited nft_tokens view method.
 */

const CONTRACT_ID = "nearlegion.nfts.tg";
const NEARBLOCKS_API = "https://api.nearblocks.io/v1";

interface NearBlocksToken {
  token_id: string;
  owner: string;
  metadata?: any;
}

interface HoldersMap {
  [accountId: string]: number;
}

/**
 * Fetch all NFT tokens from NearBlocks API
 */
async function fetchAllTokensFromNearBlocks(): Promise<NearBlocksToken[]> {
  console.log(`[NEARBLOCKS] Fetching all tokens for ${CONTRACT_ID}...`);

  const allTokens: NearBlocksToken[] = [];
  let page = 1;
  const perPage = 100;
  let hasMore = true;

  while (hasMore) {
    try {
      const response = await fetch(
        `${NEARBLOCKS_API}/nft/tokens/${CONTRACT_ID}?page=${page}&per_page=${perPage}&order=asc`
      );

      if (!response.ok) {
        throw new Error(`NearBlocks request failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(`NearBlocks API error: ${data.error}`);
      }

      const tokens: NearBlocksToken[] = data.tokens || [];

      if (tokens.length === 0) {
        hasMore = false;
        console.log(`[NEARBLOCKS] Page ${page}: No more tokens`);
        break;
      }

      allTokens.push(...tokens);
      console.log(`[NEARBLOCKS] Page ${page}: Fetched ${tokens.length} tokens (total: ${allTokens.length})`);

      // Check if we should continue pagination
      if (tokens.length < perPage) {
        hasMore = false;
      } else {
        page++;
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      console.error(`[NEARBLOCKS] Error on page ${page}:`, errorMsg);

      // If it's a rate limit error, wait and retry
      if (errorMsg.includes("429") || errorMsg.includes("rate limit")) {
        console.log("[NEARBLOCKS] Rate limited, waiting 5 seconds...");
        await new Promise((resolve) => setTimeout(resolve, 5000));
        continue;
      }

      throw error;
    }
  }

  console.log(`[NEARBLOCKS] Total tokens fetched: ${allTokens.length}`);
  return allTokens;
}

/**
 * Aggregate tokens by owner
 */
function aggregateHolders(tokens: NearBlocksToken[]): HoldersMap {
  console.log("[AGGREGATE] Processing tokens...");

  const holders: HoldersMap = {};

  for (const token of tokens) {
    const ownerId = token?.owner;
    if (ownerId) {
      holders[ownerId] = (holders[ownerId] || 0) + 1;
    }
  }

  console.log(`[AGGREGATE] Found ${Object.keys(holders).length} unique holders`);
  return holders;
}

/**
 * Generate SQL upsert statements
 */
function generateUpsertSQL(holders: HoldersMap): string {
  const now = Math.floor(Date.now() / 1000);
  const statements: string[] = [];

  for (const [accountId, quantity] of Object.entries(holders)) {
    // Escape single quotes in account IDs
    const escapedId = accountId.replace(/'/g, "''");
    statements.push(
      `INSERT OR REPLACE INTO ascendant_holders (account_id, quantity, last_synced_at, synced_at) VALUES ('${escapedId}', ${quantity}, ${now}, ${now});`
    );
  }

  return statements.join("\n");
}

/**
 * Execute SQL via wrangler
 */
async function executeSQL(sql: string, remote: boolean): Promise<void> {
  const dbName = "near-agent-db";
  const remoteFlag = remote ? "--remote" : "--local";

  console.log(`\n[D1] Applying to ${remote ? "remote" : "local"} database...`);

  const statements = sql.split(";\n").filter((s) => s.trim());

  for (let i = 0; i < statements.length; i += 50) {
    const batch = statements.slice(i, i + 50).join(";\n") + ";";
    const tempFile = `/tmp/holders_batch_${i}.sql`;

    await Bun.write(tempFile, batch);

    const command = `wrangler d1 execute ${dbName} ${remoteFlag} --file=${tempFile}`;
    console.log(`[D1] Batch ${Math.floor(i / 50) + 1}/${Math.ceil(statements.length / 50)}...`);

    const proc = Bun.spawn(["sh", "-c", command], {
      stdout: "inherit",
      stderr: "inherit",
    });

    const exitCode = await proc.exited;

    // Clean up temp file
    try {
      await Bun.$`rm ${tempFile}`.quiet();
    } catch {
      // Ignore
    }

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
  console.log("NEAR Legion Holders Sync (NearBlocks API)");
  console.log("=".repeat(60));

  // Fetch from NearBlocks
  const tokens = await fetchAllTokensFromNearBlocks();

  // Aggregate by holder
  const holders = aggregateHolders(tokens);

  // Generate SQL
  const sql = generateUpsertSQL(holders);

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`  Total tokens: ${tokens.length}`);
  console.log(`  Unique holders: ${Object.keys(holders).length}`);
  console.log(`  SQL statements: ${sql.split(";\n").length}`);

  if (!apply) {
    console.log("\n[PREVIEW MODE] Run with --apply to execute the changes.");
    console.log("  bun run scripts/sync-holders-nearblocks.ts --apply       # Local database");
    console.log("  bun run scripts/sync-holders-nearblocks.ts --apply --remote  # Remote database");
    return;
  }

  // Execute SQL
  await executeSQL(sql, remote);

  console.log("\n Sync complete!");
}

main().catch((error) => {
  console.error("\n Error:", error);
  process.exit(1);
});
