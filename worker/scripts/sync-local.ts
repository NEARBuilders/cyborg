/**
 * Local-First Sync - Write to Local DB, Then Migrate to Remote
 *
 * Uses Drizzle ORM with better-sqlite3 for fast local writes
 */

import Database from "bun:sqlite";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LEGION_CONTRACTS = [
  "nearlegion.nfts.tg",
  "ascendant.nearlegion.near",
  "initiate.nearlegion.near",
];

// Multiple RPC endpoints to rotate through (from CompareNodes.com)
const RPC_ENDPOINTS = [
  "https://rpc.mainnet.near.org",           // Official NEAR.org endpoint
  "https://near.lava.build",               // Lava Network
  "https://near.blockpi.network/v1/rpc/public",  // BlockPI
  "https://near.drpc.org",                 // dRPC
  "https://go.getblock.io/624a04f3e6d34380bee5c247fcf06c4e",  // GetBlock
  "https://api.blockeden.xyz/near/67nCBdZQSH9z3YqDDjdm",  // BlockEden
  "https://endpoints.omniatech.io/v1/near/mainnet/public",  // OMNIA
];

// Shuffle endpoints to distribute load
const shuffledEndpoints = [...RPC_ENDPOINTS]
  .map(value => ({ value, sort: Math.random() }))
  .sort((a, b) => a.sort - b.sort)
  .map(({ value }) => value);

const BATCH_SIZE = 10;
const DELAY = 200; // Shorter delay since we're rotating endpoints
const WRITE_INTERVAL = 100;
const LOCAL_DB = "near-agent-db";
const STATE_FILE = `${__dirname}/legion-sync-state.json`;

// Round-robin RPC endpoint index
let rpcIndex = 0;

function getNextRpcUrl(): string {
  const url = shuffledEndpoints[rpcIndex];
  rpcIndex = (rpcIndex + 1) % shuffledEndpoints.length;
  return url;
}

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
 * Fetch tokens from RPC with endpoint rotation
 * Uses numeric from_index for pagination
 */
async function fetchTokens(contractId: string, fromIndex: number): Promise<NEARToken[]> {
  const args = JSON.stringify({ from_index: String(fromIndex), limit: BATCH_SIZE });
  const argsBase64 = Buffer.from(args).toString("base64");
  const rpcUrl = getNextRpcUrl();

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
 * Write to LOCAL database using raw SQL (fast!)
 */
async function writeHoldersLocal(holders: Map<string, Map<string, number>>): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  // Create or open local SQLite database
  const db = new Database("local/legion-holders.db");
  db.exec(`
    CREATE TABLE IF NOT EXISTS legion_holders (
      account_id TEXT NOT NULL,
      contract_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      last_synced_at INTEGER NOT NULL,
      synced_at INTEGER NOT NULL,
      PRIMARY KEY (account_id, contract_id)
    )
  `);

  // Prepare upsert statement
  const upsert = db.prepare(`
    INSERT INTO legion_holders (account_id, contract_id, quantity, last_synced_at, synced_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(account_id, contract_id) DO UPDATE SET
      quantity = excluded.quantity,
      last_synced_at = excluded.last_synced_at,
      synced_at = excluded.synced_at
  `);

  // Batch upsert
  const insertMany = db.transaction((records) => {
    for (const record of records) {
      upsert.run(record.accountId, record.contractId, record.quantity, now, now);
    }
  });

  const records: Array<{accountId: string; contractId: string; quantity: number}> = [];
  for (const [accountId, contractMap] of holders.entries()) {
    for (const [contractId, quantity] of contractMap.entries()) {
      records.push({ accountId, contractId, quantity });
    }
  }

  if (records.length > 0) {
    insertMany(records);
  }

  db.close();
}

/**
 * Get all holders from local DB (for migration)
 */
async function getLocalHolders(): Promise<Map<string, Map<string, number>>> {
  const db = new Database("local/legion-holders.db");

  const stmt = db.prepare("SELECT account_id, contract_id, quantity FROM legion_holders");
  const results = stmt.all() as Array<{account_id: string; contract_id: string; quantity: number}>;

  db.close();

  const holders = new Map<string, Map<string, number>>();
  for (const row of results) {
    if (!holders.has(row.account_id)) {
      holders.set(row.account_id, new Map());
    }
    holders.get(row.account_id)!.set(row.contract_id, row.quantity);
  }

  return holders;
}

/**
 * Sync contract to LOCAL database
 * Uses numeric pagination until exhaustion (consecutive empty responses)
 */
async function syncContractLocal(contractId: string): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Syncing: ${contractId}`);
  console.log(`Method: Numeric pagination until exhaustion`);
  console.log(`WRITING TO LOCAL DATABASE`);
  console.log(`${"=".repeat(60)}`);

  const state = loadState();
  const contractState = state[contractId] || { currentIndex: 0, holders: {} };

  // Convert flat holders to nested map by contract
  const holders = new Map<string, Map<string, number>>();
  for (const [key, quantity] of Object.entries(contractState.holders)) {
    const [accountId] = key.split(":");
    if (!holders.has(accountId)) {
      holders.set(accountId, new Map());
    }
    holders.get(accountId)!.set(contractId, quantity);
  }

  let currentIndex = contractState.currentIndex;
  const seenTokens = new Set<string>();

  console.log(`[RESUME] Starting from index ${currentIndex} (${holders.size} holders already)`);

  let consecutiveEmpty = 0;
  const MAX_EMPTY = 100; // High threshold to handle lexicographic gaps
  let tokensSinceLastWrite = 0;
  let totalTokensFetched = 0;
  let totalNewHolders = 0;

  while (consecutiveEmpty < MAX_EMPTY) {
    try {
      const tokens = await fetchTokens(contractId, currentIndex);

      if (tokens.length === 0) {
        consecutiveEmpty++;
        const totalHolders = Array.from(holders.values()).reduce((sum, m) => sum + m.size, 0);
        console.log(`[${currentIndex}] Empty response (${consecutiveEmpty}/${MAX_EMPTY}) - ${totalHolders} holders, ${totalTokensFetched} tokens fetched`);
        await new Promise(r => setTimeout(r, DELAY));
        currentIndex += BATCH_SIZE;
        continue;
      }

      consecutiveEmpty = 0; // Reset on successful fetch

      let newCount = 0;
      for (const token of tokens) {
        if (token.token_id && token.owner_id && !seenTokens.has(token.token_id)) {
          seenTokens.add(token.token_id);

          if (!holders.has(token.owner_id)) {
            holders.set(token.owner_id, new Map());
          }
          holders.get(token.owner_id)!.set(contractId, (holders.get(token.owner_id)?.get(contractId) || 0) + 1);

          newCount++;
          totalNewHolders++;
        }
      }

      totalTokensFetched += tokens.length;
      tokensSinceLastWrite += newCount;

      const totalHolders = Array.from(holders.values()).reduce((sum, m) => sum + m.size, 0);
      console.log(`[${currentIndex}] ${tokens.length} tokens, ${newCount} new holders, ${totalHolders} total, ${totalTokensFetched} fetched`);

      // Write to LOCAL DB periodically
      if (tokensSinceLastWrite >= WRITE_INTERVAL) {
        console.log(`  [DB] Writing to LOCAL DB...`);
        await writeHoldersLocal(holders);
        tokensSinceLastWrite = 0;

        // Save state after write
        const flatHolders: Record<string, number> = {};
        for (const [accountId, contractMap] of holders.entries()) {
          for (const [cid, quantity] of contractMap.entries()) {
            const key = `${accountId}:${cid}`;
            flatHolders[key] = quantity;
          }
        }

        state[contractId] = {
          currentIndex: currentIndex + BATCH_SIZE,
          holders: flatHolders,
        };
        saveState(state);
      }

      currentIndex += BATCH_SIZE;

      // If we got fewer than BATCH_SIZE tokens, we might be at the end
      if (tokens.length < BATCH_SIZE) {
        console.log(`[INFO] Got ${tokens.length} < ${BATCH_SIZE}, possibly near end`);
      }

      await new Promise(r => setTimeout(r, DELAY));

    } catch (error: any) {
      if (error.message === "RATE_LIMIT") {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      // Save progress before error
      const flatHolders: Record<string, number> = {};
      for (const [accountId, contractMap] of holders.entries()) {
        for (const [cid, quantity] of contractMap.entries()) {
          const key = `${accountId}:${cid}`;
          flatHolders[key] = quantity;
        }
      }

      state[contractId] = {
        currentIndex,
        holders: flatHolders,
      };
      saveState(state);

      throw error;
    }
  }

  const totalHolders = holders.size;
  console.log(`\n[DONE] ${contractId}: ${totalHolders} holders, ${totalNewHolders} new, ${totalTokensFetched} tokens synced`);

  // Final write
  await writeHoldersLocal(holders);

  // Save final state
  const flatHolders: Record<string, number> = {};
  for (const [accountId, contractMap] of holders.entries()) {
    for (const [cid, quantity] of contractMap.entries()) {
      const key = `${accountId}:${cid}`;
      flatHolders[key] = quantity;
    }
  }

  state[contractId] = { currentIndex, holders: flatHolders };
  saveState(state);
}

/**
 * Migrate local DB to remote D1
 */
async function migrateToRemote(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("MIGRATING LOCAL DB → REMOTE D1");
  console.log("=".repeat(60));

  // Read directly from local SQLite database
  const db = new Database("local/legion-holders.db");
  const rows = db.prepare("SELECT contract_id, account_id, quantity FROM legion_holders ORDER BY contract_id, account_id").all() as Array<{
    contract_id: string;
    account_id: string;
    quantity: number;
  }>;
  db.close();

  if (rows.length === 0) {
    console.log("[SKIP] No data to migrate");
    return;
  }
  console.log(`[INFO] Migrating ${rows.length} holder records to remote...`);

  // Group by contract for efficient writes
  const byContract = new Map<string, Array<{account: string; quantity: number}>>();
  for (const row of rows) {
    if (!byContract.has(row.contract_id)) {
      byContract.set(row.contract_id, []);
    }
    byContract.get(row.contract_id)!.push({ account: row.account_id, quantity: row.quantity });
  }

  // Write each contract
  const now = Math.floor(Date.now() / 1000);
  let totalMigrated = 0;

  for (const [contractId, holders] of byContract.entries()) {
    console.log(`\n[MIGRATE] ${contractId}: ${holders.length} holders...`);

    const statements: string[] = [];
    for (const holder of holders) {
      const escapedId = holder.account.replace(/'/g, "''");
      const escapedContract = contractId.replace(/'/g, "''");
      statements.push(
        `INSERT OR REPLACE INTO legion_holders (account_id, contract_id, quantity, last_synced_at, synced_at) VALUES ('${escapedId}', '${escapedContract}', ${holder.quantity}, ${now}, ${now});`
      );
    }

    const sql = statements.join("\n");
    const tempFile = `/tmp/migrate_${contractId}.sql`;
    await Bun.write(tempFile, sql);

    const migrateProc = Bun.spawn(["sh", "-c", `wrangler d1 execute ${LOCAL_DB} --remote --file=${tempFile}`], {
      stdout: "inherit",
      stderr: "inherit",
    });

    const migrateExitCode = await migrateProc.exited;

    try {
      await Bun.$`rm ${tempFile}`.quiet();
    } catch {}

    if (migrateExitCode !== 0) {
      throw new Error(`Migration failed for ${contractId}`);
    }

    totalMigrated += holders.length;
    console.log(`  ✓ ${holders.length} holders migrated`);
  }

  console.log(`\n[DONE] ${totalMigrated} holder records migrated to remote D1`);
}

/**
 * State functions
 */
function loadState(): SyncState {
  try {
    // Create state file if it doesn't exist
    if (!Bun.file(STATE_FILE).exists()) {
      Bun.write(STATE_FILE, JSON.stringify({}, null, 2));
      return {};
    }
    return JSON.parse(Bun.file(STATE_FILE).text());
  } catch (error) {
    // If there's any error, create fresh state
    Bun.write(STATE_FILE, JSON.stringify({}, null, 2));
    return {};
  }
}

function saveState(state: SyncState) {
  Bun.write(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Main
 */
async function main() {
  const args = process.argv.slice(2);
  const migrate = args.includes("--migrate");
  const skipSync = args.includes("--skip-sync");
  const clean = args.includes("--clean");

  console.log("=".repeat(60));
  console.log("Local-First Legion Holders Sync");
  console.log("=".repeat(60));
  console.log("\n1. Syncs to LOCAL database (fast)");
  console.log("2. Migrates to REMOTE database (one-time)");
  console.log("\nCommands:");
  console.log("  bun run scripts/sync-local.ts              # Sync to local");
  console.log("  bun run scripts/sync-local.ts --migrate   # Migrate local → remote");
  console.log("  bun run scripts/sync-local.ts --skip-sync --migrate  # Only migrate");
  console.log("  bun run scripts/sync-local.ts --clean     # Start fresh (clear state)");
  console.log("\nPress Ctrl+C to pause (progress saved)\n");

  // Clean state if requested
  if (clean) {
    console.log("[CLEAN] Clearing state file...");
    Bun.write(STATE_FILE, JSON.stringify({}, null, 2));
    console.log("[CLEAN] State cleared. Starting fresh.\n");
  }

  const shutdown = (signal: string) => {
    console.log(`\n\n[!] ${signal} - Progress saved! Run again to resume.\n`);
    console.log(`[!] When ready to migrate, run: bun run scripts/sync-local.ts --migrate\n`);
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('Ctrl+C'));

  // Step 1: Sync to local DB
  if (!skipSync) {
    for (const contractId of LEGION_CONTRACTS) {
      try {
        await syncContractLocal(contractId);
        await new Promise(r => setTimeout(r, 500));
      } catch (error: any) {
        console.error(`\n[ERROR] ${contractId}:`, error.message);
        console.log("[!] Progress saved. Run again to resume.\n");
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("LOCAL SYNC COMPLETE!");
    console.log("=".repeat(60));
    console.log(`\n${LEGION_CONTRACTS.length} contracts synced to LOCAL database`);
    console.log("\nNext step: Migrate to remote");
    console.log("  Run: bun run scripts/sync-local.ts --migrate");
    console.log("  Or run both steps now: bun run scripts/sync-local.ts --migrate --skip-sync\n");
  }

  // Step 2: Migrate to remote
  if (migrate) {
    await migrateToRemote();

    console.log("\n" + "=".repeat(60));
    console.log("ALL DONE!");
    console.log("=".repeat(60));

    // Clean up state
    try {
      await Bun.$`rm ${STATE_FILE}`.quiet();
      console.log("\nCleaned up state file");
    } catch {}
  }
}

main().catch(error => {
  console.error("\nFatal:", error);
  process.exit(1);
});
