/**
 * Test script for the scheduled sync function
 * Run this locally to verify the sync works before deploying
 *
 * Usage:
 *   bun run test-sync-fn.ts
 */

import { createDatabase } from "./src/db";

async function testSync() {
  console.log("[TEST] Starting NFT sync test...\n");

  // Note: This would require D1 database bindings which aren't available locally
  // The sync function needs to be tested on the deployed worker

  console.log("[TEST] ⚠️  Cannot test locally - requires deployed D1 database\n");
  console.log("[TEST] To test the sync:\n");
  console.log("1. Deploy the worker:");
  console.log("   cd worker && bun run deploy:worker\n");
  console.log("2. Make sure you're logged in as admin:");
  console.log("   https://near-agent.pages.dev/login\n");
  console.log("3. Trigger manual sync:");
  console.log("   curl -X POST https://near-agent.pages.dev/api/admin/sync-holders \\");
  console.log("     -H 'Content-Type: application/json' \\");
  console.log("     -b 'session=your_session_cookie'\n");
  console.log("4. Check Cloudflare Dashboard for cron logs:");
  console.log("   Workers & Pages → near-agent → Logs → Scheduled Events\n");
  console.log("5. Verify D1 database was updated:");
  console.log("   Run: wrangler d1 execute near-agent-db 'SELECT COUNT(*) FROM legion_holders'\n");
}

testSync().catch(console.error);
