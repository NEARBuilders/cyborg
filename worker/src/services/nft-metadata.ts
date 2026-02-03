/**
 * NFT Metadata Service
 * Fetches NFT token metadata including image URLs from blockchain
 */

const RPC_URL = "https://rpc.mainnet.near.org";

interface NFTToken {
  token_id: string;
  owner_id: string;
  metadata?: {
    reference?: string;
    media?: string;
    media_hash?: string;
    copies?: number;
    issued_at?: number;
    expires_at?: number;
    starts_at?: number;
    updated_at?: number;
    title?: string;
    description?: string;
  };
}

interface NFTMetadata {
  tokenId: string;
  imageUrl: string;
  title?: string;
  description?: string;
}

/**
 * Fetch NFT tokens for an account from a specific contract
 */
async function fetchNFTTokensForOwner(
  accountId: string,
  contractId: string,
  limit = 50
): Promise<NFTToken[]> {
  const args = JSON.stringify({
    account_id: accountId,
    limit,
  });
  const argsBase64 = Buffer.from(args).toString("base64");

  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `nft-${contractId}-${accountId}`,
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: contractId,
        method_name: "nft_tokens_for_owner",
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
  let tokens: NFTToken[] = [];

  if (Array.isArray(rawResult) && rawResult.length > 0 && typeof rawResult[0] === 'number') {
    const buffer = Buffer.from(new Uint8Array(rawResult));
    tokens = JSON.parse(buffer.toString()) as NFTToken[];
  } else if (typeof rawResult === "string" && rawResult.length > 0) {
    const buffer = Buffer.from(rawResult, "base64");
    tokens = JSON.parse(buffer.toString()) as NFTToken[];
  } else if (Array.isArray(rawResult)) {
    tokens = rawResult as NFTToken[];
  }

  return tokens;
}

/**
 * Extract image URL from NFT metadata
 */
function extractImageUrl(token: NFTToken): string | null {
  // Try reference field (usually points to JSON metadata)
  if (token.metadata?.reference) {
    return token.metadata.reference;
  }

  // Try media field (direct image URL)
  if (token.metadata?.media) {
    return token.metadata.media;
  }

  return null;
}

/**
 * Get complete NFT metadata with resolved image URLs
 */
export async function getNFTMetadata(
  accountId: string,
  contractId: string
): Promise<NFTMetadata[]> {
  try {
    const tokens = await fetchNFTTokensForOwner(accountId, contractId);

    const metadata: NFTMetadata[] = tokens.map((token) => {
      const imageUrl = extractImageUrl(token);

      return {
        tokenId: token.token_id,
        imageUrl: imageUrl || "",
        title: token.metadata?.title,
        description: token.metadata?.description,
      };
    });

    return metadata;
  } catch (error) {
    console.error(`[NFT METADATA] Error fetching for ${accountId}@${contractId}:`, error);
    return [];
  }
}

/**
 * Get NFT metadata for all holdings of an account
 */
export async function getAllNFTMetadata(
  accountId: string,
  holdings: Array<{ contractId: string; quantity: number }>
): Promise<Map<string, NFTMetadata[]>> {
  const metadataMap = new Map<string, NFTMetadata[]>();

  for (const holding of holdings) {
    const metadata = await getNFTMetadata(accountId, holding.contractId);
    metadataMap.set(holding.contractId, metadata);
  }

  return metadataMap;
}
