/**
 * NEAR Social Profile Sync Script
 *
 * Fetches and caches NEAR Social profiles from social.near contract
 * into the D1 database for faster access and to reduce external API calls.
 *
 * Usage:
 *   bun run scripts/sync-profiles.ts              # Sync legion holders' profiles
 *   bun run scripts/sync-profiles.ts --remote     # Use remote D1 database
 *   bun run scripts/sync-profiles.ts --accounts account1.near,account2.near  # Sync specific accounts
 */

import { Social } from "near-social-js";

// NEAR Social API endpoints (fallback endpoints)
const SOCIAL_ENDPOINTS = [
  "https://api.near.social",
  "https://near-social-api.iconfig.app",
];

const STATE_FILE = `${import.meta.dir}/profile-sync-state.json`;
const CONCURRENT = 5; // Parallel profile fetches
const BATCH_DELAY = 100; // ms between batches
const PROFILES_PER_BATCH = 50;

// Round-robin endpoint index
let endpointIndex = 0;

interface ProfileSyncState {
  completed: boolean;
  processed: Record<string, number>; // account_id -> timestamp
  failedAccounts: string[];
}

interface NEARSocialProfile {
  [key: string]: any;
}

/**
 * Initialize Social client with endpoint rotation
 */
function createSocialClient(): Social {
  return new Social({
    network: "mainnet",
    apiUrl: SOCIAL_ENDPOINTS[endpointIndex],
  });
}

/**
 * Fetch profile with retry and endpoint rotation
 */
async function fetchProfileRetry(
  accountId: string,
  retries = 3
): Promise<NEARSocialProfile | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const social = createSocialClient();
      const profile = await social.getProfile(accountId);

      if (profile) {
        return profile;
      }

      // Profile doesn't exist - return null but don't retry
      return null;
    } catch (error: any) {
      console.error(`  [ERROR] ${accountId}: ${error.message}`);

      // Rotate to next endpoint on error
      endpointIndex = (endpointIndex + 1) % SOCIAL_ENDPOINTS.length;

      if (attempt === retries - 1) {
        return null;
      }

      // Wait before retry
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return null;
}

/**
 * Get list of accounts to sync
 */
async function getAccountsToSync(
  specifiedAccounts?: string[]
): Promise<string[]> {
  if (specifiedAccounts && specifiedAccounts.length > 0) {
    return specifiedAccounts;
  }

  // Fetch from legion_holders table
  const dbName = "near-agent-db";

  try {
    const proc = Bun.spawn([
      "wrangler",
      "d1",
      "execute",
      dbName,
      "--local",
      "--command",
      "SELECT DISTINCT account_id FROM legion_holders ORDER BY account_id;"
    ], {
      stdout: "pipe",
      stderr: "inherit",
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new Error(`Failed to fetch accounts (exit ${exitCode})`);
    }

    const output = await new Response(proc.stdout).text();
    // Find the JSON array in the output (starts with [ and ends with ])
    const arrayMatch = output.match(/\[[\s\S]*\]/);
    if (!arrayMatch) {
      throw new Error("Could not find JSON array in wrangler output");
    }

    const parsed = JSON.parse(arrayMatch[0]);
    const accounts: string[] = [];

    if (Array.isArray(parsed) && parsed.length > 0) {
      const results = parsed[0]?.results;
      if (Array.isArray(results)) {
        for (const row of results) {
          if (row.account_id) {
            accounts.push(row.account_id);
          }
        }
      }
    }

    return accounts;
  } catch (error: any) {
    console.error("[ERROR] Failed to fetch accounts from DB:", error.message);
    return [];
  }
}

/**
 * Write profiles to DB
 */
async function writeProfilesToDB(
  profiles: Record<string, any>,
  remote: boolean
): Promise<void> {
  if (Object.keys(profiles).length === 0) return;

  const dbName = "near-agent-db";
  const remoteFlag = remote ? "--remote" : "--local";
  const now = Math.floor(Date.now() / 1000);

  const statements: string[] = [];

  for (const [accountId, profileData] of Object.entries(profiles)) {
    const escapedId = accountId.replace(/'/g, "''");
    const profileJson = JSON.stringify(profileData).replace(/'/g, "''");

    // Extract common fields for faster queries
    const name = String(profileData?.name || "").replace(/'/g, "''");

    // Handle image field - can be string, object with url/ipfs_cid, or nested object
    let imageValue = "";
    if (typeof profileData?.image === "string") {
      imageValue = profileData.image;
    } else if (typeof profileData?.image === "object" && profileData?.image !== null) {
      imageValue = profileData.image.url || profileData.image.ipfs_cid || profileData.image.nftUrl || JSON.stringify(profileData.image);
    }

    const image = String(imageValue).replace(/'/g, "''");
    const description = String(profileData?.description || "").replace(/'/g, "''");

    statements.push(
      `INSERT OR REPLACE INTO near_social_profiles (account_id, profile_data, name, image, description, last_synced_at, synced_at) VALUES ('${escapedId}', '${profileJson}', '${name}', '${image}', '${description}', ${now}, ${now});`
    );
  }

  const sql = statements.join("\n");
  const tempFile = `/tmp/profiles_${Date.now()}.sql`;
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
 * Sync profiles
 */
async function syncProfiles(
  accounts: string[],
  state: ProfileSyncState,
  remote: boolean
): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Syncing ${accounts.length} profiles`);
  console.log(`${"=".repeat(60)}`);

  const processed = new Map<string, number>(Object.entries(state.processed));
  const failedAccounts = new Set(state.failedAccounts);

  // Filter out already processed accounts (synced within last 24 hours)
  const ONE_DAY = 24 * 60 * 60;
  const now = Math.floor(Date.now() / 1000);
  const accountsToSync = accounts.filter(account => {
    const lastSync = processed.get(account) || 0;
    return (now - lastSync) > ONE_DAY;
  });

  console.log(`[INFO] ${accountsToSync.length} accounts need syncing (${accounts.length - accountsToSync.length} recent)`);

  if (accountsToSync.length === 0) {
    console.log("[SKIP] All profiles recently synced");
    return;
  }

  let successCount = 0;
  let notFoundCount = 0;
  let errorCount = 0;
  const batchedProfiles: Record<string, any> = {};

  for (let i = 0; i < accountsToSync.length; i += CONCURRENT) {
    const chunk = accountsToSync.slice(i, Math.min(i + CONCURRENT, accountsToSync.length));
    const progress = ((i + chunk.length) / accountsToSync.length * 100).toFixed(1);

    console.log(`\n[${i + chunk.length}/${accountsToSync.length}] ${progress}% - Fetching ${chunk.length} profiles...`);

    // Fetch in parallel
    const results = await Promise.all(
      chunk.map(async (accountId) => {
        const profile = await fetchProfileRetry(accountId);
        return { accountId, profile };
      })
    );

    // Process results
    for (const { accountId, profile } of results) {
      if (profile) {
        batchedProfiles[accountId] = profile;
        processed.set(accountId, now);
        successCount++;
        console.log(`  ✓ ${accountId}: synced`);
      } else if (profile === null) {
        // Profile doesn't exist - still mark as processed
        processed.set(accountId, now);
        notFoundCount++;
        console.log(`  ○ ${accountId}: no profile`);
      } else {
        failedAccounts.add(accountId);
        errorCount++;
        console.log(`  ✗ ${accountId}: error`);
      }
    }

    // Write to DB every batch
    if (Object.keys(batchedProfiles).length >= PROFILES_PER_BATCH || (i + chunk.length) >= accountsToSync.length) {
      if (Object.keys(batchedProfiles).length > 0) {
        await writeProfilesToDB(batchedProfiles, remote);
        console.log(`  [DB] Wrote ${Object.keys(batchedProfiles).length} profiles`);
        Object.keys(batchedProfiles).forEach(key => delete batchedProfiles[key]);
      }

      // Save state
      state.processed = Object.fromEntries(processed);
      state.failedAccounts = Array.from(failedAccounts);
      saveState(state);
    }

    // Delay between batches
    if (i + chunk.length < accountsToSync.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY));
    }
  }

  console.log(`\n[DONE] ${successCount} synced, ${notFoundCount} not found, ${errorCount} errors`);

  state.completed = true;
  state.processed = Object.fromEntries(processed);
  state.failedAccounts = Array.from(failedAccounts);
  saveState(state);
}

/**
 * Load/save state
 */
function loadState(): ProfileSyncState {
  try {
    const fs = require('fs');
    if (fs.existsSync(STATE_FILE)) {
      const text = fs.readFileSync(STATE_FILE, 'utf-8');
      return JSON.parse(text);
    }
  } catch (e) {
    // File doesn't exist or is invalid, return empty state
  }
  return {
    completed: false,
    processed: {},
    failedAccounts: [],
  };
}

function saveState(state: ProfileSyncState) {
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
  const accountsIndex = args.indexOf("--accounts");
  let specifiedAccounts: string[] | undefined;

  if (accountsIndex !== -1 && args[accountsIndex + 1]) {
    specifiedAccounts = args[accountsIndex + 1].split(",").map(s => s.trim()).filter(Boolean);
  }

  console.log("=".repeat(60));
  console.log("NEAR Social Profile Sync");
  console.log("=".repeat(60));
  console.log(`Settings: ${CONCURRENT} concurrent, ${PROFILES_PER_BATCH} profiles per batch`);
  console.log(`Press Ctrl+C to pause (progress saved)\n`);

  const shutdown = (signal: string) => {
    console.log(`\n\n[!] ${signal} - Progress saved! Run again to resume.\n`);
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('Ctrl+C'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  const state = loadState();

  // Get accounts to sync
  const accounts = await getAccountsToSync(specifiedAccounts);

  if (accounts.length === 0) {
    console.log("[INFO] No accounts to sync");
    process.exit(0);
  }

  console.log(`[INFO] Found ${accounts.length} accounts to process\n`);

  await syncProfiles(accounts, state, remote);

  console.log("\n" + "=".repeat(60));
  console.log("PROFILE SYNC COMPLETE!");
  console.log("=".repeat(60));

  try {
    await Bun.$`rm ${STATE_FILE}`.quiet();
  } catch {}
}

main().catch(error => {
  console.error("\nFatal:", error);
  process.exit(1);
});
