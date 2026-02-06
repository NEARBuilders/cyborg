/**
 * Cloudflare Worker Entry Point
 *
 * Merges functionality from:
 * - host/server.ts (auth, CORS, session handling)
 * - api/src/index.ts (oRPC handlers)
 *
 * Single Worker deployment replacing both host and API packages.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { Social } from "near-social-js";
import { eq, like, or, sql } from "drizzle-orm";
import type { Env } from "./types";
import { createAuth, getSessionFromRequest } from "./auth";
import { createDatabase } from "./db";
import * as schema from "./db/schema";
import { NearService, createAgentService } from "./services";
import { SocialService } from "./services/social";
import { LegionGraphService } from "./services/legion-graph";
import { createApiRoutes } from "./routes/api";
import { CacheService } from "./services/cache";
import { handleBuildersRequest } from "./services/builders";
import { getAscendantHolders, getHolderTypes } from "./services/holders";

// =============================================================================
// APP SETUP
//=============================================================================

const app = new Hono<{ Bindings: Env }>();

// =============================================================================
// MIDDLEWARE
//=============================================================================

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3002",
  "http://localhost:8787",
  "https://near-agent.pages.dev",
  "https://demo.near-agent.pages.dev",
];

// Allowed hosts for public API (builders, profiles)
// Also allow the worker itself when called via service binding
const ALLOWED_HOSTS = [
  "near-agent.pages.dev",
  "demo.near-agent.pages.dev",
  "mains.pages.dev",
  "near-agent.kj95hgdgnn.workers.dev",
  "localhost:3000",
  "localhost:3002",
  "localhost:8787",
];

// CORS middleware
app.use(
  "*",
  cors({
    origin: (origin) => {
      // Allow requests with no origin (e.g., mobile apps, curl)
      if (!origin) return "http://localhost:8787";
      // Allow any *.pages.dev subdomain
      if (origin.endsWith(".pages.dev")) return origin;
      // Allow explicitly listed origins
      if (ALLOWED_ORIGINS.includes(origin)) return origin;
      // Default fallback
      return origin;
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Accept", "X-Requested-With"],
    exposeHeaders: ["Content-Length", "Content-Type", "Set-Cookie"],
  })
);

// Host guard middleware for public endpoints
function createHostGuard() {
  return async (c: any, next: () => Promise<void>) => {
    const url = new URL(c.req.url);

    // Check multiple sources for the origin host:
    // 1. X-Forwarded-Host header (set by Pages proxy)
    // 2. X-Original-Host header
    // 3. originHost query parameter
    // 4. Origin header
    // 5. Referer header (extract host from URL)
    // 6. Fall back to URL hostname
    let host = c.req.header("X-Forwarded-Host")
      || c.req.header("X-Original-Host")
      || url.searchParams.get("originHost");

    if (!host) {
      const origin = c.req.header("origin");
      if (origin) {
        try {
          host = new URL(origin).host;
        } catch {
          // Invalid URL, ignore
        }
      }
    }

    if (!host) {
      const referer = c.req.header("referer");
      if (referer) {
        try {
          host = new URL(referer).host;
        } catch {
          // Invalid URL, ignore
        }
      }
    }

    if (!host) {
      host = url.hostname;
    }

    // Check if host is allowed
    const isAllowedHost = ALLOWED_HOSTS.some((allowed) => {
      if (allowed === host) return true;
      if (allowed.startsWith("localhost") && host.startsWith("localhost")) return true;
      if (allowed.includes(".pages.dev") && host.endsWith(".pages.dev")) return true;
      return false;
    });

    if (!isAllowedHost) {
      console.log(`[HOST GUARD] Blocked request from: ${host}`);
      return c.json({ error: "Forbidden - invalid host" }, 403);
    }

    await next();
  };
}

// =============================================================================
// PUBLIC HEALTH CHECKS
// =============================================================================

app.get("/health", (c) => c.text("OK"));
app.get("/ping", (c) => c.json({
  status: "ok",
  timestamp: new Date().toISOString(),
  service: "near-agent",
}));

// =============================================================================
// PUBLIC ASCENDANT HOLDERS (Database-based, no RPC on edge)
// =============================================================================

app.get("/nfts/ascendant/holders", async (c) => {
  const queryParams = c.req.query();
  const limit = queryParams.limit ? parseInt(queryParams.limit as string) : undefined;
  const offset = queryParams.offset ? parseInt(queryParams.offset as string) : undefined;

  const db = createDatabase(c.env.DB);

  try {
    const data = await getAscendantHolders({ db });

    let holders = data.holders;

    // Apply pagination if requested
    if (offset !== undefined || limit !== undefined) {
      const start = offset || 0;
      const end = limit !== undefined ? start + limit : undefined;
      holders = holders.slice(start, end);
    }

    return c.json({
      holders,
      total: data.holders.length,
      lastUpdated: data.lastUpdated,
    });
  } catch (error) {
    console.error("[API] Error fetching holders:", error);
    return c.json(
      { error: "Failed to fetch Ascendant holders" },
      500
    );
  }
});

/**
 * Get holder types for a specific account
 * Returns which Legion NFT contracts the account holds
 *
 * Example: GET /nfts/legion/holders/account.near
 *
 * Response:
 * {
 *   accountId: "account.near",
 *   isAscendant: true,
 *   isInitiate: false,
 *   isNearlegion: true,
 *   contracts: [
 *     { contractId: "ascendant.nearlegion.near", quantity: 1 },
 *     { contractId: "nearlegion.nfts.tg", quantity: 3 }
 *   ],
 *   totalTokens: 4
 * }
 */
app.get("/nfts/legion/holders/:accountId", async (c) => {
  const accountId = c.req.param("accountId");
  const db = createDatabase(c.env.DB);

  try {
    const types = await getHolderTypes(db, accountId);

    return c.json({
      accountId,
      ...types,
    });
  } catch (error) {
    console.error("[API] Error fetching holder types:", error);
    return c.json(
      { error: "Failed to fetch holder types" },
      500
    );
  }
});

// =============================================================================
// PUBLIC BUILDERS ENDPOINTS (Database-backed, no NEARBlocks API)
// =============================================================================

// Legacy route at /builders/:id (without /api prefix)
const buildersLegacyRoutes = new Hono<{ Bindings: Env }>();
buildersLegacyRoutes.use("*", createHostGuard());

buildersLegacyRoutes.get("/:id", async (c) => {
  const accountId = c.req.param("id");
  const db = createDatabase(c.env.DB);

  try {
    // Fetch profile from database
    const profile = await db.query.nearSocialProfiles.findFirst({
      where: eq(schema.nearSocialProfiles.accountId, accountId),
    });

    if (!profile) {
      return c.json({ error: "Profile not found" }, 404);
    }

    // Parse profile data JSON
    const profileData = JSON.parse(profile.profileData);

    // Check if user holds any Legion NFTs
    const holdings = await db.query.legionHolders.findMany({
      where: eq(schema.legionHolders.accountId, accountId),
    });

    return c.json({
      accountId: profile.accountId,
      profile: profileData,
      holdings: holdings.map(h => ({
        contractId: h.contractId,
        quantity: h.quantity,
      })),
      lastSyncedAt: new Date(profile.lastSyncedAt * 1000).toISOString(),
    });
  } catch (error) {
    console.error("[BUILDERS] Error fetching profile:", error);
    return c.json({ error: "Failed to fetch profile" }, 500);
  }
});

// Mount legacy routes
app.route("/builders", buildersLegacyRoutes);

// =============================================================================
// PUBLIC BUILDERS ENDPOINTS (with host guard)
// =============================================================================

const publicRoutes = new Hono<{ Bindings: Env }>();

// Apply host guard to public routes
publicRoutes.use("*", createHostGuard());

// Builders endpoints - public with host guard
// Route mounted at /api/builders, so "/" becomes the list endpoint
publicRoutes.get("/", async (c) => {
  const queryParams = c.req.query();
  const input = {
    path: queryParams.path || "collections",
    params: Object.fromEntries(
      Object.entries(queryParams).filter(([k]) => k !== "path")
    ),
    nearblocksApiKey: c.env.NEARBLOCKS_API_KEY,
    cache: new CacheService(c.env.CACHE),
  };

  const result = await handleBuildersRequest(input);

  if (result.success) {
    return c.json(result.data);
  } else {
    return c.json({ error: result.error }, result.status as 400 | 500);
  }
});

publicRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const input = {
    ...body,
    nearblocksApiKey: c.env.NEARBLOCKS_API_KEY,
    cache: new CacheService(c.env.CACHE),
  };

  const result = await handleBuildersRequest(input);

  if (result.success) {
    return c.json(result.data);
  } else {
    return c.json({ error: result.error }, result.status as 400 | 500);
  }
});

publicRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const queryParams = c.req.query();

  const input = {
    path: `collections/${id}`,
    params: queryParams as Record<string, string>,
    nearblocksApiKey: c.env.NEARBLOCKS_API_KEY,
    cache: new CacheService(c.env.CACHE),
  };

  const result = await handleBuildersRequest(input);

  if (result.success) {
    return c.json(result.data);
  } else {
    return c.json({ error: result.error }, result.status as 400 | 500);
  }
});

// =============================================================================
// BUILDERS WITH PROFILES - Single optimized endpoint
// Returns holders + cached profiles from database in one call
// =============================================================================

// Get a single builder with their cached profile
app.get("/api/builders/:accountId", async (c) => {
  try {
    const accountId = c.req.param("accountId");

    // Use D1 binding to fetch holder data
    const holderResult = await c.env.DB.prepare(
      `
      SELECT
        account_id,
        MAX(CASE WHEN contract_id = 'ascendant.nearlegion.near' THEN 1 ELSE 0 END) as is_ascendant,
        MAX(CASE WHEN contract_id = 'initiate.nearlegion.near' THEN 1 ELSE 0 END) as is_initiate,
        MAX(CASE WHEN contract_id = 'nearlegion.nfts.tg' THEN 1 ELSE 0 END) as is_nearlegion
      FROM legion_holders
      WHERE account_id = ?
      GROUP BY account_id
      `
    ).bind(accountId).first();

    // Fetch ALL holdings for this account
    const holdingsResult = await c.env.DB.prepare(
      `
      SELECT contract_id, quantity
      FROM legion_holders
      WHERE account_id = ?
      ORDER BY contract_id
      `
    ).bind(accountId).all();

    const holdings = (holdingsResult.results || []).map((h: any) => ({
      contractId: h.contract_id,
      quantity: h.quantity,
    }));

    // If not a holder, still return profile data if available
    const isAscendant = holderResult?.is_ascendant === 1;
    const isInitiate = holderResult?.is_initiate === 1;
    const isNearlegion = holderResult?.is_nearlegion === 1;

    // Fetch profile from database
    const db = createDatabase(c.env.DB);
    const profileRecord = await db.query.nearSocialProfiles.findFirst({
      where: (profile, { eq }) => eq(profile.accountId, accountId),
    });

    const parsedProfile = profileRecord?.profileData
      ? JSON.parse(profileRecord.profileData)
      : null;

    // Determine role and tags
    let role = "Member";
    let tags = ["Community Member"];

    if (isAscendant) {
      role = "Ascendant";
      tags = ["NEAR Expert", "Developer", "Community Leader"];
    } else if (isInitiate) {
      role = "Initiate";
      tags = ["Web3 Enthusiast", "NEAR Builder"];
    } else if (isNearlegion) {
      role = "Legion";
      tags = ["NEAR Builder"];
    }

    // Check if custom avatar - prioritize NFT avatar
    const defaultAvatarPattern = /^https:\/\/api\.dicebear\.com\/7\.x\/avataaars\/svg/;
    const avatarUrl = profileRecord?.nftAvatarUrl ||
      (parsedProfile?.image?.ipfs_cid
        ? `https://ipfs.near.social/ipfs/${parsedProfile.image.ipfs_cid}`
        : parsedProfile?.image?.url) ||
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${accountId}`;

    const hasCustomAvatar = avatarUrl && !defaultAvatarPattern.test(avatarUrl);

    const backgroundUrl = parsedProfile?.backgroundImage?.ipfs_cid
      ? `https://ipfs.near.social/ipfs/${parsedProfile.backgroundImage.ipfs_cid}`
      : parsedProfile?.backgroundImage?.url || null;

    return c.json({
      id: accountId,
      accountId,
      displayName: parsedProfile?.name || accountId.split(".")[0],
      avatar: avatarUrl,
      backgroundImage: backgroundUrl,
      description:
        parsedProfile?.description ||
        `A passionate builder in the NEAR ecosystem.`,
      tags: parsedProfile?.tags
        ? Object.keys(parsedProfile.tags)
        : tags,
      role,
      projects: [],
      socials: {
        github:
          parsedProfile?.linktree?.github ||
          accountId.replace(".near", "").toLowerCase(),
        twitter: parsedProfile?.linktree?.twitter,
        website: parsedProfile?.linktree?.website,
        telegram: parsedProfile?.linktree?.telegram,
      },
      isLegion: isAscendant,
      isInitiate: isInitiate,
      isNearlegion: isNearlegion,
      holdings,
      nearSocialProfile: parsedProfile,
      hasCustomProfile: hasCustomAvatar,
      hasNearSocialProfile: !!parsedProfile,
    });
  } catch (error) {
    console.error("[API] Error fetching builder:", error);
    return c.json({ error: "Failed to fetch builder", details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

app.get("/api/builders-with-profiles", async (c) => {
  try {
    const url = new URL(c.req.url);
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const limit = parseInt(url.searchParams.get("limit") || "50");

    // Use D1 binding directly for raw SQL
    const result = await c.env.DB.prepare(
      `
      SELECT
        account_id,
        MAX(CASE WHEN contract_id = 'ascendant.nearlegion.near' THEN 1 ELSE 0 END) as is_ascendant,
        MAX(CASE WHEN contract_id = 'initiate.nearlegion.near' THEN 1 ELSE 0 END) as is_initiate,
        MAX(CASE WHEN contract_id = 'nearlegion.nfts.tg' THEN 1 ELSE 0 END) as is_nearlegion
      FROM legion_holders
      GROUP BY account_id
      ORDER BY account_id
      LIMIT ? OFFSET ?
      `
    ).bind(limit, offset).all();

    // Fetch total count
    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(DISTINCT account_id) as count FROM legion_holders`
    ).first();

    const total = countResult?.count as number || 0;
    const rows = result.results || [];

    // Get all account IDs for batch profile lookup
    const accountIds = rows.map((r: any) => r.account_id);

    // Use Drizzle for profile lookup
    const db = createDatabase(c.env.DB);
    const profiles = accountIds.length > 0 ? await db.query.nearSocialProfiles.findMany({
      where: (profile, { inArray }) => inArray(profile.accountId, accountIds),
    }) : [];

    // Fetch holdings for all accounts
    const holdingsResults = accountIds.length > 0 ? await c.env.DB.prepare(
      `
      SELECT account_id, contract_id, quantity
      FROM legion_holders
      WHERE account_id IN (${accountIds.map(() => '?').join(',')})
      ORDER BY account_id, contract_id
      `
    ).bind(...accountIds).all() : { results: [] };

    // Group holdings by account_id for quick lookup
    const holdingsMap = new Map<string, Array<{ contractId: string; quantity: number }>>();
    for (const accountId of accountIds) {
      holdingsMap.set(accountId, []);
    }
    for (const h of (holdingsResults.results || [])) {
      const holdings = holdingsMap.get(h.account_id) || [];
      holdings.push({ contractId: h.contract_id, quantity: h.quantity });
      holdingsMap.set(h.account_id, holdings);
    }

    // Create a map for quick lookup
    const profileMap = new Map(
      profiles.map((p) => [
        p.accountId,
        {
          name: p.name,
          image: p.image,
          nftAvatarUrl: p.nftAvatarUrl,
          description: p.description,
          profileData: p.profileData,
        },
      ])
    );

    // Combine accounts with their profiles
    const builders = rows.map((row: any) => {
      const profile = profileMap.get(row.account_id);
      const parsedProfile = profile?.profileData
        ? JSON.parse(profile.profileData)
        : null;

      // Determine role and tags
      let role = "Member";
      let tags = ["Community Member"];

      if (row.is_ascendant) {
        role = "Ascendant";
        tags = ["NEAR Expert", "Developer", "Community Leader"];
      } else if (row.is_initiate) {
        role = "Initiate";
        tags = ["Web3 Enthusiast", "NEAR Builder"];
      } else if (row.is_nearlegion) {
        role = "Legion";
        tags = ["NEAR Builder"];
      }

      // Check if custom avatar - prioritize NFT avatar
      const defaultAvatarPattern = /^https:\/\/api\.dicebear\.com\/7\.x\/avataaars\/svg/;
      const avatarUrl = profile?.nftAvatarUrl ||
        (parsedProfile?.image?.ipfs_cid
          ? `https://ipfs.near.social/ipfs/${parsedProfile.image.ipfs_cid}`
          : parsedProfile?.image?.url) ||
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${row.account_id}`;

      const hasCustomAvatar = avatarUrl && !defaultAvatarPattern.test(avatarUrl);

      // Background image
      const backgroundUrl = parsedProfile?.backgroundImage?.ipfs_cid
        ? `https://ipfs.near.social/ipfs/${parsedProfile.backgroundImage.ipfs_cid}`
        : parsedProfile?.backgroundImage?.url || null;

      return {
        id: row.account_id,
        accountId: row.account_id,
        displayName: parsedProfile?.name || row.account_id.split(".")[0],
        avatar: avatarUrl,
        backgroundImage: backgroundUrl,
        description:
          parsedProfile?.description ||
          `A passionate builder in the NEAR ecosystem.`,
        tags: parsedProfile?.tags
          ? Object.keys(parsedProfile.tags)
          : tags,
        role,
        projects: [],
        socials: {
          github:
            parsedProfile?.linktree?.github ||
            row.account_id.replace(".near", "").toLowerCase(),
          twitter: parsedProfile?.linktree?.twitter,
          website: parsedProfile?.linktree?.website,
          telegram: parsedProfile?.linktree?.telegram,
        },
        isLegion: row.is_ascendant,
        isInitiate: row.is_initiate,
        isNearlegion: row.is_nearlegion,
        holdings: holdingsMap.get(row.account_id) || [],
        nearSocialProfile: parsedProfile,
        hasCustomProfile: hasCustomAvatar,
        hasNearSocialProfile: !!parsedProfile,
      };
    });

    return c.json({
      builders,
      total,
      offset,
      limit,
      hasMore: offset + builders.length < total,
    });
  } catch (error) {
    console.error("[API] Error fetching builders with profiles:", error);
    return c.json({ error: "Failed to fetch builders", details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// =============================================================================
// NFT METADATA ENDPOINT - Fetch NFT images for Legion holdings
// =============================================================================

app.get("/api/nfts/:accountId", async (c) => {
  try {
    const accountId = c.req.param("accountId");
    const db = createDatabase(c.env.DB);

    // Get holdings for this account
    const holdings = await db.query.legionHolders.findMany({
      where: (h, { eq }) => eq(h.accountId, accountId),
    });

    if (holdings.length === 0) {
      return c.json({ holdings: [] });
    }

    // Fetch NFT tokens for each contract
    const holdingsWithTokens = await Promise.all(
      holdings.map(async (holding) => {
        try {
          const tokens = await fetchNFTTokensForAccount(accountId, holding.contractId);
          return {
            contractId: holding.contractId,
            quantity: holding.quantity,
            tokens: tokens.map((token) => ({
              tokenId: token.token_id,
              imageUrl: extractImageUrl(token.metadata),
              title: token.metadata?.title,
              description: token.metadata?.description,
            })),
          };
        } catch (error) {
          console.error(`[NFT] Error fetching tokens for ${holding.contractId}:`, error);
          return {
            contractId: holding.contractId,
            quantity: holding.quantity,
            tokens: [],
            error: "Failed to fetch tokens",
          };
        }
      })
    );

    return c.json({ holdings: holdingsWithTokens });
  } catch (error) {
    console.error("[NFT] Error:", error);
    return c.json({ error: "Failed to fetch NFT metadata" }, 500);
  }
});

/**
 * Fetch NFT tokens for an account from a specific contract
 */
async function fetchNFTTokensForAccount(
  accountId: string,
  contractId: string,
  limit = 50
): Promise<Array<{ token_id: string; metadata?: any }>> {
  const args = JSON.stringify({
    account_id: accountId,
    limit,
  });
  const argsBase64 = Buffer.from(args).toString("base64");

  const response = await fetch("https://rpc.mainnet.near.org", {
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
  let tokens: any[] = [];

  if (Array.isArray(rawResult) && rawResult.length > 0 && typeof rawResult[0] === 'number') {
    const buffer = Buffer.from(new Uint8Array(rawResult));
    tokens = JSON.parse(buffer.toString());
  } else if (typeof rawResult === "string" && rawResult.length > 0) {
    const buffer = Buffer.from(rawResult, "base64");
    tokens = JSON.parse(buffer.toString());
  } else if (Array.isArray(rawResult)) {
    tokens = rawResult;
  }

  return tokens;
}

/**
 * Extract image URL from NFT metadata
 */
async function extractImageUrl(token: any): Promise<string | null> {
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
          // Remove both filename and 'Metadata' folder to get to root
          const pathParts = metadataUrl.pathname.split('/');
          pathParts.pop(); // Remove filename
          if (pathParts[pathParts.length - 1] === 'Metadata') {
            pathParts.pop(); // Remove 'Metadata' folder
          }
          const baseUrl = `${metadataUrl.protocol}//${metadataUrl.host}${pathParts.join('/')}`;
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

// =============================================================================
// NFT IMAGES ENDPOINT - Get cached NFT images for Legion holders
// Auto-fetches on-demand if not cached
// =============================================================================

app.get("/api/nfts/images/:accountId", async (c) => {
  try {
    const accountId = c.req.param("accountId");
    const db = createDatabase(c.env.DB);

    // Fetch NFT images from database
    let nftImages = await db.query.legionNftImages.findMany({
      where: (img, { eq }) => eq(img.accountId, accountId),
    });

    // If no images found, fetch them on-demand from blockchain
    if (nftImages.length === 0) {
      console.log(`[NFT IMAGES] No cached images for ${accountId}, fetching on-demand...`);

      // Fetch NFT tokens for this account
      const tokens = await fetchNFTTokensForAccount(accountId, "nearlegion.nfts.tg");

      if (tokens.length > 0) {
        // Extract image URLs and insert into database
        const now = Math.floor(Date.now() / 1000);

        for (const token of tokens) {
          const imageUrl = await extractImageUrl(token);
          const tokenId = token.token_id || "";
          const title = token.metadata?.title || null;

          // Insert into database
          await db.insert(schema.legionNftImages)
            .values({
              tokenId,
              accountId,
              contractId: "nearlegion.nfts.tg",
              imageUrl,
              title,
              lastSyncedAt: now,
              syncedAt: now,
            })
            .onConflictDoNothing();
        }

        // Fetch again to get the inserted records
        nftImages = await db.query.legionNftImages.findMany({
          where: (img, { eq }) => eq(img.accountId, accountId),
        });

        console.log(`[NFT IMAGES] Fetched and cached ${nftImages.length} NFT images for ${accountId}`);
      }
    }

    // Group by contract
    const byContract: Record<string, typeof nftImages> = {};
    for (const img of nftImages) {
      if (!byContract[img.contractId]) {
        byContract[img.contractId] = [];
      }
      byContract[img.contractId].push(img);
    }

    return c.json({
      accountId,
      images: Object.entries(byContract).map(([contractId, images]) => ({
        contractId,
        tokens: images.map((img) => ({
          tokenId: img.tokenId,
          imageUrl: img.imageUrl,
          title: img.title,
        })),
      })),
    });
  } catch (error) {
    console.error("[NFT IMAGES] Error:", error);
    return c.json({ error: "Failed to fetch NFT images" }, 500);
  }
});

// Mount public routes
app.route("/api/builders", publicRoutes);

// =============================================================================
// PUBLIC PROFILES ENDPOINTS (with host guard)
// =============================================================================

const profilesRoutes = new Hono<{ Bindings: Env }>();
profilesRoutes.use("*", createHostGuard());

// Initialize NEAR Social client
// Uses default api.near.social server for fetching from social.near contract
const social = new Social({
  network: "mainnet",
});

// Batch fetch with POST body
profilesRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const accountIds = body.ids?.split(",").filter(Boolean) || [];

  if (accountIds.length === 0) {
    return c.json({});
  }

  const cache = new CacheService(c.env.CACHE);

  // Try to get from KV cache first
  const cachedProfiles = await cache.getProfiles(accountIds);
  const uncachedIds = accountIds.filter((id: string) => !cachedProfiles.has(id));

  // Fetch only uncached profiles using near-social-js
  const fetchedProfiles: Record<string, any> = {};

  if (uncachedIds.length > 0) {
    await Promise.all(
      uncachedIds.map(async (accountId: string) => {
        try {
          const profile = await social.getProfile(accountId);
          if (profile) {
            fetchedProfiles[accountId] = profile;
          }
        } catch (e) {
          console.error(`[API] Error fetching profile for ${accountId}:`, e);
        }
      })
    );

    // Cache fetched profiles
    await cache.setProfiles(fetchedProfiles);
  }

  // Merge cached and fetched profiles
  // Convert Map to plain object for spreading
  const cachedProfilesObj = Object.fromEntries(cachedProfiles.entries());
  const allProfiles = { ...cachedProfilesObj, ...fetchedProfiles };

  return c.json(allProfiles);
});

// Also keep GET for backwards compatibility
profilesRoutes.get("/", async (c) => {
  const url = new URL(c.req.url);
  console.log(`[PROFILES] Full URL: ${c.req.url}`);
  console.log(`[PROFILES] Search: ${url.search}`);
  console.log(`[PROFILES] ids param: ${url.searchParams.get("ids")}`);
  const idsParam = url.searchParams.get("ids");
  const accountIds = idsParam?.split(",").filter(Boolean) || [];
  console.log(`[PROFILES] Account IDs:`, accountIds);

  if (accountIds.length === 0) {
    return c.json({});
  }

  const cache = new CacheService(c.env.CACHE);

  // Try to get from KV cache first
  const cachedProfiles = await cache.getProfiles(accountIds);
  const uncachedIds = accountIds.filter((id: string) => !cachedProfiles.has(id));

  // Fetch only uncached profiles using near-social-js
  const fetchedProfiles: Record<string, any> = {};

  if (uncachedIds.length > 0) {
    await Promise.all(
      uncachedIds.map(async (accountId: string) => {
        try {
          const profile = await social.getProfile(accountId);
          if (profile) {
            fetchedProfiles[accountId] = profile;
          }
        } catch (e) {
          console.error(`[API] Error fetching profile for ${accountId}:`, e);
        }
      })
    );

    // Cache fetched profiles
    await cache.setProfiles(fetchedProfiles);
  }

  // Merge cached and fetched profiles
  // Convert Map to plain object for spreading
  const cachedProfilesObj = Object.fromEntries(cachedProfiles.entries());
  const allProfiles = { ...cachedProfilesObj, ...fetchedProfiles };

  return c.json(allProfiles);
});

// Search profiles by account ID or name (for real-time search)
profilesRoutes.get("/search", async (c) => {
  const url = new URL(c.req.url);
  const query = url.searchParams.get("q")?.trim().toLowerCase();

  if (!query || query.length < 2) {
    return c.json([]);
  }

  // Validate query to prevent injection - only allow safe characters
  const validatedQuery = query.replace(/[^a-z0-9._@-]/g, "");
  if (validatedQuery.length === 0) {
    return c.json([]);
  }

  try {
    const db = createDatabase(c.env.DB);

    // Search for partial matches on account_id or name
    // Limit results to 20 to prevent overwhelming responses
    const results = await db
      .select({
        accountId: schema.nearSocialProfiles.accountId,
        profileData: schema.nearSocialProfiles.profileData,
        name: schema.nearSocialProfiles.name,
        image: schema.nearSocialProfiles.image,
        nftAvatarUrl: schema.nearSocialProfiles.nftAvatarUrl,
        description: schema.nearSocialProfiles.description,
      })
      .from(schema.nearSocialProfiles)
      .where(
        or(
          like(schema.nearSocialProfiles.accountId, `%${validatedQuery}%`),
          like(schema.nearSocialProfiles.name, `%${validatedQuery}%`)
        )
      )
      .limit(20);

    // Return profiles as a flat array keyed by accountId
    const profiles: Record<string, any> = {};
    for (const result of results) {
      if (result.accountId && result.profileData) {
        try {
          const parsedData = JSON.parse(result.profileData);
          // Include nftAvatarUrl in the response
          profiles[result.accountId] = {
            ...parsedData,
            nftAvatarUrl: result.nftAvatarUrl
          };
        } catch {
          // If JSON parse fails, construct minimal profile
          profiles[result.accountId] = {
            name: result.name || result.accountId,
            image: result.image,
            nftAvatarUrl: result.nftAvatarUrl,
            description: result.description,
          };
        }
      }
    }

    return c.json(profiles);
  } catch (error) {
    console.error("[PROFILES] Search error:", error);
    return c.json({}, 500);
  }
});

profilesRoutes.get("/:accountId", async (c) => {
  const accountId = c.req.param("accountId");
  const cache = new CacheService(c.env.CACHE);

  // Try KV cache first
  const cached = await cache.getProfile(accountId);
  if (cached) {
    console.log(`[KV CACHE HIT] Profile for: ${accountId}`);
    return c.json(cached);
  }

  // Fetch from NEAR Social smart contract
  try {
    const profile = await social.getProfile(accountId);

    if (!profile) {
      return c.json(null, 404);
    }

    // Cache in KV
    await cache.setProfile(accountId, profile);

    return c.json(profile);
  } catch (e) {
    console.error(`[API] Error fetching profile for ${accountId}:`, e);
    return c.json(null, 500);
  }
});

// Mount profiles routes
app.route("/api/profiles", profilesRoutes);

// =============================================================================
// AUTH ROUTES
// =============================================================================

// Better Auth handler - handle all /api/auth/* requests
app.all("/api/auth/*", async (c) => {
  const url = new URL(c.req.url);
  const method = c.req.method;

  console.log(`[Auth] ${method} ${url.pathname}`);
  console.log(`[Auth] Origin: ${c.req.header("origin")}`);
  console.log(`[Auth] Cookie header: ${c.req.header("cookie") || "none"}`);

  try {
    const auth = createAuth(c.env);

    const response = await auth.handler(c.req.raw);

    if (!response) {
      console.error("[Auth] No response from handler");
      return c.json({ error: "No response from auth handler" }, 500);
    }

    console.log(`[Auth] Response status: ${response.status}`);

    // Log Set-Cookie headers
    const setCookies = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() || response.headers.get("set-cookie") || [];
    console.log(`[Auth] Set-Cookie headers:`, setCookies);

    // Log response body for non-success responses
    if (response.status >= 400) {
      const cloned = response.clone();
      try {
        const text = await cloned.text();
        console.error("[Auth] Error body:", text);
      } catch (e) {
        console.error("[Auth] Could not read error body");
      }
    }

    return response;
  } catch (error: any) {
    console.error("[Auth] Error:", error?.message || error);
    return c.json({ error: "Auth error", message: error?.message || String(error) }, 500);
  }
});

// Also handle /auth/* for backwards compatibility
app.all("/auth/*", async (c) => {
  const auth = createAuth(c.env);
  const response = await auth.handler(c.req.raw);
  return response;
});

// =============================================================================
// PUBLIC PROFILE UPSERT ENDPOINT (with host guard)
// Saves NEAR Social profiles to database to keep data fresh
// =============================================================================

const profileUpsertRoutes = new Hono<{ Bindings: Env }>();
profileUpsertRoutes.use("*", createHostGuard());

profileUpsertRoutes.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const { accountId, profileData } = body;

    if (!accountId || !profileData) {
      return c.json({ error: "Missing accountId or profileData" }, 400);
    }

    // Validate accountId - only allow safe characters
    const validatedAccountId = String(accountId)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9._-]/g, ""); // Only allow alphanumeric, dots, hyphens, underscores

    if (validatedAccountId.length === 0 || validatedAccountId.length > 100) {
      return c.json({ error: "Invalid accountId format" }, 400);
    }

    const db = createDatabase(c.env.DB);
    const now = Math.floor(Date.now() / 1000);

    // Extract common fields for faster queries
    const name = String(profileData?.name || "").substring(0, 200); // Limit name length
    const imageValue = profileData?.image;
    let image = "";
    if (typeof imageValue === "string") {
      image = imageValue.substring(0, 500); // Limit URL length
    } else if (imageValue && typeof imageValue === "object") {
      image = (imageValue.url || imageValue.ipfs_cid || "").substring(0, 500);
    }
    const description = String(profileData?.description || "").substring(0, 2000); // Limit description

    // Upsert profile to database
    await db.insert(schema.nearSocialProfiles)
      .values({
        accountId: validatedAccountId,
        profileData: JSON.stringify(profileData),
        name,
        image,
        description,
        lastSyncedAt: now,
        syncedAt: now,
      })
      .onConflictDoUpdate({
        target: [schema.nearSocialProfiles.accountId],
        set: {
          profileData: JSON.stringify(profileData),
          name,
          image,
          description,
          lastSyncedAt: now,
          syncedAt: now,
        },
      });

    return c.json({ success: true, accountId: validatedAccountId });
  } catch (error) {
    console.error("[API] Error upserting profile:", error);
    return c.json({ error: "Failed to save profile" }, 500);
  }
});

app.route("/api/profiles/upsert", profileUpsertRoutes);

// =============================================================================
// AUTHENTICATED API ROUTES
// =============================================================================

// Non-streaming chat endpoint
app.post("/api/chat", async (c) => {
  const env = c.env;

  // Initialize database first
  const db = createDatabase(env.DB);

  // Initialize auth and get session (pass db to query account table)
  const auth = createAuth(env);
  const sessionContext = await getSessionFromRequest(auth, c.req.raw, db);

  if (!sessionContext?.nearAccountId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  // Initialize services
  const nearService = new NearService(db, {
    rpcUrl: env.NEAR_RPC_URL,
    contractId: env.NEAR_LEGION_CONTRACT,
    initiateContractId: env.NEAR_INITIATE_CONTRACT,
  });

  const agentService = createAgentService(
    db,
    {
      apiKey: env.NEAR_AI_API_KEY,
      baseUrl: env.NEAR_AI_BASE_URL,
      model: env.NEAR_AI_MODEL,
    },
    nearService
  );

  if (!agentService) {
    return c.json({ error: "NEAR AI not connected" }, 503);
  }

  const body = await c.req.json();
  const result = await agentService.processMessage(
    sessionContext.nearAccountId,
    body.message,
    body.conversationId
  );
  return c.json(result);
});

// Streaming chat endpoint
app.post("/api/chat/stream", async (c) => {
  const env = c.env;

  // Initialize database first
  const db = createDatabase(env.DB);

  // Initialize auth and get session (pass db to query account table)
  const auth = createAuth(env);
  const sessionContext = await getSessionFromRequest(auth, c.req.raw, db);

  if (!sessionContext?.nearAccountId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  // Initialize services
  const nearService = new NearService(db, {
    rpcUrl: env.NEAR_RPC_URL,
    contractId: env.NEAR_LEGION_CONTRACT,
    initiateContractId: env.NEAR_INITIATE_CONTRACT,
  });

  const agentService = createAgentService(
    db,
    {
      apiKey: env.NEAR_AI_API_KEY,
      baseUrl: env.NEAR_AI_BASE_URL,
      model: env.NEAR_AI_MODEL,
    },
    nearService
  );

  if (!agentService) {
    return c.json({ error: "NEAR AI not connected" }, 503);
  }

  const body = await c.req.json();

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        const generator = agentService.processMessageStream(
          sessionContext.nearAccountId,
          body.message,
          body.conversationId
        );

        for await (const event of generator) {
          const sseData = `event: ${event.type}\nid: ${event.id}\ndata: ${JSON.stringify(event.data)}\n\n`;
          controller.enqueue(encoder.encode(sseData));
        }
      } catch (error) {
        console.error("[API] Stream error:", error);
        const errorEvent = `event: error\ndata: ${JSON.stringify({ message: "Stream failed", details: error instanceof Error ? error.message : String(error) })}\n\n`;
        controller.enqueue(encoder.encode(errorEvent));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

// =============================================================================
// SOCIAL GRAPH (Follow/Follower System)
// =============================================================================

// Helper function to initialize services for social routes
async function getSocialContext(c: any, env: Env) {
  // Initialize database first
  const db = createDatabase(env.DB);

  // Initialize auth and get session (pass db to query account table)
  const auth = createAuth(env);
  const sessionContext = await getSessionFromRequest(auth, c.req.raw, db);

  // Initialize social service
  const socialService = new SocialService(db, "mainnet");

  return {
    db,
    socialService,
    nearAccountId: sessionContext?.nearAccountId,
    role: sessionContext?.role,
  };
}

// Follow user
app.post("/api/social/follow", async (c) => {
  const ctx = await getSocialContext(c, c.env);

  if (!ctx.nearAccountId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const body = await c.req.json();
    const { targetAccountId } = body;

    if (!targetAccountId || typeof targetAccountId !== "string") {
      return c.json({ error: "targetAccountId is required" }, 400);
    }

    const result = await ctx.socialService.prepareFollowTransaction(
      ctx.nearAccountId,
      targetAccountId
    );

    if (!result.success) {
      return c.json({ error: result.error || "Failed to prepare transaction" }, 500);
    }

    return c.json({
      success: true,
      transaction: result.transaction,
    });
  } catch (error) {
    console.error("[API] Follow error:", error);
    return c.json({ error: "Failed to prepare follow transaction" }, 500);
  }
});

// Unfollow user
app.post("/api/social/unfollow", async (c) => {
  const ctx = await getSocialContext(c, c.env);

  if (!ctx.nearAccountId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const body = await c.req.json();
    const { targetAccountId } = body;

    if (!targetAccountId || typeof targetAccountId !== "string") {
      return c.json({ error: "targetAccountId is required" }, 400);
    }

    const result = await ctx.socialService.prepareUnfollowTransaction(
      ctx.nearAccountId,
      targetAccountId
    );

    if (!result.success) {
      return c.json({ error: result.error || "Failed to prepare transaction" }, 500);
    }

    return c.json({
      success: true,
      transaction: result.transaction,
    });
  } catch (error) {
    console.error("[API] Unfollow error:", error);
    return c.json({ error: "Failed to prepare unfollow transaction" }, 500);
  }
});

// Get followers list
app.get("/api/social/followers/:accountId", async (c) => {
  const accountId = c.req.param("accountId");
  if (!accountId) {
    return c.json({ error: "accountId is required" }, 400);
  }

  const limit = Math.min(Number(c.req.query("limit") || "50"), 100);
  const offset = Number(c.req.query("offset") || "0");

  const ctx = await getSocialContext(c, c.env);

  try {
    const result = await ctx.socialService.getFollowers(accountId, limit, offset);

    return c.json({
      followers: result.items,
      total: result.total,
      pagination: {
        limit,
        offset,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    console.error("[API] Get followers error:", error);
    return c.json({ error: "Failed to fetch followers" }, 500);
  }
});

// Get following list
app.get("/api/social/following/:accountId", async (c) => {
  const accountId = c.req.param("accountId");
  if (!accountId) {
    return c.json({ error: "accountId is required" }, 400);
  }

  const limit = Math.min(Number(c.req.query("limit") || "50"), 100);
  const offset = Number(c.req.query("offset") || "0");

  const ctx = await getSocialContext(c, c.env);

  try {
    const result = await ctx.socialService.getFollowing(accountId, limit, offset);

    return c.json({
      following: result.items,
      total: result.total,
      pagination: {
        limit,
        offset,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    console.error("[API] Get following error:", error);
    return c.json({ error: "Failed to fetch following" }, 500);
  }
});

// Check if following
app.get("/api/social/following/:accountId/check/:targetAccountId", async (c) => {
  const accountId = c.req.param("accountId");
  const targetAccountId = c.req.param("targetAccountId");

  if (!accountId || !targetAccountId) {
    return c.json({ error: "accountId and targetAccountId are required" }, 400);
  }

  const ctx = await getSocialContext(c, c.env);

  try {
    const isFollowing = await ctx.socialService.isFollowing(accountId, targetAccountId);
    return c.json({ isFollowing });
  } catch (error) {
    console.error("[API] Check following error:", error);
    return c.json({ error: "Failed to check follow status" }, 500);
  }
});

// =============================================================================
// DEBUG: View raw social graph data from social.near
// =============================================================================

app.get("/api/debug/social-graph/:accountId", async (c) => {
  const accountId = c.req.param("accountId");

  if (!accountId) {
    return c.json({ error: "accountId is required" }, 400);
  }

  try {
    const { Social } = await import("near-social-js");
    const social = new Social({ network: "mainnet" });

    // Get all graph data for this account
    const data = await social.get({
      keys: [
        `${accountId}/graph/follow/**`,  // who they follow
      ],
    });

    const followList = data?.[accountId]?.graph?.follow || {};

    return c.json({
      accountId,
      following: Object.keys(followList),
      followingDetails: followList,
      count: Object.keys(followList).length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Debug] Error fetching social graph:", error);
    return c.json({ error: "Failed to fetch social graph" }, 500);
  }
});

// =============================================================================
// LEGION GRAPH (Follow/Follower System exclusive to Legion NFT holders)
// =============================================================================

// Helper function to initialize services for legion routes
async function getLegionContext(c: any, env: Env) {
  // Initialize database first
  const db = createDatabase(env.DB);

  // Initialize auth and get session (pass db to query account table)
  const auth = createAuth(env);
  const sessionContext = await getSessionFromRequest(auth, c.req.raw, db);

  // Initialize legion graph service
  const legionService = new LegionGraphService(db, "mainnet");

  return {
    db,
    legionService,
    nearAccountId: sessionContext?.nearAccountId,
    role: sessionContext?.role,
  };
}

// Follow in Legion graph
app.post("/api/legion/follow", async (c) => {
  const ctx = await getLegionContext(c, c.env);

  if (!ctx.nearAccountId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const body = await c.req.json();
    const { targetAccountId } = body;

    if (!targetAccountId || typeof targetAccountId !== "string") {
      return c.json({ error: "targetAccountId is required" }, 400);
    }

    // Validate account IDs (must contain "." to be valid NEAR address)
    if (!ctx.nearAccountId.includes(".")) {
      console.error("[API] Invalid nearAccountId from session:", ctx.nearAccountId);
      return c.json({ error: "Invalid account ID from session" }, 400);
    }

    if (!targetAccountId.includes(".")) {
      console.error("[API] Invalid targetAccountId:", targetAccountId);
      return c.json({ error: "Invalid target account ID" }, 400);
    }

    console.log("[API] Legion follow request:", {
      from: ctx.nearAccountId,
      to: targetAccountId,
    });

    const result = await ctx.legionService.prepareFollowTransaction(
      ctx.nearAccountId,
      targetAccountId
    );

    if (!result.success) {
      return c.json({ error: result.error || "Failed to prepare transaction" }, 400);
    }

    return c.json({
      success: true,
      transaction: result.transaction,
    });
  } catch (error) {
    console.error("[API] Legion follow error:", error);
    return c.json({ error: "Failed to prepare follow transaction" }, 500);
  }
});

// Unfollow in Legion graph
app.post("/api/legion/unfollow", async (c) => {
  const ctx = await getLegionContext(c, c.env);

  if (!ctx.nearAccountId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const body = await c.req.json();
    const { targetAccountId } = body;

    if (!targetAccountId || typeof targetAccountId !== "string") {
      return c.json({ error: "targetAccountId is required" }, 400);
    }

    const result = await ctx.legionService.prepareUnfollowTransaction(
      ctx.nearAccountId,
      targetAccountId
    );

    if (!result.success) {
      return c.json({ error: result.error || "Failed to prepare transaction" }, 500);
    }

    return c.json({
      success: true,
      transaction: result.transaction,
    });
  } catch (error) {
    console.error("[API] Legion unfollow error:", error);
    return c.json({ error: "Failed to prepare unfollow transaction" }, 500);
  }
});

// Get Legion followers
app.get("/api/legion/followers/:accountId", async (c) => {
  const accountId = c.req.param("accountId");

  if (!accountId) {
    return c.json({ error: "accountId is required" }, 400);
  }

  const limit = Math.min(Number(c.req.query("limit") || "50"), 100);
  const offset = Number(c.req.query("offset") || "0");

  const ctx = await getLegionContext(c, c.env);

  try {
    const result = await ctx.legionService.getFollowers(accountId, limit, offset);

    return c.json({
      followers: result.items,
      total: result.total,
      pagination: {
        limit,
        offset,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    console.error("[API] Get legion followers error:", error);
    return c.json({ error: "Failed to fetch followers" }, 500);
  }
});

// Get Legion following
app.get("/api/legion/following/:accountId", async (c) => {
  const accountId = c.req.param("accountId");

  if (!accountId) {
    return c.json({ error: "accountId is required" }, 400);
  }

  const limit = Math.min(Number(c.req.query("limit") || "50"), 100);
  const offset = Number(c.req.query("offset") || "0");

  const ctx = await getLegionContext(c, c.env);

  try {
    const result = await ctx.legionService.getFollowing(accountId, limit, offset);

    return c.json({
      following: result.items,
      total: result.total,
      pagination: {
        limit,
        offset,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    console.error("[API] Get legion following error:", error);
    return c.json({ error: "Failed to fetch following" }, 500);
  }
});

// Check if following in Legion graph
app.get("/api/legion/following/:accountId/check/:targetAccountId", async (c) => {
  const accountId = c.req.param("accountId");
  const targetAccountId = c.req.param("targetAccountId");

  if (!accountId || !targetAccountId) {
    return c.json({ error: "accountId and targetAccountId are required" }, 400);
  }

  const ctx = await getLegionContext(c, c.env);

  try {
    const isFollowing = await ctx.legionService.isFollowing(accountId, targetAccountId);
    return c.json({ isFollowing });
  } catch (error) {
    console.error("[API] Check legion following error:", error);
    return c.json({ error: "Failed to check follow status" }, 500);
  }
});

// Get Legion stats
app.get("/api/legion/stats/:accountId", async (c) => {
  const accountId = c.req.param("accountId");

  if (!accountId) {
    return c.json({ error: "accountId is required" }, 400);
  }

  const ctx = await getLegionContext(c, c.env);

  try {
    const stats = await ctx.legionService.getStats(accountId);
    return c.json(stats);
  } catch (error) {
    console.error("[API] Get legion stats error:", error);
    return c.json({ error: "Failed to fetch legion stats" }, 500);
  }
});

// =============================================================================
// STATIC ASSETS (serve UI from same domain as auth)
// =============================================================================

// Serve static assets from the ASSETS binding
app.get("*", async (c) => {
  const url = new URL(c.req.url);
  const pathname = url.pathname;

  // Try to fetch from assets first
  try {
    const assetResponse = await c.env.ASSETS.fetch(
      new Request(pathname, c.req.raw)
    );

    // If asset exists, return it
    if (assetResponse.status === 200) {
      return assetResponse;
    }
  } catch (e) {
    // Asset not found, fall through to index.html for SPA
  }

  // For SPA routing, return index.html for non-API routes
  try {
    const indexResponse = await c.env.ASSETS.fetch(new Request("/index.html", c.req.raw));
    return indexResponse;
  } catch (e) {
    return c.text("Not Found", 404);
  }
});

// =============================================================================
// EXPORT
// =============================================================================

export default app;
