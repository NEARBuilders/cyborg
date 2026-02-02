/**
 * Discover and Sync All NEAR Legion NFT Holders
 *
 * This script handles lexicographic token_id ordering correctly
 * by using larger batch sizes and multiple start points.
 *
 * Known Legion Contracts:
 * - ascendant.nearlegion.near (Ascendant tier)
 * - initiate.nearlegion.near (Initiate tier)
 * - nearlegion.nfts.tg (Legion tier)
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

/**
 * Fetch a batch of NFT tokens from a contract via RPC
 */
async function fetchTokenBatch(
  contractId: string,
  fromIndex: string,
  limit: number,
  rpcUrl: string
): Promise<NEARToken[]> {
  const args = JSON.stringify({ from_index: fromIndex, limit });
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

  if (fromIndex === "0" && contractId === "initiate.nearlegion.near") {
    console.log(`[DEBUG] Full response for ${contractId}:`, JSON.stringify(result).substring(0, 500));
  }

  if (result.error) {
    console.log(`[DEBUG] RPC Error for ${contractId} from "${fromIndex}":`, result.error);
    if (result.error.message.includes("MethodResolveError") ||
        result.error.message.includes("ContractNotFound")) {
      return [];
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
    } catch (e) {
      console.log(`[DEBUG] Failed to parse byte array for ${contractId} from "${fromIndex}":`, e);
      console.log(`[DEBUG] Buffer length: ${buffer.length}, first 100 chars: ${buffer.toString().substring(0, 100)}`);
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

  if (fromIndex === "0" && parsedTokens.length === 0) {
    console.log(`[DEBUG] No tokens from ${contractId} with rawResult type: ${Array.isArray(rawResult) ? 'array(len=' + rawResult.length + ')' : typeof rawResult}`);
    if (Array.isArray(rawResult) && rawResult.length > 0) {
      console.log(`[DEBUG] First element type: ${typeof rawResult[0]}, value: ${rawResult[0]}`);
    }
  }

  return parsedTokens;
}

/**
 * Fetch all tokens from a contract using smart pagination
 *
 * Strategy:
 * 1. Use large batch size (500) to get more tokens per request
 * 2. Start from "0", then use the last token_id as next from_index
 * 3. If we get empty results, try the next numeric range
 */
async function fetchAllTokensForContract(contractId: string): Promise<{
  contractId: string;
  tokens: NEARToken[];
  uniqueHolders: number;
}> {
  console.log(`\n[RPC] Fetching from ${contractId}...`);

  const allTokens: NEARToken[] = [];
  const seenTokenIds = new Set<string>();
  let fromIndex = "0";
  const batchSize = 50; // Reduced to avoid gas limit exceeded
  let currentRpcUrl = RPC_ENDPOINTS[0];
  let consecutiveEmptyBatches = 0;
  const maxConsecutiveEmpty = 5;

  while (consecutiveEmptyBatches < maxConsecutiveEmpty) {
    try {
      const tokens = await fetchTokenBatch(contractId, fromIndex, batchSize, currentRpcUrl);

      // Add new tokens (avoiding duplicates)
      let newTokensCount = 0;
      for (const token of tokens) {
        if (token.token_id && !seenTokenIds.has(token.token_id)) {
          seenTokenIds.add(token.token_id);
          allTokens.push(token);
          newTokensCount++;
        }
      }

      console.log(`[RPC] ${contractId}: Fetched ${tokens.length} tokens (${newTokensCount} new) from "${fromIndex}" | Total unique: ${allTokens.length}`);

      // If we got a full batch, there might be more
      if (tokens.length === batchSize) {
        // Use the last token_id as the next from_index for lexicographic continuation
        const lastTokenId = tokens[tokens.length - 1].token_id;
        if (lastTokenId) {
          fromIndex = lastTokenId;
          consecutiveEmptyBatches = 0; // Reset on success
        } else {
          consecutiveEmptyBatches++;
        }
      } else if (tokens.length === 0) {
        // Empty batch - try next numeric range to handle lexicographic gaps
        const numericIndex = parseInt(fromIndex, 10) || 0;
        const nextIndex = numericIndex + batchSize;
        fromIndex = String(nextIndex);
        consecutiveEmptyBatches++;
        console.log(`[RPC] ${contractId}: Empty batch, trying next range from "${fromIndex}" (${consecutiveEmptyBatches}/${maxConsecutiveEmpty})`);
      } else {
        // Partial batch - we've reached the end for this range
        // Try next numeric range to catch any lexicographic gaps
        const maxTokenId = tokens.reduce((max, t) => {
          const id = parseInt(t.token_id || "0", 10);
          return id > max ? id : max;
        }, 0);

        const nextStart = (Math.floor(maxTokenId / batchSize) + 1) * batchSize;
        fromIndex = String(nextStart);

        // Check if we should continue
        if (parseInt(fromIndex, 10) > 20000) { // Safety limit for initiate contract
          console.log(`[RPC] ${contractId}: Reached safety limit, stopping`);
          break;
        }
        consecutiveEmptyBatches++;
      }

      // Delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200));
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

  console.log(`[RPC] ${contractId}: Complete - ${allTokens.length} tokens, ${holders.size} unique holders`);

  return {
    contractId,
    tokens: allTokens,
    uniqueHolders: holders.size,
  };
}

/**
 * Aggregate tokens by owner and contract
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
 * Generate SQL upsert statements for holders
 */
function generateUpsertSQL(holdersMap: Map<string, Map<string, number>>): string {
  const now = Math.floor(Date.now() / 1000);
  const statements: string[] = [];

  for (const [accountId, contractMap] of holdersMap.entries()) {
    const escapedId = accountId.replace(/'/g, "''");

    for (const [contractId, quantity] of contractMap.entries()) {
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

    try {
      await Bun.$`rm ${tempFile}`.quiet();
    } catch {
      // Ignore
    }

    if (exitCode !== 0) {
      throw new Error(`Wrangler command failed with exit code ${exitCode}`);
    }
  }

  console.log(`[D1] Successfully synced ${statements.length} holder records`);
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

      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error: any) {
      console.error(`[ERROR] Failed to fetch from ${contractId}:`, error?.message || error);
    }
  }

  // Display summary
  console.log("\n" + "=".repeat(60));
  console.log("CONTRACT SUMMARY");
  console.log("=".repeat(60));
  for (const result of contractResults) {
    console.log(`${result.contractId}:`);
    console.log(`  Tokens: ${result.tokens.length}`);
    console.log(`  Holders: ${result.uniqueHolders}`);
  }

  const holdersByContract = aggregateHoldersByContract(contractResults);
  const sql = generateUpsertSQL(holdersByContract);

  const totalRecords = Array.from(holdersByContract.entries()).reduce(
    (sum, [, contractMap]) => sum + contractMap.size,
    0
  );

  console.log("\n" + "=".repeat(60));
  console.log("OVERALL SUMMARY");
  console.log("=".repeat(60));
  console.log(`  Total unique accounts: ${holdersByContract.size}`);
  console.log(`  Total holder records: ${totalRecords}`);

  if (!apply) {
    console.log("\n[PREVIEW MODE] Run with --apply to execute.");
    console.log("  bun run scripts/discover-legion-contracts.ts --apply       # Local");
    console.log("  bun run scripts/discover-legion-contracts.ts --apply --remote  # Remote");
    return;
  }

  await executeSQL(sql, remote);
  console.log("\n Sync complete!");
}

main().catch((error) => {
  console.error("\n Error:", error);
  process.exit(1);
});
