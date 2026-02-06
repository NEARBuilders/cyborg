/**
 * API Routes for Cloudflare Worker
 *
 * Implements oRPC-style handlers merged from api/src/index.ts
 * Using plain Hono handlers since we're not using every-plugin in Workers
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, count, desc } from "drizzle-orm";
import type { Database } from "../db";
import * as schema from "../db/schema";
import type { AgentService } from "../services/agent";
import type { NearService } from "../services/near";
import type { SocialService } from "../services/social";

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const KeySchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[a-zA-Z0-9_\-\.]+$/, "Key must be alphanumeric with _ - .");

const ChatInputSchema = z.object({
  message: z.string().min(1).max(10000),
  conversationId: z.string().optional(),
});

const GetConversationInputSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// =============================================================================
// CONTEXT TYPE
// =============================================================================

interface ApiContext {
  db: Database;
  agentService: AgentService | null;
  nearService: NearService | null;
  socialService: SocialService | null;
  nearAccountId?: string;
  role?: string;
}

// =============================================================================
// ROUTE FACTORY
// =============================================================================

export function createApiRoutes(getContext: () => ApiContext) {
  const api = new Hono();

  // ===========================================================================
  // HEALTH
  // ===========================================================================

  api.get("/ping", (c) => {
    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  });

  api.get("/protected", (c) => {
    const ctx = getContext();
    if (!ctx.nearAccountId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    return c.json({
      message: "This is a protected endpoint",
      accountId: ctx.nearAccountId,
      timestamp: new Date().toISOString(),
    });
  });

  // ===========================================================================
  // ADMIN
  // ===========================================================================

  api.get("/admin/stats", async (c) => {
    const ctx = getContext();
    if (!ctx.nearAccountId) {
      return c.json({ error: "Authentication required" }, 401);
    }
    if (ctx.role !== "admin") {
      return c.json({ error: "Admin role required" }, 403);
    }

    const [conversationCount] = await ctx.db
      .select({ value: count() })
      .from(schema.conversation);

    const [messageCount] = await ctx.db
      .select({ value: count() })
      .from(schema.message);

    const [kvCount] = await ctx.db
      .select({ value: count() })
      .from(schema.kvStore);

    return c.json({
      conversations: conversationCount?.value ?? 0,
      messages: messageCount?.value ?? 0,
      kvEntries: kvCount?.value ?? 0,
    });
  });

  // ===========================================================================
  // USER
  // ===========================================================================

  api.get("/user/rank/:accountId", async (c) => {
    const ctx = getContext();
    if (!ctx.nearAccountId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const accountId = c.req.param("accountId");

    if (!ctx.nearService) {
      return c.json({
        rank: null,
        tokenId: null,
        hasNft: false,
        hasInitiate: false,
      });
    }

    try {
      const [hasInitiate, rankData] = await Promise.all([
        ctx.nearService.hasInitiateToken(accountId),
        ctx.nearService.getUserRank(accountId),
      ]);

      return c.json({
        rank: rankData?.rank ?? null,
        tokenId: rankData?.tokenId ?? null,
        hasNft: rankData !== null,
        hasInitiate,
      });
    } catch (error) {
      console.error("[API] Error fetching user rank:", error);
      return c.json({
        rank: null,
        tokenId: null,
        hasNft: false,
        hasInitiate: false,
      });
    }
  });

  // ===========================================================================
  // KEY VALUE
  // ===========================================================================

  api.get("/kv/:key", async (c) => {
    const ctx = getContext();
    if (!ctx.nearAccountId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const key = c.req.param("key");
    const validation = KeySchema.safeParse(key);
    if (!validation.success) {
      return c.json({ error: validation.error.message }, 400);
    }

    const entry = await ctx.db.query.kvStore.findFirst({
      where: and(
        eq(schema.kvStore.key, key),
        eq(schema.kvStore.nearAccountId, ctx.nearAccountId)
      ),
    });

    if (!entry) {
      return c.json({ error: "Key not found" }, 404);
    }

    return c.json({
      key: entry.key,
      value: entry.value,
      createdAt: new Date(entry.createdAt).toISOString(),
      updatedAt: new Date(entry.updatedAt).toISOString(),
    });
  });

  api.post("/kv/:key", async (c) => {
    const ctx = getContext();
    if (!ctx.nearAccountId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const key = c.req.param("key");
    const keyValidation = KeySchema.safeParse(key);
    if (!keyValidation.success) {
      return c.json({ error: keyValidation.error.message }, 400);
    }

    const body = await c.req.json();
    const valueSchema = z.object({ value: z.string().max(100000) });
    const bodyValidation = valueSchema.safeParse(body);
    if (!bodyValidation.success) {
      return c.json({ error: bodyValidation.error.message }, 400);
    }

    const { value } = bodyValidation.data;
    const now = new Date();

    await ctx.db
      .insert(schema.kvStore)
      .values({
        key,
        value,
        nearAccountId: ctx.nearAccountId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [schema.kvStore.key, schema.kvStore.nearAccountId],
        set: {
          value,
          updatedAt: now,
        },
      });

    const entry = await ctx.db.query.kvStore.findFirst({
      where: and(
        eq(schema.kvStore.key, key),
        eq(schema.kvStore.nearAccountId, ctx.nearAccountId)
      ),
    });

    if (!entry) {
      return c.json({ error: "Failed to persist key value entry" }, 500);
    }

    return c.json({
      key: entry.key,
      value: entry.value,
      createdAt: new Date(entry.createdAt).toISOString(),
      updatedAt: new Date(entry.updatedAt).toISOString(),
    });
  });

  // ===========================================================================
  // CHAT
  // ===========================================================================

  api.post("/chat", async (c) => {
    const ctx = getContext();
    if (!ctx.nearAccountId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    if (!ctx.agentService) {
      return c.json(
        { error: "NEAR AI not connected. Configure NEAR_AI_API_KEY." },
        503
      );
    }

    const body = await c.req.json();
    const validation = ChatInputSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: validation.error.message }, 400);
    }

    const { message, conversationId } = validation.data;

    try {
      const result = await ctx.agentService.processMessage(
        ctx.nearAccountId,
        message,
        conversationId
      );
      return c.json(result);
    } catch (error) {
      console.error("[API] Chat error:", error);
      return c.json({ error: "Chat processing failed" }, 500);
    }
  });

  api.post("/chat/stream", async (c) => {
    const ctx = getContext();
    if (!ctx.nearAccountId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    if (!ctx.agentService) {
      return c.json(
        { error: "NEAR AI not connected. Configure NEAR_AI_API_KEY." },
        503
      );
    }

    const body = await c.req.json();
    const validation = ChatInputSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: validation.error.message }, 400);
    }

    const { message, conversationId } = validation.data;

    // Create SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          const generator = ctx.agentService!.processMessageStream(
            ctx.nearAccountId!,
            message,
            conversationId
          );

          for await (const event of generator) {
            const sseData = `event: ${event.type}\nid: ${event.id}\ndata: ${JSON.stringify(event.data)}\n\n`;
            controller.enqueue(encoder.encode(sseData));
          }
        } catch (error) {
          console.error("[API] Stream error:", error);
          const errorEvent = `event: error\ndata: ${JSON.stringify({ message: "Stream failed" })}\n\n`;
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

  api.get("/conversations/:id", async (c) => {
    const ctx = getContext();
    if (!ctx.nearAccountId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const id = c.req.param("id");
    const queryParams = c.req.query();
    const validation = GetConversationInputSchema.safeParse({
      limit: queryParams.limit,
      offset: queryParams.offset,
    });

    const { limit, offset } = validation.success
      ? validation.data
      : { limit: 100, offset: 0 };

    const conversation = await ctx.db.query.conversation.findFirst({
      where: eq(schema.conversation.id, id),
    });

    if (!conversation) {
      return c.json({ error: "Conversation not found" }, 404);
    }

    if (conversation.nearAccountId !== ctx.nearAccountId) {
      return c.json({ error: "Access denied" }, 403);
    }

    const messages = await ctx.db.query.message.findMany({
      where: eq(schema.message.conversationId, id),
      orderBy: [desc(schema.message.createdAt)],
      limit: limit + 1,
      offset,
    });

    const hasMore = messages.length > limit;
    const messagesToReturn = hasMore ? messages.slice(0, limit) : messages;

    return c.json({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        nearAccountId: conversation.nearAccountId,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
      },
      messages: messagesToReturn.reverse().map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt.toISOString(),
      })),
      pagination: {
        limit,
        offset,
        hasMore,
      },
    });
  });

  // ===========================================================================
  // IPFS UPLOAD (Server-side, no CORS)
  // ===========================================================================

  api.post("/ipfs/upload", async (c) => {
    try {
      const body = await c.req.parseBody();

      // Validate file is present
      if (!body || typeof body !== 'object') {
        return c.json({ error: "Invalid request body" }, 400);
      }

      const formData = body as any;

      // Check if file exists in the form data
      const fileEntry = formData.file;
      if (!fileEntry) {
        return c.json({ error: "No file provided" }, 400);
      }

      // Convert file to ArrayBuffer
      const arrayBuffer = await fileEntry.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);

      // Upload to nft.storage (server-side, no CORS)
      const response = await fetch("https://api.nft.storage/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${c.env.NFT_STORAGE_API_KEY || ""}`,
        },
        body: JSON.stringify({
          name: fileEntry.name,
          type: fileEntry.type,
          size: fileEntry.size,
          data: fileBuffer.toString("base64"),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[IPFS] Upload failed:", response.status, errorText);
        return c.json({ error: `IPFS upload failed: ${response.statusText}` }, 502);
      }

      const result = await response.json();

      if (!result.ok) {
        return c.json({ error: result.error || "Upload failed" }, 400);
      }

      // Return the CID
      return c.json({
        cid: result.value?.ipfs || result.value?.url || "",
      });
    } catch (error) {
      console.error("[API] IPFS upload error:", error);
      return c.json({ error: "Failed to upload to IPFS" }, 500);
    }
  });

  // ===========================================================================
  // NOTE: /builders and /profiles endpoints are now public with host guard
  // See worker/src/index.ts - they are no longer authenticated routes
  // ===========================================================================

  // ===========================================================================
  // SOCIAL GRAPH (Follow/Follower System)
  // ===========================================================================

  // Follow user (prepare transaction for client-side signing)
  api.post("/social/follow", async (c) => {
    const ctx = getContext();
    if (!ctx.nearAccountId) {
      return c.json({ error: "Authentication required" }, 401);
    }
    if (!ctx.socialService) {
      return c.json({ error: "Social service not available" }, 503);
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

  // Unfollow user (prepare transaction for client-side signing)
  api.post("/social/unfollow", async (c) => {
    const ctx = getContext();
    if (!ctx.nearAccountId) {
      return c.json({ error: "Authentication required" }, 401);
    }
    if (!ctx.socialService) {
      return c.json({ error: "Social service not available" }, 503);
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
  api.get("/social/followers/:accountId", async (c) => {
    const ctx = getContext();
    if (!ctx.socialService) {
      return c.json({
        followers: [],
        total: 0,
        pagination: { limit: 50, offset: 0, hasMore: false },
      });
    }

    const accountId = c.req.param("accountId");
    if (!accountId) {
      return c.json({ error: "accountId is required" }, 400);
    }

    const limit = Math.min(Number(c.req.query("limit") || "50"), 100);
    const offset = Number(c.req.query("offset") || "0");

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
  api.get("/social/following/:accountId", async (c) => {
    const ctx = getContext();
    if (!ctx.socialService) {
      return c.json({
        following: [],
        total: 0,
        pagination: { limit: 50, offset: 0, hasMore: false },
      });
    }

    const accountId = c.req.param("accountId");
    if (!accountId) {
      return c.json({ error: "accountId is required" }, 400);
    }

    const limit = Math.min(Number(c.req.query("limit") || "50"), 100);
    const offset = Number(c.req.query("offset") || "0");

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
  api.get("/social/following/:accountId/check/:targetAccountId", async (c) => {
    const ctx = getContext();
    if (!ctx.socialService) {
      return c.json({ isFollowing: false });
    }

    const accountId = c.req.param("accountId");
    const targetAccountId = c.req.param("targetAccountId");

    if (!accountId || !targetAccountId) {
      return c.json({ error: "accountId and targetAccountId are required" }, 400);
    }

    try {
      const isFollowing = await ctx.socialService.isFollowing(accountId, targetAccountId);
      return c.json({ isFollowing });
    } catch (error) {
      console.error("[API] Check following error:", error);
      return c.json({ error: "Failed to check follow status" }, 500);
    }
  });

  return api;
}
