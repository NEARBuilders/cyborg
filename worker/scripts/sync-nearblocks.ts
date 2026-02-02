/**
 * Sync Legion Holders using Nearblocks API
 * Fetches all holders for all 3 Legion contracts
 */

const LEGION_CONTRACTS = [
  "nearlegion.nfts.tg",
  "ascendant.nearlegion.near",
  "initiate.nearlegion.near",
];

// Use public Nearblocks API (no auth needed for basic requests)
const NEARBLOCKS_API = "https://api.nearblocks.io/v1";

interface NearblocksToken {
  token_id: string;
  owner: string;
}

interface ContractHolders {
  contractId: string;
  holders: Map<string, number>;
}

/**
 * Fetch all tokens for a contract from Nearblocks
 */
async function fetchContractHolders(contractId: string): Promise<Map<string, number>> {
  console.log(`\n[NEARBLOCKS] Fetching ${contractId}...`);

  const holders = new Map<string, number>();
  let page = 1;
  const perPage = 100;
  let hasMore = true;

  while (hasMore) {
    try {
      const url = `${NEARBLOCKS_API}/nft/tokens/${contractId}?page=${page}&per_page=${perPage}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(`API Error: ${data.error}`);
      }

      const tokens: NearblocksToken[] = data.tokens || [];

      if (tokens.length === 0) {
        hasMore = false;
        break;
      }

      // Count tokens per owner
      for (const token of tokens) {
        const owner = token.owner;
        if (owner) {
          holders.set(owner, (holders.get(owner) || 0) + 1);
        }
      }

      console.log(`[NEARBLOCKS] ${contractId}: Page ${page} - ${tokens.length} tokens (${holders.size} holders)`);

      // Check if more pages
      if (tokens.length < perPage) {
        hasMore = false;
      } else {
        page++;
      }

      // Small delay to be nice
      await new Promise(r => setTimeout(r, 100));
    } catch (error: any) {
      console.error(`[ERROR] ${contractId} page ${page}:`, error.message);
      throw error;
    }
  }

  console.log(`[NEARBLOCKS] ${contractId}: Complete - ${holders.size} holders`);
  return holders;
}

/**
 * Generate SQL for all holders
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
  console.log("Legion Holders Sync (Nearblocks API)");
  console.log("=".repeat(60));

  // Fetch all contracts
  const allHolders = new Map<string, Map<string, number>>();

  for (const contractId of LEGION_CONTRACTS) {
    try {
      const holders = await fetchContractHolders(contractId);

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
    console.log("  bun run scripts/sync-nearblocks.ts --apply       # Local");
    console.log("  bun run scripts/sync-nearblocks.ts --apply --remote  # Remote");
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
