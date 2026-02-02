/**
 * Fast Legion Holders Sync with Parallel Fetching
 *
 * 1. Tests rate limits first
 * 2. Fetches multiple batches in parallel
 * 3. Much faster than sequential fetching
 */

const LEGION_CONTRACTS = [
  "nearlegion.nfts.tg",
  "ascendant.nearlegion.near",
  "initiate.nearlegion.near",
];

const RPC_URL = "https://rpc.mainnet.near.org";
const STATE_FILE = "/tmp/legion-sync-state-fast.json";

interface SyncState {
  [contractId: string]: {
    completed: boolean;
    holders: Record<string, number>;
    maxTokenId: number;
  };
}

interface NEARToken {
  token_id?: string;
  owner_id?: string;
}

// Test different concurrency levels to find optimal rate
async function testRateLimit(): Promise<{ maxConcurrent: number; delay: number }> {
  console.log("\n" + "=".repeat(60));
  console.log("RATE LIMIT TEST");
  console.log("=".repeat(60));

  const testContract = "initiate.nearlegion.near";

  // Test concurrency levels (more conservative)
  for (const concurrent of [3, 5, 8, 10]) {
    console.log(`\n[TEST] Testing ${concurrent} concurrent requests...`);

    const startTime = Date.now();
    let successCount = 0;
    let rateLimited = false;

    const promises = Array.from({ length: concurrent }, (_, i) =>
      fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `test-${i}`,
          method: "query",
          params: {
            request_type: "call_function",
            finality: "final",
            account_id: testContract,
            method_name: "nft_tokens",
            args_base64: Buffer.from(JSON.stringify({ from_index: "0", limit: 5 })).toString("base64"),
          },
        }),
      }).then(async (res) => {
        if (res.status === 429 || res.headers.get("x-ratelimit-remaining") === "0") {
          rateLimited = true;
        }
        if (res.ok) successCount++;
        return res.ok;
      }).catch(() => false)
    );

    await Promise.all(promises);
    const elapsed = Date.now() - startTime;

    console.log(`[TEST] ${successCount}/${concurrent} succeeded in ${elapsed}ms`);

    // Require 100% success for safety
    if (rateLimited || successCount < concurrent) {
      const safeConcurrent = Math.max(2, concurrent - 1);
      const recommendedDelay = 500; // More conservative delay
      console.log(`[TEST] Rate limited! Recommended: ${safeConcurrent} concurrent, ${recommendedDelay}ms delay`);
      return { maxConcurrent: safeConcurrent, delay: recommendedDelay };
    }
  }

  // Default conservative settings
  console.log(`\n[TEST] All tests passed. Using conservative defaults.`);
  return { maxConcurrent: 5, delay: 400 };
}

/**
 * Fetch tokens from RPC
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
      id: `${contractId}-${fromIndex}-${Date.now()}`,
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
    if (response.status === 429) {
      throw new Error("RATE_LIMITED");
    }
    throw new Error(`RPC failed: ${response.statusText}`);
  }

  const result = await response.json();
  if (result.error) {
    if (result.error.message.includes("GasLimitExceeded")) {
      throw new Error("GAS_LIMIT");
    }
    return [];
  }

  const rawResult = result.result?.result || [];

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
 * Get total supply
 */
async function getTotalSupply(contractId: string): Promise<number> {
  const args = JSON.stringify({});
  const argsBase64 = Buffer.from(args).toString("base64");

  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `${contractId}-supply`,
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: contractId,
        method_name: "nft_total_supply",
        args_base64: argsBase64,
      },
    }),
  });

  if (!response.ok) return 500;

  const result = await response.json();
  if (result.error) return 500;

  const rawResult = result.result?.result || [];
  let supplyStr = "";

  if (Array.isArray(rawResult) && rawResult.length > 0 && typeof rawResult[0] === "number") {
    const buffer = Buffer.from(new Uint8Array(rawResult));
    supplyStr = buffer.toString();
  } else if (typeof rawResult === "string") {
    const buffer = Buffer.from(rawResult, "base64");
    supplyStr = buffer.toString();
  }

  supplyStr = supplyStr.replace(/["']/g, "");
  return parseInt(supplyStr, 10) || 500;
}

/**
 * Find max token ID
 */
async function findMaxTokenId(contractId: string, estimatedMax: number): Promise<number> {
  const tokensAtMax = await fetchTokensInRange(contractId, estimatedMax, 1);
  if (tokensAtMax.length > 0) {
    let maxFound = estimatedMax;
    while (true) {
      const testMax = maxFound * 2;
      const testTokens = await fetchTokensInRange(contractId, testMax, 1);
      if (testTokens.length > 0) {
        maxFound = testMax;
      } else {
        break;
      }
      await new Promise(r => setTimeout(r, 100));
    }
    return maxFound + 100;
  }

  let maxFound = 0;
  for (const testId of [estimatedMax, estimatedMax / 2, estimatedMax / 4, estimatedMax / 8]) {
    const tokens = await fetchTokensInRange(contractId, Math.floor(testId), 1);
    if (tokens.length > 0) maxFound = Math.floor(testId);
  }

  return maxFound + 500;
}

/**
 * Write holders to DB
 */
async function writeHoldersToDB(
  contractId: string,
  holders: Map<string, number>,
  remote: boolean
): Promise<void> {
  if (holders.size === 0) return;

  const dbName = "near-agent-db";
  const remoteFlag = remote ? "--remote" : "--local";
  const now = Math.floor(Date.now() / 1000);

  const statements: string[] = [];
  for (const [accountId, quantity] of holders.entries()) {
    const escapedId = accountId.replace(/'/g, "''");
    const escapedContract = contractId.replace(/'/g, "''");
    statements.push(
      `INSERT OR REPLACE INTO legion_holders (account_id, contract_id, quantity, last_synced_at, synced_at) VALUES ('${escapedId}', '${escapedContract}', ${quantity}, ${now}, ${now});`
    );
  }

  const sql = statements.join("\n");
  const tempFile = `/tmp/holders_${contractId}_${Date.now()}.sql`;
  await Bun.write(tempFile, sql);

  const proc = Bun.spawn(["sh", "-c", `wrangler d1 execute ${dbName} ${remoteFlag} --file=${tempFile}`], {
    stdout: "pipe",
    stderr: "inherit",
  });

  const exitCode = await proc.exited;
  try {
    await Bun.$`rm ${tempFile}`.quiet();
  } catch {}

  if (exitCode !== 0) {
    throw new Error(`DB write failed with exit code ${exitCode}`);
  }
}

/**
 * Sync contract with parallel fetching
 */
async function syncContract(
  contractId: string,
  maxTokenId: number,
  remote: boolean,
  maxConcurrent: number,
  delay: number
): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Syncing: ${contractId}`);
  console.log(`Max token: ${maxTokenId} | Parallel: ${maxConcurrent} | Delay: ${delay}ms`);
  console.log(`${"=".repeat(60)}`);

  const state = loadState();
  const contractState = state[contractId] || {
    completed: false,
    holders: {},
    maxTokenId: maxTokenId,
  };

  if (contractState.completed) {
    console.log(`[SKIP] ${contractId} already completed`);
    return;
  }

  const holders = new Map<string, number>(Object.entries(contractState.holders));
  const seenTokens = new Set<string>();

  // Calculate starting point
  const batchSize = 10;
  const totalBatches = Math.ceil(maxTokenId / batchSize);

  // Track which batches to process
  const batchesToProcess: number[] = [];
  for (let i = 0; i < totalBatches; i++) {
    const startIdx = i * batchSize;
    // Skip if we've processed this batch (simple heuristic: skip batches below max holder count)
    if (startIdx < holders.size * 2) continue; // Already covered
    batchesToProcess.push(startIdx);
  }

  console.log(`[INFO] Processing ${batchesToProcess.length} batches (${totalBatches} total)`);

  let consecutiveEmpty = 0;
  const MAX_EMPTY = 20;
  let newHoldersTotal = new Map<string, number>();

  // Process in parallel chunks
  for (let i = 0; i < batchesToProcess.length; i += maxConcurrent) {
    const chunk = batchesToProcess.slice(i, Math.min(i + maxConcurrent, batchesToProcess.length));
    const percentComplete = ((i + chunk.length) / batchesToProcess.length * 100).toFixed(1);

    console.log(`\n[${i + chunk.length}/${batchesToProcess.length}] ${percentComplete}% - Fetching ${chunk.length} batches in parallel...`);

    try {
      const results = await Promise.all(
        chunk.map(async (startIdx) => {
          try {
            const tokens = await fetchTokensInRange(contractId, startIdx, batchSize);
            return { startIdx, tokens, error: null };
          } catch (error: any) {
            return { startIdx, tokens: [], error: error?.message || String(error) };
          }
        })
      );

      // Process results
      let newCount = 0;
      for (const { startIdx, tokens, error } of results) {
        if (error) {
          if (error === "RATE_LIMITED") {
            console.log(`[RATE LIMIT] Hit! Backing off...`);
            await new Promise(r => setTimeout(r, 5000));
          }
          continue;
        }

        if (tokens.length === 0) {
          consecutiveEmpty++;
        } else {
          consecutiveEmpty = 0;
        }

        for (const token of tokens) {
          if (token.token_id && token.owner_id && !seenTokens.has(token.token_id)) {
            seenTokens.add(token.token_id);
            const isNew = !holders.has(token.owner_id);
            holders.set(token.owner_id, (holders.get(token.owner_id) || 0) + 1);

            if (isNew) {
              newHoldersTotal.set(token.owner_id, holders.get(token.owner_id)!);
              newCount++;
            }
          }
        }
      }

      console.log(`  → ${results.filter(r => r.error).length} errors, ${newCount} new holders (${holders.size} total)`);

      // Write to DB periodically
      if (newHoldersTotal.size >= 50 || (i + chunk.length) % (maxConcurrent * 5) === 0) {
        if (newHoldersTotal.size > 0) {
          await writeHoldersToDB(contractId, newHoldersTotal, remote);
          console.log(`  [DB] Wrote ${newHoldersTotal.size} new holders`);
          newHoldersTotal = new Map();
        }

        // Save state
        state[contractId] = {
          completed: false,
          holders: Object.fromEntries(holders),
          maxTokenId,
        };
        saveState(state);
      }

      // Delay between chunks
      if (i + chunk.length < batchesToProcess.length) {
        await new Promise(r => setTimeout(r, delay));
      }

      if (consecutiveEmpty >= MAX_EMPTY) {
        console.log(`\n[COMPLETE] ${MAX_EMPTY} consecutive empty batches, stopping`);
        break;
      }

    } catch (error: any) {
      console.error(`[ERROR] Chunk ${i}:`, error.message);

      // Save progress
      state[contractId] = {
        completed: false,
        holders: Object.fromEntries(holders),
        maxTokenId,
      };
      saveState(state);
    }
  }

  // Final write
  if (newHoldersTotal.size > 0) {
    await writeHoldersToDB(contractId, newHoldersTotal, remote);
  }

  state[contractId] = {
    completed: true,
    holders: Object.fromEntries(holders),
    maxTokenId,
  };
  saveState(state);

  console.log(`\n[DONE] ${contractId}: ${holders.size} holders synced`);
}

/**
 * Load state
 */
function loadState(): SyncState {
  try {
    if (Bun.file(STATE_FILE).exists()) {
      return JSON.parse(Bun.file(STATE_FILE).text());
    }
  } catch {}
  return {};
}

/**
 * Save state
 */
function saveState(state: SyncState) {
  Bun.write(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Main
 */
async function main() {
  const args = process.argv.slice(2);
  const remote = args.includes("--remote");

  console.log("=".repeat(60));
  console.log("FAST Legion Holders Sync (Parallel Fetching)");
  console.log("=".repeat(60));

  // Handle graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`\n\n[!] ${signal} - Progress saved! Run again to resume.\n`);
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('Ctrl+C'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Test rate limits
  const { maxConcurrent, delay } = await testRateLimit();

  console.log("\n" + "=".repeat(60));
  console.log(`OPTIMAL SETTINGS: ${maxConcurrent} concurrent requests, ${delay}ms delay`);
  console.log("=".repeat(60));

  // Sync each contract
  for (const contractId of LEGION_CONTRACTS) {
    try {
      const supply = await getTotalSupply(contractId);
      const maxTokenId = await findMaxTokenId(contractId, supply);
      await syncContract(contractId, maxTokenId, remote, maxConcurrent, delay);
      await new Promise(r => setTimeout(r, 2000));
    } catch (error: any) {
      console.error(`\n[FATAL] ${contractId}:`, error.message);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("ALL CONTRACTS SYNCED!");
  console.log("=".repeat(60));

  try {
    await Bun.$`rm ${STATE_FILE}`.quiet();
  } catch {}
}

main().catch(error => {
  console.error("\nFatal error:", error);
  process.exit(1);
});
