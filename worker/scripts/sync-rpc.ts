/**
 * Sync Legion Holders via RPC with Range-Based Pagination
 *
 * Strategy: Iterate through numeric ranges to handle lexicographic token_id ordering
 * Smaller batch sizes to avoid gas limits
 */

const LEGION_CONTRACTS = [
  "nearlegion.nfts.tg",
  "ascendant.nearlegion.near",
  "initiate.nearlegion.near",
];

const RPC_URL = "https://rpc.mainnet.near.org";
const BATCH_SIZE = 10; // Small batches to avoid gas limits
const REQUEST_DELAY = 500; // ms between requests to avoid rate limits

interface NEARToken {
  token_id?: string;
  owner_id?: string;
}

/**
 * Fetch tokens from a specific range
 */
async function fetchTokensInRange(
  contractId: string,
  fromIndex: number,
  limit: number
): Promise<NEARToken[]> {
  const args = JSON.stringify({ from_index: String(fromIndex), limit });
  const argsBase64 = Buffer.from(args).toString("base64");

  const response = await fetch(RPC_URL, {
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
    throw new Error(`RPC failed: ${response.statusText}`);
  }

  const result = await response.json();

  if (result.error) {
    // Return empty on expected errors
    if (result.error.message.includes("GasLimitExceeded")) {
      console.log(`[WARN] Gas limit exceeded, reducing batch size`);
      return [];
    }
    return [];
  }

  const rawResult = result.result?.result || [];

  // Parse byte array
  if (Array.isArray(rawResult) && rawResult.length > 0 && typeof rawResult[0] === "number") {
    const buffer = Buffer.from(new Uint8Array(rawResult));
    try {
      return JSON.parse(buffer.toString()) as NEARToken[];
    } catch {
      return [];
    }
  }

  return [];
}

/**
 * Fetch all holders for a contract by iterating through ranges
 */
async function fetchContractHolders(contractId: string, maxTokenId: number): Promise<Map<string, number>> {
  console.log(`\n[RPC] Fetching ${contractId} (max token: ${maxTokenId})...`);

  const holders = new Map<string, number>();
  const seenTokens = new Set<string>();

  let currentIndex = 0;
  let consecutiveEmpty = 0;
  const MAX_EMPTY = 10;

  while (currentIndex <= maxTokenId && consecutiveEmpty < MAX_EMPTY) {
    try {
      const tokens = await fetchTokensInRange(contractId, currentIndex, BATCH_SIZE);

      // Add new holders
      let newCount = 0;
      for (const token of tokens) {
        if (token.token_id && token.owner_id && !seenTokens.has(token.token_id)) {
          seenTokens.add(token.token_id);
          holders.set(token.owner_id, (holders.get(token.owner_id) || 0) + 1);
          newCount++;
        }
      }

      if (newCount > 0) {
        console.log(`[RPC] ${contractId}: From ${currentIndex} - ${tokens.length} tokens (${newCount} new, ${holders.size} holders total)`);
        consecutiveEmpty = 0;
      } else {
        consecutiveEmpty++;
        if (consecutiveEmpty >= MAX_EMPTY) {
          console.log(`[RPC] ${contractId}: ${MAX_EMPTY} consecutive empty batches, stopping`);
          break;
        }
      }

      // Move to next range
      currentIndex += BATCH_SIZE;

      // Delay to avoid rate limits
      await new Promise(r => setTimeout(r, REQUEST_DELAY));
    } catch (error: any) {
      const errorMsg = error?.message || String(error);

      // Handle rate limiting with backoff
      if (errorMsg.includes("Too Many Requests") || errorMsg.includes("429")) {
        const backoffTime = 5000; // 5 second backoff
        console.log(`[RPC] ${contractId}: Rate limited, waiting ${backoffTime}ms...`);
        await new Promise(r => setTimeout(r, backoffTime));
        continue; // Retry same index
      }

      console.error(`[ERROR] ${contractId} at ${currentIndex}:`, errorMsg);
      consecutiveEmpty++;
    }
  }

  console.log(`[RPC] ${contractId}: Complete - ${holders.size} holders, ${seenTokens.size} tokens`);
  return holders;
}

/**
 * Generate SQL
 */
function generateSQL(allHolders: Map<string, Map<string, number>>): string {
  const now = Math.floor(Date.now() / 1000);
  const statements: string[] = [];

  for (const [accountId, contractMap] of allHolders.entries()) {
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
 * Execute SQL via wrangler
 */
async function executeSQL(sql: string, remote: boolean): Promise<void> {
  const dbName = "near-agent-db";
  const remoteFlag = remote ? "--remote" : "--local";

  console.log(`\n[D1] Applying to ${remote ? "remote" : "local"} database...`);

  const statements = sql
    .split(";")
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith("--"));

  console.log(`[D1] Total statements: ${statements.length}`);

  for (let i = 0; i < statements.length; i += 50) {
    const batch = statements.slice(i, i + 50);
    const batchSql = batch.join(";\n") + ";";
    const tempFile = `/tmp/holders_batch_${i}.sql`;

    await Bun.write(tempFile, batchSql);

    const command = `wrangler d1 execute ${dbName} ${remoteFlag} --file=${tempFile}`;
    console.log(`[D1] Batch ${Math.floor(i / 50) + 1}/${Math.ceil(statements.length / 50)}...`);

    const proc = Bun.spawn(["sh", "-c", command], {
      stdout: "inherit",
      stderr: "inherit",
    });

    const exitCode = await proc.exited;

    try {
      await Bun.$`rm ${tempFile}`.quiet();
    } catch {}

    if (exitCode !== 0) {
      throw new Error(`Wrangler failed with exit code ${exitCode}`);
    }
  }

  console.log(`[D1] Successfully synced ${statements.length} records`);
}

/**
 * Main
 */
async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const remote = args.includes("--remote");

  console.log("=".repeat(60));
  console.log("Legion Holders Sync (RPC with Range Pagination)");
  console.log("=".repeat(60));

  // Known max token IDs for each contract
  const CONTRACT_LIMITS: Record<string, number> = {
    "nearlegion.nfts.tg": 500,
    "ascendant.nearlegion.near": 500,
    "initiate.nearlegion.near": 20000, // Initiate has 17k+ tokens
  };

  const allHolders = new Map<string, Map<string, number>>();

  for (const contractId of LEGION_CONTRACTS) {
    try {
      const maxTokenId = CONTRACT_LIMITS[contractId] || 500;
      const holders = await fetchContractHolders(contractId, maxTokenId);

      // Merge into main map
      for (const [accountId, quantity] of holders.entries()) {
        if (!allHolders.has(accountId)) {
          allHolders.set(accountId, new Map());
        }
        allHolders.get(accountId)!.set(contractId, quantity);
      }

      await new Promise(r => setTimeout(r, 500));
    } catch (error: any) {
      console.error(`[ERROR] Failed to sync ${contractId}:`, error.message);
    }
  }

  // Generate summary
  const totalRecords = Array.from(allHolders.entries()).reduce(
    (sum, [, contractMap]) => sum + contractMap.size,
    0
  );

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`  Total unique accounts: ${allHolders.size}`);
  console.log(`  Total holder records: ${totalRecords}`);

  // Count per contract
  for (const contractId of LEGION_CONTRACTS) {
    let count = 0;
    for (const [, contractMap] of allHolders.entries()) {
      if (contractMap.has(contractId)) count++;
    }
    console.log(`  ${contractId}: ${count} holders`);
  }

  if (!apply) {
    console.log("\n[PREVIEW MODE] Run with --apply to sync.");
    console.log("  bun run scripts/sync-rpc.ts --apply       # Local");
    console.log("  bun run scripts/sync-rpc.ts --apply --remote  # Remote");
    return;
  }

  const sql = generateSQL(allHolders);
  await executeSQL(sql, remote);

  console.log("\n Sync complete!");
}

main().catch(error => {
  console.error("\n Fatal error:", error);
  process.exit(1);
});
