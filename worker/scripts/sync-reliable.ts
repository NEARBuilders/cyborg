/**
 * Simple, Reliable Sync - Just Works!
 *
 * Fixed settings that are tested and work:
 * - Sequential fetching (no rate limit issues)
 * - Writes after every batch
 * - Reasonable max limits per contract
 */

const LEGION_CONTRACTS = [
  { id: "nearlegion.nfts.tg", max: 500 },     // Small contract
  { id: "ascendant.nearlegion.near", max: 500 },  // Small contract
  { id: "initiate.nearlegion.near", max: 18000 }, // Large contract
];

const RPC_URL = "https://rpc.mainnet.near.org";
const BATCH_SIZE = 10;
const DELAY = 300; // ms between requests
const STATE_FILE = "/tmp/legion-sync-reliable.json";

interface SyncState {
  [contractId: string]: {
    currentIndex: number;
    holders: Record<string, number>;
  };
}

interface NEARToken {
  token_id?: string;
  owner_id?: string;
}

/**
 * Fetch tokens
 */
async function fetchTokens(contractId: string, fromIndex: number): Promise<NEARToken[]> {
  const args = JSON.stringify({ from_index: String(fromIndex), limit: BATCH_SIZE });
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
    if (response.status === 429) {
      throw new Error("RATE_LIMIT");
    }
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
}

/**
 * Write to DB
 */
async function writeHolders(contractId: string, holders: Map<string, number>, remote: boolean): Promise<void> {
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
  const tempFile = `/tmp/holders_${Date.now()}.sql`;
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
async function syncContract(config: { id: string; max: number }, remote: boolean): Promise<void> {
  const { id: contractId, max: maxTokenId } = config;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Syncing: ${contractId}`);
  console.log(`Max: ${maxTokenId} | Batch: ${BATCH_SIZE} | Delay: ${DELAY}ms`);
  console.log(`${"=".repeat(60)}`);

  const state = loadState();
  const contractState = state[contractId] || { currentIndex: 0, holders: {} };

  const holders = new Map<string, number>(Object.entries(contractState.holders));
  let currentIndex = contractState.currentIndex;
  const seenTokens = new Set<string>();

  console.log(`[RESUME] Starting from ${currentIndex} (${holders.size} holders already)`);

  let consecutiveEmpty = 0;
  const MAX_EMPTY = 15;

  while (currentIndex <= maxTokenId && consecutiveEmpty < MAX_EMPTY) {
    try {
      const tokens = await fetchTokens(contractId, currentIndex);

      let newCount = 0;
      for (const token of tokens) {
        if (token.token_id && token.owner_id && !seenTokens.has(token.token_id)) {
          seenTokens.add(token.token_id);
          holders.set(token.owner_id, (holders.get(token.owner_id) || 0) + 1);
          newCount++;
        }
      }

      const percentComplete = ((currentIndex / maxTokenId) * 100).toFixed(1);

      if (newCount > 0) {
        consecutiveEmpty = 0;
        console.log(`[${currentIndex}/${maxTokenId}] ${percentComplete}% - ${tokens.length} tokens, ${newCount} new, ${holders.size} total`);
      } else {
        console.log(`[${currentIndex}/${maxTokenId}] ${percentComplete}% - No tokens (${consecutiveEmpty + 1}/${MAX_EMPTY})`);
        consecutiveEmpty++;
      }

      // Write after every batch
      if (newCount > 0) {
        await writeHolders(contractId, holders, remote);
      }

      // Save state
      state[contractId] = {
        currentIndex: currentIndex + BATCH_SIZE,
        holders: Object.fromEntries(holders),
      };
      saveState(state);

      currentIndex += BATCH_SIZE;
      await new Promise(r => setTimeout(r, DELAY));

    } catch (error: any) {
      if (error.message === "RATE_LIMIT") {
        console.log(`[RATE LIMIT] Waiting 5s...`);
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }

      // Save progress
      state[contractId] = {
        currentIndex,
        holders: Object.fromEntries(holders),
      };
      saveState(state);

      throw error;
    }
  }

  console.log(`\n[DONE] ${contractId}: ${holders.size} holders synced`);
  state[contractId] = { currentIndex, holders: Object.fromEntries(holders) };
  saveState(state);
}

/**
 * State functions
 */
function loadState(): SyncState {
  try {
    if (Bun.file(STATE_FILE).exists()) {
      return JSON.parse(Bun.file(STATE_FILE).text());
    }
  } catch {}
  return {};
}

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
  console.log("Reliable Legion Holders Sync");
  console.log("=".repeat(60));
  console.log("\nPress Ctrl+C to pause (progress saved)\n");

  const shutdown = (signal: string) => {
    console.log(`\n\n[!] ${signal} - Progress saved! Run again to resume.\n`);
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('Ctrl+C'));

  for (const config of LEGION_CONTRACTS) {
    try {
      await syncContract(config, remote);
      await new Promise(r => setTimeout(r, 1000));
    } catch (error: any) {
      console.error(`\n[ERROR] ${config.id}:`, error.message);
      console.log("[!] Progress saved. Run again to resume.\n");
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
