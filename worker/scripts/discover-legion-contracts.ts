/**
 * Discover and Sync All NEAR Legion NFT Holders
 *
 * This script:
 * 1. Queries known Legion NFT contracts
 * 2. Fetches all holders from each contract
 * 3. Aggregates unique holders across all contracts
 * 4. Syncs to D1 database
 *
 * Known Legion Contracts:
 * - ascendant.nearlegion.near (Ascendant tier)
 * - initiate.nearlegion.near (Initiate tier)
 * - genesis.nearlegion.near (Genesis tier, if exists)
 * - recruit.nearlegion.near (Recruit tier, if exists)
 */

const RPC_ENDPOINTS = [
  "https://near.lava.build",
  "https://rpc.mainnet.near.org",
];

// Known Legion NFT contracts (add more as discovered)
const LEGION_CONTRACTS = [
  "nearlegion.nfts.tg",
  "ascendant.nearlegion.near",
  "initiate.nearlegion.near",
];

interface NEARToken {
  token_id?: string;
  owner_id?: string;
  metadata?: any;
}

interface HoldersMap {
  [accountId: string]: number;
}

/**
 * Fetch a batch of NFT tokens from a contract via RPC
 */
async function fetchTokenBatch(
  contractId: string,
  fromIndex: number,
  limit: number,
  rpcUrl: string
): Promise<{ tokens: NEARToken[]; hasMore: boolean }> {
  const args = JSON.stringify({ from_index: String(fromIndex), limit });
  const argsBase64 = Buffer.from(args).toString("base64");

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `${contractId}-${fromIndex}`,
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: contractId,
        method_name: "nft_tokens",
        args_base64: argsBase64,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC request failed: ${response.statusText}`);
  }

  const result = await response.json();

  if (result.error) {
    // If contract doesn't exist or method not found, return empty
    if (result.error.message.includes("MethodResolveError") ||
        result.error.message.includes("ContractNotFound")) {
      return { tokens: [], hasMore: false };
    }
    throw new Error(`RPC error: ${result.error.message}`);
  }

  const rawResult = result.result?.result || [];
  let parsedTokens: NEARToken[] = [];

  // Handle byte array format from RPC
  if (Array.isArray(rawResult) && rawResult.length > 0 && typeof rawResult[0] === "number") {
    const buffer = Buffer.from(new Uint8Array(rawResult));
    try {
      parsedTokens = JSON.parse(buffer.toString()) as NEARToken[];
    } catch {
      parsedTokens = [];
    }
  } else if (typeof rawResult === "string" && rawResult.length > 0) {
    try {
      const buffer = Buffer.from(rawResult, "base64");
      parsedTokens = JSON.parse(buffer.toString()) as NEARToken[];
    } catch {
      parsedTokens = [];
    }
  } else if (Array.isArray(rawResult) && rawResult.length > 0) {
    parsedTokens = rawResult as NEARToken[];
  }

  // Check if we should continue pagination
  const hasMore = parsedTokens.length === limit;

  return { tokens: parsedTokens, hasMore };
}

/**
 * Fetch all tokens from a specific contract
 */
async function fetchAllTokensForContract(contractId: string): Promise<{
  contractId: string;
  tokens: NEARToken[];
  uniqueHolders: number;
}> {
  console.log(`\n[RPC] Fetching from ${contractId}...`);

  const allTokens: NEARToken[] = [];
  let fromIndex = 0;
  const batchSize = 50; // Reduced batch size to avoid rate limiting
  let hasMore = true;
  let currentRpcUrl = RPC_ENDPOINTS[0];

  while (hasMore) {
    try {
      const { tokens, hasMore: more } = await fetchTokenBatch(
        contractId,
        fromIndex,
        batchSize,
        currentRpcUrl
      );

      if (tokens.length === 0 && fromIndex === 0) {
        console.log(`[RPC] No tokens found for ${contractId} (contract may not exist or has no NFTs)`);
        return { contractId, tokens: [], uniqueHolders: 0 };
      }

      allTokens.push(...tokens);
      console.log(`[RPC] ${contractId}: Fetched ${tokens.length} tokens (from index ${fromIndex}, total: ${allTokens.length})`);

      hasMore = more;

      if (hasMore) {
        fromIndex += batchSize;
      }

      // Longer delay to avoid rate limiting (500ms between batches)
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error: any) {
      const errorMsg = error?.message || String(error);

      // Try next RPC endpoint on error
      const nextRpcIndex = RPC_ENDPOINTS.indexOf(currentRpcUrl) + 1;
      if (nextRpcIndex < RPC_ENDPOINTS.length) {
        currentRpcUrl = RPC_ENDPOINTS[nextRpcIndex];
        console.log(`[RPC] ${contractId}: Switching to endpoint: ${currentRpcUrl}`);
        continue;
      }

      throw new Error(`All RPC endpoints failed for ${contractId}: ${errorMsg}`);
    }
  }

  // Count unique holders
  const holders = new Set<string>();
  for (const token of allTokens) {
    if (token?.owner_id) {
      holders.add(token.owner_id);
    }
  }

  return {
    contractId,
    tokens: allTokens,
    uniqueHolders: holders.size,
  };
}

/**
 * Aggregate tokens by owner and contract
 * Returns Map of accountId -> Map of contractId -> count
 */
function aggregateHoldersByContract(contractResults: Array<{
  contractId: string;
  tokens: NEARToken[];
}>): Map<string, Map<string, number>> {
  console.log("\n[AGGREGATE] Processing tokens by contract...");

  const holdersMap = new Map<string, Map<string, number>>();

  for (const { contractId, tokens } of contractResults) {
    for (const token of tokens) {
      const ownerId = token?.owner_id;
      if (ownerId) {
        if (!holdersMap.has(ownerId)) {
          holdersMap.set(ownerId, new Map());
        }
        const contractMap = holdersMap.get(ownerId)!;
        contractMap.set(contractId, (contractMap.get(contractId) || 0) + 1);
      }
    }
  }

  console.log(`[AGGREGATE] Found ${holdersMap.size} unique holders across all Legion contracts`);
  return holdersMap;
}

/**
 * Generate SQL upsert statements for holders (per contract)
 * Each holder gets one row per contract they hold
 */
function generateUpsertSQL(holdersMap: Map<string, Map<string, number>>): string {
  const now = Math.floor(Date.now() / 1000);
  const statements: string[] = [];

  for (const [accountId, contractMap] of holdersMap.entries()) {
    // Escape single quotes in account IDs
    const escapedId = accountId.replace(/'/g, "''");

    for (const [contractId, quantity] of contractMap.entries()) {
      // Escape single quotes in contract IDs
      const escapedContract = contractId.replace(/'/g, "''");

      statements.push(
        `INSERT OR REPLACE INTO legion_holders (account_id, contract_id, quantity, last_synced_at, synced_at) VALUES ('${escapedId}', '${escapedContract}', ${quantity}, ${now}, ${now});`
      );
    }
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

  // Split by semicolon and filter empty statements
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  console.log(`[D1] Total statements to execute: ${statements.length}`);

  for (let i = 0; i < statements.length; i += 50) {
    const batch = statements.slice(i, i + 50);
    const batchSql = batch.join(";\n") + ";";
    const tempFile = `/tmp/holders_batch_${i}.sql`;

    await Bun.write(tempFile, batchSql);

    const command = `wrangler d1 execute ${dbName} ${remoteFlag} --file=${tempFile}`;
    console.log(`[D1] Batch ${Math.floor(i / 50) + 1}/${Math.ceil(statements.length / 50)} (${batch.length} statements)...`);

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
  console.log("NEAR Legion NFT Holders Discovery & Sync");
  console.log("=".repeat(60));
  console.log(`\nChecking contracts: ${LEGION_CONTRACTS.join(", ")}`);

  const contractResults: Array<{
    contractId: string;
    tokens: NEARToken[];
    uniqueHolders: number;
  }> = [];

  // Fetch tokens from all contracts
  for (const contractId of LEGION_CONTRACTS) {
    try {
      const result = await fetchAllTokensForContract(contractId);
      contractResults.push({
        contractId: result.contractId,
        tokens: result.tokens,
        uniqueHolders: result.uniqueHolders,
      });

      // Longer delay between contracts to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error: any) {
      console.error(`[ERROR] Failed to fetch from ${contractId}:`, error?.message || error);
    }
  }

  // Display summary per contract
  console.log("\n" + "=".repeat(60));
  console.log("CONTRACT SUMMARY");
  console.log("=".repeat(60));
  for (const result of contractResults) {
    console.log(`${result.contractId}:`);
    console.log(`  Tokens: ${result.tokens.length}`);
    console.log(`  Holders: ${result.uniqueHolders}`);
  }

  // Aggregate by holder AND contract
  const holdersByContract = aggregateHoldersByContract(contractResults);

  // Generate SQL
  const sql = generateUpsertSQL(holdersByContract);

  // Count total holder records (could be > unique accounts since one account can hold from multiple contracts)
  const totalRecords = Array.from(holdersByContract.entries()).reduce(
    (sum, [, contractMap]) => sum + contractMap.size,
    0
  );

  console.log("\n" + "=".repeat(60));
  console.log("OVERALL SUMMARY");
  console.log("=".repeat(60));
  console.log(`  Total unique accounts: ${holdersByContract.size}`);
  console.log(`  Total holder records (account+contract): ${totalRecords}`);

  if (!apply) {
    console.log("\n[PREVIEW MODE] Run with --apply to execute the changes.");
    console.log("  bun run scripts/discover-legion-contracts.ts --apply       # Local database");
    console.log("  bun run scripts/discover-legion-contracts.ts --apply --remote  # Remote database");
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
