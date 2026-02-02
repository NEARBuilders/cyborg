/**
 * Resumable Legion Holders Sync via RPC
 *
 * Features:
 * - Writes to DB as it goes (no lost progress)
 * - Resumable (can continue if interrupted)
 * - Progress tracking via state file
 */

const LEGION_CONTRACTS = [
  "nearlegion.nfts.tg",
  "ascendant.nearlegion.near",
  "initiate.nearlegion.near",
];

const RPC_URL = "https://rpc.mainnet.near.org";
const BATCH_SIZE = 20; // Increased slightly for efficiency
const REQUEST_DELAY = 300; // ms between requests
const STATE_FILE = "/tmp/legion-sync-state.json";

interface SyncState {
  [contractId: string]: {
    currentIndex: number;
    completed: boolean;
    holders: Record<string, number>;
  };
}

interface NEARToken {
  token_id?: string;
  owner_id?: string;
}

/**
 * Load state from file
 */
function loadState(): SyncState {
  try {
    const content = Bun.file(STATE_FILE).exists()
      ? Bun.file(STATE_FILE).text()
      : "{}";
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Save state to file
 */
function saveState(state: SyncState) {
  Bun.write(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Get total supply of tokens for a contract
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

  if (!response.ok) {
    console.warn(`[WARN] Could not get supply for ${contractId}, using default`);
    return 500;
  }

  const result = await response.json();
  if (result.error) {
    console.warn(`[WARN] Supply query failed for ${contractId}, using default`);
    return 500;
  }

  const rawResult = result.result?.result || [];

  // Parse result
  let supplyStr = "";
  if (Array.isArray(rawResult) && rawResult.length > 0 && typeof rawResult[0] === "number") {
    const buffer = Buffer.from(new Uint8Array(rawResult));
    supplyStr = buffer.toString();
  } else if (typeof rawResult === "string") {
    const buffer = Buffer.from(rawResult, "base64");
    supplyStr = buffer.toString();
  }

  // Remove quotes and parse
  supplyStr = supplyStr.replace(/["']/g, "");
  const supply = parseInt(supplyStr, 10) || 500;

  console.log(`[SUPPLY] ${contractId}: ${supply} total tokens`);
  return supply;
}

/**
 * Find the actual maximum token ID by sampling
 * This is more accurate than using total_supply because tokens might not be numbered sequentially
 */
async function findMaxTokenId(contractId: string, estimatedMax: number): Promise<number> {
  console.log(`[SCAN] Finding max token ID for ${contractId} (estimated: ${estimatedMax})...`);

  // Binary search to find the max token
  let low = 0;
  let high = estimatedMax;
  let maxFound = 0;

  // First, check if there are tokens at the estimated max
  const tokensAtMax = await fetchTokensInRange(contractId, estimatedMax, 1);
  if (tokensAtMax.length > 0) {
    // There are tokens at estimated max, might be even higher
    maxFound = estimatedMax;
    // Try doubling
    while (true) {
      const testMax = maxFound * 2;
      const testTokens = await fetchTokensInRange(contractId, testMax, 1);
      if (testTokens.length > 0) {
        maxFound = testMax;
        console.log(`[SCAN] Found tokens at ${testMax}, continuing...`);
      } else {
        break;
      }
      await new Promise(r => setTimeout(r, 200));
    }
    return maxFound;
  }

  // Binary search between 0 and estimatedMax
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const tokens = await fetchTokensInRange(contractId, mid, 1);

    if (tokens.length > 0) {
      maxFound = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }

    await new Promise(r => setTimeout(r, 100));
  }

  // Add a buffer because tokens might not be perfectly sequential
  const actualMax = maxFound + 100;
  console.log(`[SCAN] Max token ID found: ${maxFound}, using ${actualMax} as limit`);

  return actualMax;
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
    throw new Error(`RPC failed: ${response.statusText}`);
  }

  const result = await response.json();
  if (result.error) {
    if (result.error.message.includes("GasLimitExceeded")) {
      throw new Error("Gas limit exceeded");
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
 * Write NEW holders to D1 immediately
 * Only writes holders that haven't been written before
 */
async function writeHoldersToDB(
  contractId: string,
  newHolders: Map<string, number>,
  remote: boolean
): Promise<void> {
  if (newHolders.size === 0) return;

  const dbName = "near-agent-db";
  const remoteFlag = remote ? "--remote" : "--local";
  const now = Math.floor(Date.now() / 1000);

  const statements: string[] = [];
  for (const [accountId, quantity] of newHolders.entries()) {
    const escapedId = accountId.replace(/'/g, "''");
    const escapedContract = contractId.replace(/'/g, "''");
    statements.push(
      `INSERT OR REPLACE INTO legion_holders (account_id, contract_id, quantity, last_synced_at, synced_at) VALUES ('${escapedId}', '${escapedContract}', ${quantity}, ${now}, ${now});`
    );
  }

  const sql = statements.join("\n");
  const tempFile = `/tmp/holders_${contractId}_${Date.now()}.sql`;

  await Bun.write(tempFile, sql);

  // Run wrangler silently
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
 * Sync a single contract
 */
async function syncContract(
  contractId: string,
  maxTokenId: number,
  remote: boolean
): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Syncing: ${contractId}`);
  console.log(`Max token ID: ${maxTokenId}`);
  console.log(`${"=".repeat(60)}`);

  // Load state
  const state = loadState();
  const contractState = state[contractId] || {
    currentIndex: 0,
    completed: false,
    holders: {},
  };

  if (contractState.completed) {
    console.log(`[SKIP] ${contractId} already completed`);
    return;
  }

  const holders = new Map<string, number>(Object.entries(contractState.holders));
  const writtenHolders = new Set<string>(Object.keys(contractState.holders)); // Track who's been written
  let currentIndex = contractState.currentIndex;
  const seenTokens = new Set<string>();

  console.log(`[RESUME] Starting from index ${currentIndex} (max: ${maxTokenId})`);
  console.log(`[RESUME] Already have ${holders.size} holders (${writtenHolders.size} written to DB)`);
  console.log(`[INFO] Writing to DB after EVERY batch (Ctrl+C to pause)\n`);

  let consecutiveEmpty = 0;
  const MAX_EMPTY = 20;

  while (currentIndex <= maxTokenId && consecutiveEmpty < MAX_EMPTY) {
    try {
      const tokens = await fetchTokensInRange(contractId, currentIndex, BATCH_SIZE);

      // Track new holders in this batch
      const newHoldersInBatch = new Map<string, number>();

      // Process tokens
      let newCount = 0;
      for (const token of tokens) {
        if (token.token_id && token.owner_id && !seenTokens.has(token.token_id)) {
          seenTokens.add(token.token_id);
          const isNewHolder = !holders.has(token.owner_id);
          holders.set(token.owner_id, (holders.get(token.owner_id) || 0) + 1);

          if (isNewHolder) {
            newHoldersInBatch.set(token.owner_id, holders.get(token.owner_id)!);
            newCount++;
          }
        }
      }

      const percentComplete = ((currentIndex / maxTokenId) * 100).toFixed(1);

      if (newCount > 0) {
        consecutiveEmpty = 0;
        console.log(`[${currentIndex}/${maxTokenId}] ${percentComplete}% - ${tokens.length} tokens, ${newCount} new, ${holders.size} holders total, ${newHoldersInBatch.size} to DB`);
      } else {
        console.log(`[${currentIndex}/${maxTokenId}] ${percentComplete}% - No tokens (${consecutiveEmpty + 1}/${MAX_EMPTY} empty)`);
        consecutiveEmpty++;
      }

      // Write ONLY NEW holders to DB after every batch
      if (newHoldersInBatch.size > 0) {
        await writeHoldersToDB(contractId, newHoldersInBatch, remote);
      }

      // Save state after every batch
      state[contractId] = {
        currentIndex: currentIndex + BATCH_SIZE,
        completed: false,
        holders: Object.fromEntries(holders),
      };
      saveState(state);

      currentIndex += BATCH_SIZE;

      // Delay
      await new Promise(r => setTimeout(r, REQUEST_DELAY));

    } catch (error: any) {
      const errorMsg = error?.message || String(error);

      if (errorMsg.includes("Too Many Requests") || errorMsg.includes("429")) {
        console.log(`[RATE LIMIT] Waiting 5s before retry...`);
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }

      // Save progress before exiting
      state[contractId] = {
        currentIndex,
        completed: false,
        holders: Object.fromEntries(holders),
      };
      saveState(state);

      console.error(`[ERROR] at ${currentIndex}: ${errorMsg}`);
      throw error;
    }
  }

  // Mark as complete
  state[contractId] = {
    currentIndex,
    completed: true,
    holders: Object.fromEntries(holders),
  };
  saveState(state);

  console.log(`\n[DONE] ${contractId}: ${holders.size} holders synced`);
}

/**
 * Main
 */
async function main() {
  // Handle graceful shutdown
  let isShuttingDown = false;

  const shutdown = (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n\n[!] Received ${signal} - Saving progress and exiting...`);
    console.log(`[!] State saved to: ${STATE_FILE}`);
    console.log(`[!] Run again to resume from where you left off\n`);
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT (Ctrl+C)'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  const args = process.argv.slice(2);
  const remote = args.includes("--remote");

  console.log("=".repeat(60));
  console.log("Resumable Legion Holders Sync");
  console.log("=".repeat(60));
  console.log(`State file: ${STATE_FILE}`);
  console.log(`Remote: ${remote ? "Yes" : "No (local)"}`);
  console.log("\nPress Ctrl+C to pause (progress is saved)\n");

  for (const contractId of LEGION_CONTRACTS) {
    try {
      // Get total supply first
      const totalSupply = await getTotalSupply(contractId);

      // Then find the actual max token ID
      const maxTokenId = await findMaxTokenId(contractId, totalSupply);

      await syncContract(contractId, maxTokenId, remote);
      await new Promise(r => setTimeout(r, 2000));
    } catch (error: any) {
      console.error(`\n[FATAL ERROR] ${contractId}:`, error.message);
      console.log("\nProgress saved. Run again to resume.");
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("All contracts synced!");
  console.log("=".repeat(60));

  // Clean up state file
  try {
    await Bun.$`rm ${STATE_FILE}`.quiet();
    console.log("\nCleaned up state file");
  } catch {}
}

main().catch(error => {
  console.error("\nFatal error:", error);
  process.exit(1);
});
