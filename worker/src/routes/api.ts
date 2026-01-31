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
import { handleBuildersRequest } from "../services/builders";
import { CacheService } from "../services/cache";

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

const BuildersInputSchema = z.object({
  path: z.string().optional().default("collections"),
  params: z.record(z.string(), z.coerce.string()).optional().default({}),
});

// =============================================================================
// CONTEXT TYPE
// =============================================================================

interface ApiContext {
  db: Database;
  cache: CacheService;
  agentService: AgentService | null;
  nearService: NearService | null;
  nearAccountId?: string;
  role?: string;
  nearblocksApiKey?: string;
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
  // BUILDERS
  // ===========================================================================

  api.get("/builders", async (c) => {
    const ctx = getContext();
    const queryParams = c.req.query();
    const input = {
      path: queryParams.path || "collections",
      params: Object.fromEntries(
        Object.entries(queryParams).filter(([k]) => k !== "path")
      ),
      nearblocksApiKey: ctx.nearblocksApiKey,
      cache: ctx.cache,
    };

    const result = await handleBuildersRequest(input);

    if (result.success) {
      return c.json(result.data);
    } else {
      return c.json({ error: result.error }, result.status as 400 | 500);
    }
  });

  api.post("/builders", async (c) => {
    const ctx = getContext();
    const body = await c.req.json();
    const validation = BuildersInputSchema.safeParse(body);

    if (!validation.success) {
      return c.json({ error: validation.error.message }, 400);
    }

    const result = await handleBuildersRequest({
      ...validation.data,
      nearblocksApiKey: ctx.nearblocksApiKey,
      cache: ctx.cache,
    });

    if (result.success) {
      return c.json(result.data);
    } else {
      return c.json({ error: result.error }, result.status as 400 | 500);
    }
  });

  api.get("/builders/:id", async (c) => {
    const ctx = getContext();
    const id = c.req.param("id");
    const queryParams = c.req.query();

    const input = {
      path: `collections/${id}`,
      params: queryParams as Record<string, string>,
      nearblocksApiKey: ctx.nearblocksApiKey,
      cache: ctx.cache,
    };

    const result = await handleBuildersRequest(input);

    if (result.success) {
      return c.json(result.data);
    } else {
      return c.json({ error: result.error }, result.status as 400 | 500);
    }
  });

  // ===========================================================================
  // PROFILES (NEAR Social) with KV caching
  // ===========================================================================

  api.get("/profiles", async (c) => {
    const ctx = getContext();
    const queryParams = c.req.query();
    const accountIds = queryParams.ids?.split(",").filter(Boolean) || [];

    if (accountIds.length === 0) {
      return c.json({});
    }

    // Try to get from KV cache first
    const cachedProfiles = await ctx.cache.getProfiles(accountIds);
    const uncachedIds = accountIds.filter((id) => !cachedProfiles.has(id));

    // Fetch only uncached profiles from NEAR Social
    const fetchedProfiles: Record<string, any> = {};

    if (uncachedIds.length > 0) {
      await Promise.all(
        uncachedIds.map(async (accountId) => {
          try {
            const response = await fetch(
              `https://api.near.social/get`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  keys: [`${accountId}/profile/**`],
                }),
              }
            );

            if (response.ok) {
              const data = await response.json();
              if (data[accountId]?.profile) {
                fetchedProfiles[accountId] = data[accountId].profile;
              }
            }
          } catch (e) {
            console.error(`[API] Error fetching profile for ${accountId}:`, e);
          }
        })
      );

      // Cache fetched profiles
      await ctx.cache.setProfiles(fetchedProfiles);
    }

    // Merge cached and fetched profiles
    const allProfiles = { ...cachedProfiles, ...fetchedProfiles };

    return c.json(allProfiles);
  });

  api.get("/profiles/:accountId", async (c) => {
    const ctx = getContext();
    const accountId = c.req.param("accountId");

    // Try KV cache first
    const cached = await ctx.cache.getProfile(accountId);
    if (cached) {
      console.log(`[KV CACHE HIT] Profile for: ${accountId}`);
      return c.json(cached);
    }

    // Fetch from NEAR Social
    try {
      const response = await fetch("https://api.near.social/get", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keys: [`${accountId}/profile/**`],
        }),
      });

      if (!response.ok) {
        return c.json(null, 404);
      }

      const data = await response.json();
      const profile = data[accountId]?.profile;

      if (!profile) {
        return c.json(null, 404);
      }

      // Cache in KV
      await ctx.cache.setProfile(accountId, profile);

      return c.json(profile);
    } catch (e) {
      console.error(`[API] Error fetching profile for ${accountId}:`, e);
      return c.json(null, 500);
    }
  });

  return api;
}
