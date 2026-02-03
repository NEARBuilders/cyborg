/**
 * Sync nearlegion.nfts.tg NFT Holders with Image URLs
 *
 * This script fetches all NFT tokens from nearlegion.nfts.tg contract
 * and stores both holder info AND image URLs in the database.
 *
 * Usage:
 *   bun run scripts/sync-nearlegion-images.ts           # Preview changes
 *   bun run scripts/sync-nearlegion-images.ts --apply   # Apply to local DB
 *   bun run scripts/sync-nearlegion-images.ts --remote  # Apply to remote DB
 */

const RPC_ENDPOINTS = [
  "https://near.lava.build",
  "https://rpc.mainnet.near.org",
];

const CONTRACT_ID = "nearlegion.nfts.tg";

interface NEARToken {
  token_id?: string;
  owner_id?: string;
  metadata?: {
    reference?: string;
    media?: string;
    media_hash?: string;
    title?: string;
    description?: string;
    base_uri?: string;
  };
}

interface TokenWithImage {
  tokenId: string;
  ownerId: string;
  imageUrl: string | null;
  title: string | null;
}

/**
 * Fetch NFT tokens from the contract via RPC
 */
async function fetchTokenBatch(
  fromIndex: string,
  limit: number,
  rpcUrl: string
): Promise<NEARToken[]> {
  const args = JSON.stringify({ from_index: fromIndex, limit });
  const argsBase64 = Buffer.from(args).toString("base64");

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `nearlegion-sync-${fromIndex}`,
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: CONTRACT_ID,
        method_name: "nft_tokens",
        args_base64: argsBase64,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC request failed: ${response.statusText}`);
  }

  const result = await response.json();

  if (result.error) {
    throw new Error(`RPC error: ${result.error.message}`);
  }

  // Parse the byte array result
  const rawResult = result.result?.result || [];
  let parsedTokens: NEARToken[] = [];

  if (Array.isArray(rawResult) && rawResult.length > 0 && typeof rawResult[0] === 'number') {
    const buffer = Buffer.from(new Uint8Array(rawResult));
    parsedTokens = JSON.parse(buffer.toString()) as NEARToken[];
  } else if (typeof rawResult === "string" && rawResult.length > 0) {
    const buffer = Buffer.from(rawResult, "base64");
    parsedTokens = JSON.parse(buffer.toString()) as NEARToken[];
  } else if (Array.isArray(rawResult) && rawResult.length > 0) {
    parsedTokens = rawResult as NEARToken[];
  }

  return parsedTokens;
}

/**
 * Extract image URL from NFT metadata
 */
async function extractImageUrl(token: NEARToken): Promise<string | null> {
  const metadata = token.metadata;
  if (!metadata) return null;

  // Try reference field (usually points to JSON metadata on IPFS/Arweave)
  if (metadata.reference) {
    // Fetch the metadata JSON to get the actual image URL
    try {
      const response = await fetch(metadata.reference);
      if (response.ok) {
        const meta = await response.json();
        if (meta.fileName) {
          // Construct image URL from the metadata URL pattern
          // Metadata URL: https://arweave.net/.../Metadata/{token_id}.json
          // Image URL: https://arweave.net/.../Images/{fileName}
          const metadataUrl = new URL(metadata.reference);
          const baseUrl = `${metadataUrl.protocol}//${metadataUrl.host}${metadataUrl.pathname.split('/').slice(0, -1).join('/')}`;
          return `${baseUrl}/Images/${meta.fileName}`;
        }
      }
    } catch {
      // If fetch fails, return the reference URL
    }
    return metadata.reference;
  }

  // Try media field (direct image URL)
  if (metadata.media) {
    return metadata.media;
  }

  // Try base_uri + media pattern
  if (metadata.base_uri && metadata.media) {
    const baseUri = metadata.base_uri;
    const media = metadata.media.startsWith("/")
      ? metadata.media.substring(1)
      : metadata.media;
    return baseUri.endsWith("/")
      ? baseUri + media
      : baseUri + "/" + media;
  }

  return null;
}

/**
 * Fetch all NFT tokens with pagination
 */
async function fetchAllTokens(): Promise<TokenWithImage[]> {
  console.log(`[RPC] Fetching from ${CONTRACT_ID}...`);

  const allTokens: TokenWithImage[] = [];
  let fromIndex = "0";
  const batchSize = 100;
  let currentRpcUrl = RPC_ENDPOINTS[0];
  let hasMore = true;

  while (hasMore) {
    try {
      const batch = await fetchTokenBatch(fromIndex, batchSize, currentRpcUrl);

      // Extract image URLs from metadata (async now)
      const tokensWithImages: TokenWithImage[] = [];
      for (const token of batch) {
        if (token.token_id && token.owner_id) {
          const imageUrl = await extractImageUrl(token);
          tokensWithImages.push({
            tokenId: token.token_id!,
            ownerId: token.owner_id!,
            imageUrl,
            title: token.metadata?.title || null,
          });
        }
      }

      allTokens.push(...tokensWithImages);
      console.log(`[RPC] Fetched ${batch.length} tokens (${tokensWithImages.length} with images) from index ${fromIndex}`);

      // Check if we need to fetch more
      if (batch.length < batchSize) {
        hasMore = false;
      } else {
        // Use last token_id as next from_index
        const lastTokenId = batch[batch.length - 1].token_id;
        if (lastTokenId) {
          fromIndex = lastTokenId;
        } else {
          hasMore = false;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error: any) {
      const errorMsg = error?.message;

      // Try next RPC endpoint on error
      const nextRpcIndex = RPC_ENDPOINTS.indexOf(currentRpcUrl) + 1;
      if (nextRpcIndex < RPC_ENDPOINTS.length) {
        currentRpcUrl = RPC_ENDPOINTS[nextRpcIndex];
        console.log(`[RPC] Switching to endpoint: ${currentRpcUrl}`);
        continue;
      }

      throw new Error(`All RPC endpoints failed: ${errorMsg}`);
    }
  }

  console.log(`[RPC] Total tokens fetched: ${allTokens.length}`);
  return allTokens;
}

/**
 * Generate SQL to create/update legion_nft_images table and insert data
 */
function generateSQL(tokens: TokenWithImage[]): string {
  const now = Math.floor(Date.now() / 1000);
  const statements: string[] = [];

  // Create table if not exists
  statements.push(`
CREATE TABLE IF NOT EXISTS legion_nft_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  contract_id TEXT NOT NULL DEFAULT 'nearlegion.nfts.tg',
  image_url TEXT,
  title TEXT,
  last_synced_at INTEGER NOT NULL,
  synced_at INTEGER NOT NULL,
  UNIQUE(token_id, contract_id)
);
`);

  // Clear old data for this contract
  statements.push(`DELETE FROM legion_nft_images WHERE contract_id = '${CONTRACT_ID}';`);

  // Insert tokens with image URLs
  for (const token of tokens) {
    const accountId = token.ownerId.replace(/'/g, "''");
    const imageUrl = token.imageUrl?.replace(/'/g, "''") || "NULL";
    const title = token.title?.replace(/'/g, "''") || "NULL";

    statements.push(
      `INSERT INTO legion_nft_images (token_id, account_id, contract_id, image_url, title, last_synced_at, synced_at) VALUES ('${token.tokenId}', '${accountId}', '${CONTRACT_ID}', ${imageUrl === "NULL" ? "NULL" : "'" + imageUrl + "'"}, ${title === "NULL" ? "NULL" : "'" + title + "'"}, ${now}, ${now});`
    );
  }

  return statements.join("\n");
}

/**
 * Execute SQL against D1
 */
async function executeSQL(sql: string, remote: boolean): Promise<void> {
  const dbName = "near-agent-db";
  const remoteFlag = remote ? "--remote" : "--local";

  console.log(`\n[D1] Applying to ${remote ? "remote" : "local"} database...`);

  const statements = sql.split(";").filter((s) => s.trim());

  for (let i = 0; i < statements.length; i += 50) {
    const batch = statements.slice(i, i + 50).join(";\n") + ";";
    const tempFile = `/tmp/nft_images_${i}.sql`;

    await Bun.write(tempFile, batch);

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
      throw new Error(`Wrangler command failed with exit code ${exitCode}`);
    }
  }

  console.log(`[D1] Successfully synced ${statements.length} statements`);
}

/**
 * Main
 */
async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const remote = args.includes("--remote");

  console.log("=".repeat(60));
  console.log("NEAR Legion NFT Image Sync");
  console.log("Contract: nearlegion.nfts.tg");
  console.log("=".repeat(60));

  // Fetch from RPC
  const tokens = await fetchAllTokens();

  const tokensWithImages = tokens.filter((t) => t.imageUrl !== null);
  const tokensWithoutImages = tokens.length - tokensWithImages.length;

  console.log("\n[SUMMARY]");
  console.log(`  Total tokens: ${tokens.length}`);
  console.log(`  With image URLs: ${tokensWithImages.length}`);
  console.log(`  Without image URLs: ${tokensWithoutImages}`);

  if (!apply) {
    console.log("\n[PREVIEW MODE] Run with --apply to execute the changes.");
    console.log("  bun run scripts/sync-nearlegion-images.ts --apply     # Local database");
    console.log("  bun run scripts/sync-nearlegion-images.ts --apply --remote  # Remote database");
    return;
  }

  // Generate SQL
  const sql = generateSQL(tokens);

  // Execute SQL
  await executeSQL(sql, remote);

  console.log("\n✅ Sync complete!");
  console.log("\n[INFO] NFT images are now stored in legion_nft_images table");
  console.log("[INFO] You can query: SELECT * FROM legion_nft_images WHERE account_id = 'user.near'");
}

main().catch((error) => {
  console.error("\n❌ Error:", error);
  process.exit(1);
});
