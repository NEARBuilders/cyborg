#!/usr/bin/env bun
/**
 * Legion Graph CLI Tool
 *
 * Usage:
 *   bun run scripts/legion-graph.ts view <accountId>           - View all graph data
 *   bun run scripts/legion-graph.ts followers <accountId>       - View followers
 *   bun run scripts/legion-graph.ts following <accountId>       - View following
 *   bun run scripts/legion-graph.ts stats <accountId>           - View stats
 *   bun run scripts/legion-graph.ts check <from> <to>          - Check if following
 */

import { Graph } from "near-social-js";

const graph = new Graph({ network: "mainnet" });

/**
 * Strip network suffix from account ID
 */
function stripSuffix(accountId: string): string {
  return accountId.replace(/:(mainnet|testnet)$/, "");
}

/**
 * Format output for CLI
 */
function formatJson(data: unknown, indent = 2): string {
  return JSON.stringify(data, null, indent);
}

/**
 * View all graph data for an account
 */
async function viewGraph(accountId: string) {
  const clean = stripSuffix(accountId);
  console.log(`\n📊 Legion Graph for: ${clean}\n`);

  try {
    // Read all legion data
    const data = await graph.get({
      keys: [
        `${clean}/legion/follow/**`,
        `${clean}/index/graph/legion/**`,
      ],
    });

    console.log("Raw Data:");
    console.log(formatJson(data, 2));

    // Check index
    console.log("\n📈 Index Check (who follows this account):");
    const indexResult = await graph.index({
      action: "graph",
      key: `legion/${clean}`,
      limit: 100,
    });
    console.log(formatJson(indexResult, 2));
  } catch (error) {
    console.error("Error:", error);
  }
}

/**
 * Get followers using index
 */
async function getFollowers(accountId: string) {
  const clean = stripSuffix(accountId);
  console.log(`\n👥 Followers of: ${clean}\n`);

  try {
    const result = await graph.index({
      action: "graph",
      key: `legion/${clean}`,
      limit: 1000,
    });

    console.log(`Total: ${result.length} followers\n`);

    for (const item of result) {
      console.log(`  • ${item.key || item.accountId || "unknown"}`);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

/**
 * Get following (who this account follows)
 */
async function getFollowing(accountId: string) {
  const clean = stripSuffix(accountId);
  console.log(`\n➡️  Following for: ${clean}\n`);

  try {
    const data = await graph.get({
      keys: [`${clean}/legion/follow/**`],
    });

    const followList = data?.[clean]?.legion?.follow || {};
    const following = Object.keys(followList);

    console.log(`Total: ${following.length} following\n`);

    for (const id of following) {
      console.log(`  • ${id}`);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

/**
 * Get stats
 */
async function getStats(accountId: string) {
  const clean = stripSuffix(accountId);
  console.log(`\n📊 Stats for: ${clean}\n`);

  try {
    // Get following count
    const data = await graph.get({
      keys: [`${clean}/legion/follow/**`],
    });
    const followList = data?.[clean]?.legion?.follow || {};
    const followingCount = Object.keys(followList).length;

    // Get followers count
    const followersResult = await graph.index({
      action: "graph",
      key: `legion/${clean}`,
      limit: 1000,
    });
    const followersCount = followersResult.length;

    console.log(`  Followers:  ${followersCount}`);
    console.log(`  Following:  ${followingCount}`);
    console.log();
  } catch (error) {
    console.error("Error:", error);
  }
}

/**
 * Check if account follows another
 */
async function checkFollow(fromAccount: string, toAccount: string) {
  const from = stripSuffix(fromAccount);
  const to = stripSuffix(toAccount);
  console.log(`\n❓ Checking if ${from} follows ${to}\n`);

  try {
    const data = await graph.get({
      keys: [`${from}/legion/follow/${to}`],
    });

    const isFollowing =
      data?.[from]?.legion?.follow?.[to] !== undefined;

    console.log(
      `  ${isFollowing ? "✅ Yes" : "❌ No"}, ${from} ${
        isFollowing ? "follows" : "does not follow"
      } ${to}`
    );
    console.log();
  } catch (error) {
    console.error("Error:", error);
  }
}

// CLI handler
const command = process.argv[2];
const args = process.argv.slice(3);

switch (command) {
  case "view":
    if (!args[0]) {
      console.error("Usage: bun run scripts/legion-graph.ts view <accountId>");
      process.exit(1);
    }
    await viewGraph(args[0]);
    break;

  case "followers":
    if (!args[0]) {
      console.error("Usage: bun run scripts/legion-graph.ts followers <accountId>");
      process.exit(1);
    }
    await getFollowers(args[0]);
    break;

  case "following":
    if (!args[0]) {
      console.error("Usage: bun run scripts/legion-graph.ts following <accountId>");
      process.exit(1);
    }
    await getFollowing(args[0]);
    break;

  case "stats":
    if (!args[0]) {
      console.error("Usage: bun run scripts/legion-graph.ts stats <accountId>");
      process.exit(1);
    }
    await getStats(args[0]);
    break;

  case "check":
    if (!args[0] || !args[1]) {
      console.error("Usage: bun run scripts/legion-graph.ts check <fromAccountId> <toAccountId>");
      process.exit(1);
    }
    await checkFollow(args[0], args[1]);
    break;

  default:
    console.log(`
Legion Graph CLI Tool

Usage:
  bun run scripts/legion-graph.ts <command> [args...]

Commands:
  view <accountId>           View all graph data for an account
  followers <accountId>      List all followers
  following <accountId>      List who this account follows
  stats <accountId>          Show follower/following counts
  check <from> <to>         Check if one account follows another

Examples:
  bun run scripts/legion-graph.ts view jemartel.near
  bun run scripts/legion-graph.ts followers jemartel.near
  bun run scripts/legion-graph.ts following jemartel.near
  bun run scripts/legion-graph.ts stats jemartel.near
  bun run scripts/legion-graph.ts check jemartel.near agency.near
    `);
    process.exit(1);
}
