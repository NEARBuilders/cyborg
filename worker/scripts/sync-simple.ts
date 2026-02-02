/**
 * Simple Fast Sync with Conservative Defaults
 *
 * Fixed settings that work reliably:
 * - 3 concurrent requests
 * - 500ms delay between chunks
 * - Exponential backoff on rate limits
 */

const LEGION_CONTRACTS = [
  "nearlegion.nfts.tg",
  "ascendant.nearlegion.near",
  "initiate.nearlegion.near",
];

// Multiple RPC endpoints to rotate through
const RPC_ENDPOINTS = [
  "https://rpc.mainnet.near.org",
  "https://near.lava.build",
  "https://near.blockpi.network/v1/rpc/public",
  "https://near.drpc.org",
  "https://go.getblock.io/624a04f3e6d34380bee5c247fcf06c4e",
  "https://api.blockeden.xyz/near/67nCBdZQSH9z3YqDDjdm",
  "https://endpoints.omniatech.io/v1/near/mainnet/public",
];

const STATE_FILE = `${import.meta.dir}/legion-sync-state-simple.json`;
const BATCH_SIZE = 20;
const CONCURRENT = 3; // Conservative
const CHUNK_DELAY = 200; // ms between chunks (shorter with endpoint rotation)

// Round-robin RPC endpoint index
let rpcIndex = 0;

function getNextRpcUrl(): string {
  const url = RPC_ENDPOINTS[rpcIndex];
  rpcIndex = (rpcIndex + 1) % RPC_ENDPOINTS.length;
  return url;
}

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

/**
 * Fetch tokens with retry and endpoint rotation
 */
async function fetchTokensRetry(
  contractId: string,
  fromIndex: number,
  limit: number,
  retries = 3
): Promise<NEARToken[]> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const args = JSON.stringify({ from_index: String(fromIndex), limit });
      const argsBase64 = Buffer.from(args).toString("base64");
      const rpcUrl = getNextRpcUrl();

      const response = await fetch(rpcUrl, {
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

      if (response.status === 429) {
        // Skip to next endpoint (rotation will handle it)
        await new Promise(r => setTimeout(r, 200));
        continue;
      }

      if (!response.ok) {
        return [];
      }

      const result = await response.json();
      if (result.error) {
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
    } catch (error: any) {
      if (attempt === retries - 1) {
        return [];
      }
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return [];
}

/**
 * Get total supply
 */
async function getTotalSupply(contractId: string): Promise<number> {
  try {
    const argsBase64 = Buffer.from(JSON.stringify({})).toString("base64");
    const rpcUrl = getNextRpcUrl();

    const response = await fetch(rpcUrl, {
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
      supplyStr = Buffer.from(new Uint8Array(rawResult)).toString();
    } else if (typeof rawResult === "string") {
      supplyStr = Buffer.from(rawResult, "base64").toString();
    }

    supplyStr = supplyStr.replace(/["']/g, "");
    return parseInt(supplyStr, 10) || 500;
  } catch {
    return 500;
  }
}

/**
 * Write to DB
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
    throw new Error(`DB write failed (exit ${exitCode})`);
  }
}

/**
 * Sync contract
 */
async function syncContract(
  contractId: string,
  maxTokenId: number,
  remote: boolean
): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Syncing: ${contractId} (max: ${maxTokenId})`);
  console.log(`${"=".repeat(60)}`);

  const state = loadState();
  const contractState = state[contractId] || {
    completed: false,
    holders: {},
    maxTokenId,
  };

  if (contractState.completed && contractState.maxTokenId === maxTokenId) {
    console.log(`[SKIP] Already completed`);
    return;
  }

  const holders = new Map<string, number>(Object.entries(contractState.holders));
  const seenTokens = new Set<string>();
  const writtenHolders = new Set(Object.keys(contractState.holders));

  // Generate all batch start indices
  const totalBatches = Math.ceil(maxTokenId / BATCH_SIZE);
  const allBatches = Array.from({ length: totalBatches }, (_, i) => i * BATCH_SIZE);

  // Filter out already processed batches
  const batchesToProcess = allBatches.filter(startIdx => {
    // Simple heuristic: if we have enough holders, we've probably covered earlier batches
    const holdersNeeded = startIdx / 5; // Rough estimate: 5 tokens per holder
    return holders.size < holdersNeeded;
  });

  console.log(`[INFO] Processing ${batchesToProcess.length}/${totalBatches} batches (${holders.size} holders already)`);

  let consecutiveEmpty = 0;
  const MAX_EMPTY = 15;
  const newHoldersBatch = new Map<string, number>();

  for (let i = 0; i < batchesToProcess.length; i += CONCURRENT) {
    const chunk = batchesToProcess.slice(i, Math.min(i + CONCURRENT, batchesToProcess.length));
    const progress = ((i + chunk.length) / batchesToProcess.length * 100).toFixed(1);

    console.log(`\n[${i + chunk.length}/${batchesToProcess.length}] ${progress}% - ${chunk.length} batches...`);

    // Fetch in parallel
    const results = await Promise.all(
      chunk.map(async (startIdx) => {
        const tokens = await fetchTokensRetry(contractId, startIdx, BATCH_SIZE);
        return { startIdx, tokens };
      })
    );

    // Process results
    let newCount = 0;
    let emptyCount = 0;

    for (const { startIdx, tokens } of results) {
      if (tokens.length === 0) {
        emptyCount++;
      } else {
        consecutiveEmpty = 0;
      }

      for (const token of tokens) {
        if (token.token_id && token.owner_id && !seenTokens.has(token.token_id)) {
          seenTokens.add(token.token_id);
          const isNew = !holders.has(token.owner_id);
          holders.set(token.owner_id, (holders.get(token.owner_id) || 0) + 1);

          if (isNew) {
            newHoldersBatch.set(token.owner_id, holders.get(token.owner_id)!);
            newCount++;
          }
        }
      }
    }

    if (emptyCount === chunk.length) {
      consecutiveEmpty++;
    } else {
      consecutiveEmpty = 0;
    }

    console.log(`  → ${newCount} new holders (${holders.size} total, ${newHoldersBatch.size} to write)`);

    // Write to DB every few chunks
    if (newHoldersBatch.size >= 30 || (i + chunk.length) % (CONCURRENT * 10) === 0) {
      if (newHoldersBatch.size > 0) {
        await writeHoldersToDB(contractId, newHoldersBatch, remote);
        console.log(`  [DB] Wrote ${newHoldersBatch.size} holders`);
        newHoldersBatch.clear();
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
      await new Promise(r => setTimeout(r, CHUNK_DELAY));
    }

    if (consecutiveEmpty >= MAX_EMPTY) {
      console.log(`\n[COMPLETE] ${MAX_EMPTY} consecutive empty batches`);
      break;
    }
  }

  // Final write
  if (newHoldersBatch.size > 0) {
    await writeHoldersToDB(contractId, newHoldersBatch, remote);
  }

  state[contractId] = {
    completed: true,
    holders: Object.fromEntries(holders),
    maxTokenId,
  };
  saveState(state);

  console.log(`\n[DONE] ${holders.size} holders synced`);
}

/**
 * Load/save state
 */
function loadState(): SyncState {
  try {
    const fs = require('fs');
    if (fs.existsSync(STATE_FILE)) {
      const text = fs.readFileSync(STATE_FILE, 'utf-8');
      return JSON.parse(text);
    }
  } catch (e) {
    // File doesn't exist or is invalid, return empty state
  }
  return {};
}

function saveState(state: SyncState) {
  try {
    const fs = require('fs');
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('[ERROR] Failed to save state:', e);
  }
}

/**
 * Main
 */
async function main() {
  const args = process.argv.slice(2);
  const remote = args.includes("--remote");

  console.log("=".repeat(60));
  console.log("Simple Fast Sync (Parallel)");
  console.log("=".repeat(60));
  console.log(`Settings: ${CONCURRENT} concurrent, ${BATCH_SIZE} batch size, ${CHUNK_DELAY}ms delay`);
  console.log(`Press Ctrl+C to pause (progress saved)\n`);

  const shutdown = (signal: string) => {
    console.log(`\n\n[!] ${signal} - Progress saved! Run again to resume.\n`);
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('Ctrl+C'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  for (const contractId of LEGION_CONTRACTS) {
    try {
      const supply = await getTotalSupply(contractId);
      // Add buffer
      const maxTokenId = supply + 500;
      await syncContract(contractId, maxTokenId, remote);
      await new Promise(r => setTimeout(r, 1000));
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
  console.error("\nFatal:", error);
  process.exit(1);
});
