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
import { ProjectsService } from "../services/projects";
import { PaymentKeyService } from "../services/payment-keys";

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
  paymentKeyService: PaymentKeyService | null;
  nearAccountId?: string;
  role?: string;
}

// =============================================================================
// ROUTE FACTORY
// =============================================================================

export function createApiRoutes(
  getContext: (c: any) => ApiContext | Promise<ApiContext>,
) {
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

  api.get("/protected", async (c) => {
    const ctx = await getContext(c);
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
    const ctx = await getContext(c);
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
    const ctx = await getContext(c);
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
    const ctx = await getContext(c);
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
        eq(schema.kvStore.nearAccountId, ctx.nearAccountId),
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
    const ctx = await getContext(c);
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
        eq(schema.kvStore.nearAccountId, ctx.nearAccountId),
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
    const ctx = await getContext(c);
    if (!ctx.nearAccountId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    if (!ctx.agentService) {
      return c.json(
        { error: "NEAR AI not connected. Configure NEAR_AI_API_KEY." },
        503,
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
        conversationId,
      );
      return c.json(result);
    } catch (error) {
      console.error("[API] Chat error:", error);
      return c.json({ error: "Chat processing failed" }, 500);
    }
  });

  api.post("/chat/stream", async (c) => {
    const ctx = await getContext(c);
    if (!ctx.nearAccountId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    if (!ctx.agentService) {
      return c.json(
        { error: "NEAR AI not connected. Configure NEAR_AI_API_KEY." },
        503,
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
            conversationId,
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
    const ctx = await getContext(c);
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
      if (!body || typeof body !== "object") {
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
          Authorization: `Bearer ${c.env.NFT_STORAGE_API_KEY || ""}`,
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
        return c.json(
          { error: `IPFS upload failed: ${response.statusText}` },
          502,
        );
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
    const ctx = await getContext(c);
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
        targetAccountId,
      );

      if (!result.success) {
        return c.json(
          { error: result.error || "Failed to prepare transaction" },
          500,
        );
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
    const ctx = await getContext(c);
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
        targetAccountId,
      );

      if (!result.success) {
        return c.json(
          { error: result.error || "Failed to prepare transaction" },
          500,
        );
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

  // Get followers list (FastData API spec: GET /social/followers?account_id=xxx)
  api.get("/social/followers", async (c) => {
    const ctx = await getContext(c);
    if (!ctx.socialService) {
      return c.json({
        accounts: [],
        count: 0,
        meta: { has_more: false },
      });
    }

    const accountId = c.req.query("account_id");
    if (!accountId) {
      return c.json({ error: "account_id is required" }, 400);
    }

    const limit = Math.min(Number(c.req.query("limit") || "50"), 100);
    const offset = Number(c.req.query("offset") || "0");
    const afterAccount = c.req.query("after_account"); // cursor for pagination

    console.log(
      `[API] GET /social/followers - account_id: ${accountId}, limit: ${limit}, offset: ${offset}, after_account: ${afterAccount || "none"}`,
    );

    // Can't use after_account with offset > 0
    if (afterAccount && offset > 0) {
      return c.json(
        { error: "after_account cannot be combined with offset > 0" },
        400,
      );
    }

    try {
      const result = await ctx.socialService.getFollowers(
        accountId,
        limit,
        offset,
        afterAccount || undefined,
      );

      // Extract just account IDs to match FastData spec
      const accounts = result.items.map((item) => item.accountId);

      const response = {
        accounts,
        count: result.total,
        meta: {
          has_more: result.hasMore,
          ...(result.nextCursor ? { next_cursor: result.nextCursor } : {}),
        },
      };

      console.log(
        `[API] GET /social/followers - Response:`,
        JSON.stringify(response, null, 2),
      );

      return c.json(response);
    } catch (error) {
      console.error("[API] Get followers error:", error);
      return c.json({ error: "Failed to fetch followers" }, 500);
    }
  });

  // Get following list (FastData API spec: GET /social/following?account_id=xxx)
  api.get("/social/following", async (c) => {
    const ctx = await getContext(c);
    if (!ctx.socialService) {
      return c.json({
        accounts: [],
        count: 0,
        meta: { has_more: false },
      });
    }

    const accountId = c.req.query("account_id");
    if (!accountId) {
      return c.json({ error: "account_id is required" }, 400);
    }

    const limit = Math.min(Number(c.req.query("limit") || "50"), 100);
    const offset = Number(c.req.query("offset") || "0");
    const afterAccount = c.req.query("after_account"); // cursor for pagination

    console.log(
      `[API] GET /social/following - account_id: ${accountId}, limit: ${limit}, offset: ${offset}, after_account: ${afterAccount || "none"}`,
    );

    // Can't use after_account with offset > 0
    if (afterAccount && offset > 0) {
      return c.json(
        { error: "after_account cannot be combined with offset > 0" },
        400,
      );
    }

    try {
      const result = await ctx.socialService.getFollowing(
        accountId,
        limit,
        offset,
        afterAccount || undefined,
      );

      // Extract just account IDs to match FastData spec
      const accounts = result.items.map((item) => item.accountId);

      const response = {
        accounts,
        count: result.total,
        meta: {
          has_more: result.hasMore,
          ...(result.nextCursor ? { next_cursor: result.nextCursor } : {}),
        },
      };

      console.log(
        `[API] GET /social/following - Response:`,
        JSON.stringify(response, null, 2),
      );

      return c.json(response);
    } catch (error) {
      console.error("[API] Get following error:", error);
      return c.json({ error: "Failed to fetch following" }, 500);
    }
  });

  // Check if following (convenience endpoint, not in FastData spec)
  api.get("/social/is-following", async (c) => {
    const ctx = await getContext(c);
    if (!ctx.socialService) {
      return c.json({ isFollowing: false });
    }

    const accountId = c.req.query("account_id");
    const targetAccountId = c.req.query("target_account_id");

    if (!accountId || !targetAccountId) {
      return c.json(
        { error: "account_id and target_account_id are required" },
        400,
      );
    }

    try {
      const isFollowing = await ctx.socialService.isFollowing(
        accountId,
        targetAccountId,
      );
      return c.json({ isFollowing });
    } catch (error) {
      console.error("[API] Check following error:", error);
      return c.json({ error: "Failed to check follow status" }, 500);
    }
  });

  // ===========================================================================
  // PROJECTS (FastData KV-based)
  // ===========================================================================

  // FastData config
  const FASTDATA_CONTRACT = "contextual.near";
  const FASTDATA_METHOD = "__fastdata_kv";
  const PROJECTS_PREFIX = "projects";

  // RPC endpoints for round-robin
  const RPC_ENDPOINTS = [
    "https://rpc.mainnet.near.org",
    "https://near.lava.build",
    "https://near.blockpi.network/v1/rpc/public",
    "https://near.drpc.org",
  ];
  let rpcIndex = 0;

  function getNextRpcUrl() {
    const url = RPC_ENDPOINTS[rpcIndex];
    rpcIndex = (rpcIndex + 1) % RPC_ENDPOINTS.length;
    return url;
  }

  // ===========================================================================
  // PROJECTS (Public read via FastData API)
  // ===========================================================================

  // Get projects list - simple working version
  api.get("/projects", async (c) => {
    const queryParams = c.req.query();
    const accountId = queryParams.accountId || queryParams.account_id;

    console.log("[API] GET /projects - All queryParams:", queryParams);
    console.log("[API] GET /projects - accountId:", accountId);

    if (!accountId) {
      return c.json(
        {
          error:
            "accountId query parameter is required (use ?accountId=your.near)",
        },
        400,
      );
    }

    const limit = Math.min(Number(queryParams.limit || "50"), 100);
    const offset = Number(queryParams.offset || "0");
    const status = queryParams.status as
      | "active"
      | "completed"
      | "archived"
      | undefined;

    console.log(
      `[API] GET /projects - accountId: ${accountId}, limit: ${limit}, offset: ${offset}, status: ${status || "all"}`,
    );

    try {
      // Build FastData API URL
      const apiUrl = new URL("https://fastdata.up.railway.app/v1/kv/query");
      apiUrl.searchParams.set("accountId", accountId);
      apiUrl.searchParams.set("contractId", FASTDATA_CONTRACT);
      apiUrl.searchParams.set("key_prefix", `${PROJECTS_PREFIX}/`);
      apiUrl.searchParams.set("value_format", "json");

      console.log(`[API] FastData URL: ${apiUrl.toString()}`);

      // Fetch from FastData
      const response = await fetch(apiUrl.toString(), {
        headers: { "User-Agent": "near-agent-worker/1.0" },
      });

      console.log(`[API] FastData response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[API] FastData error response: ${errorText}`);
        return c.json({ error: `FastData API error: ${response.status}` }, 502);
      }

      const data = await response.json();
      console.log(
        `[API] FastData response keys count: ${data.data?.length || 0}`,
      );

      // Return empty result if no data
      if (!data.data || !Array.isArray(data.data)) {
        return c.json({
          projects: [],
          pagination: { limit, offset, hasMore: false },
        });
      }

      // Group by project ID
      const projectsMap = new Map<string, Record<string, string>>();

      for (const entry of data.data) {
        const key = entry.key;
        if (!key.startsWith(`${PROJECTS_PREFIX}/`)) continue;

        const parts = key.split("/");
        if (parts.length < 3) continue;

        const projectId = parts[1];
        if (!projectsMap.has(projectId)) {
          projectsMap.set(projectId, {});
        }

        const field = parts.slice(2).join("/");
        let value = entry.value;

        // Try to parse JSON values
        try {
          if (
            value.startsWith('"') ||
            value.startsWith("{") ||
            value.startsWith("[")
          ) {
            value = JSON.parse(value);
          }
        } catch {
          // Keep as string if JSON parse fails
        }

        projectsMap.get(projectId)![field] = value;
      }

      console.log(`[API] Unique projects found: ${projectsMap.size}`);

      // Build projects array
      let projects: Array<{
        id: string;
        nearAccountId: string;
        name: string;
        description: string | null;
        status: string;
        createdAt: string;
        updatedAt: string;
      }> = [];

      for (const [projectId, fields] of projectsMap.entries()) {
        const name = fields.name;
        const description = fields.description || null;
        const projectStatus = fields.status;
        const createdAt = fields.created;
        const updatedAt = fields.updated;

        // Only include valid projects
        if (name && projectStatus && createdAt && updatedAt) {
          projects.push({
            id: projectId,
            nearAccountId: accountId,
            name: String(name),
            description: description !== null ? String(description) : null,
            status: String(projectStatus),
            createdAt: String(createdAt),
            updatedAt: String(updatedAt),
          });
        }
      }

      console.log(`[API] Valid projects: ${projects.length}`);

      // Filter by status
      if (status) {
        const before = projects.length;
        projects = projects.filter((p) => p.status === status);
        console.log(
          `[API] After status filter (${status}): ${projects.length} (was ${before})`,
        );
      }

      // Sort by updatedAt (newest first)
      projects.sort((a, b) => {
        return (
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      });

      // Pagination
      const total = projects.length;
      const paginatedProjects = projects.slice(offset, offset + limit);
      const hasMore = offset + limit < total;

      console.log(
        `[API] Returning ${paginatedProjects.length} projects (hasMore: ${hasMore})`,
      );

      return c.json({
        projects: paginatedProjects,
        pagination: { limit, offset, hasMore, total },
      });
    } catch (error) {
      console.error("[API] Projects endpoint error:", error);
      return c.json(
        {
          error: "Internal server error",
          details: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });

  // Get a single project
  api.get("/projects/:projectId", async (c) => {
    const ctx = await getContext(c);
    if (!ctx.nearAccountId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const projectId = c.req.param("projectId");

    try {
      const projectsService = new ProjectsService(ctx.db, {
        network: "mainnet",
      });
      const project = await projectsService.getProject(
        ctx.nearAccountId,
        projectId,
      );

      if (!project) {
        return c.json({ error: "Project not found" }, 404);
      }

      return c.json({
        id: project.id,
        nearAccountId: ctx.nearAccountId,
        name: project.name,
        description: project.description || null,
        status: project.status,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      });
    } catch (error) {
      console.error("[API] Get project error:", error);
      return c.json({ error: "Failed to fetch project" }, 500);
    }
  });

  // create project (prepare transaction for client-side signing)
  api.post("/projects/create", async (c) => {
    const ctx = await getContext(c);
    if (!ctx.nearAccountId) {
      return c.json({ error: "authentication required" }, 401);
    }

    try {
      const body = await c.req.json();
      const {
        name,
        description,
        status = "active",
        coverImageUrl,
      }: {
        name?: string;
        description?: string;
        status?: "active" | "completed" | "archived";
        coverImageUrl?: string;
      } = body;

      if (!name || typeof name !== "string") {
        return c.json({ error: "name is required" }, 400);
      }

      // generate unique project id
      const projectId = `${ctx.nearAccountId}-${Date.now()}`;

      // Build flat args object matching the FastData contract format
      const now = new Date().toISOString();

      const transaction = {
        contractId: "contextual.near",
        methodName: "__fastdata_kv",
        args: {
          account_id: ctx.nearAccountId,
          [`projects/${projectId}/name`]: name,
          ...(description
            ? { [`projects/${projectId}/description`]: description }
            : {}),
          [`projects/${projectId}/status`]: status,
          [`projects/${projectId}/created`]: now,
          [`projects/${projectId}/updated`]: now,
          ...(coverImageUrl !== undefined
            ? { [`projects/${projectId}/coverImageUrl`]: coverImageUrl }
            : {}),
          [`index/project/${projectId}`]: JSON.stringify({
            type: "project",
            accountId: ctx.nearAccountId,
            name,
            status,
            createdAt: now,
          }),
        },
        gas: "300000000000000",
        deposit: "0.01 NEAR",
      };

      return c.json({
        id: projectId,
        nearAccountId: ctx.nearAccountId,
        name,
        description: description || null,
        status,
        coverImageUrl: coverImageUrl || null,
        createdAt: now,
        updatedAt: now,
        transaction,
      });
    } catch (error) {
      console.error("[api] create project error:", error);
      return c.json({ error: "failed to create project" }, 500);
    }
  });

  // update project (prepare transaction for client-side signing)
  api.put("/projects/:projectId", async (c) => {
    const ctx = await getContext(c);
    if (!ctx.nearAccountId) {
      return c.json({ error: "authentication required" }, 401);
    }

    const projectId = c.req.param("projectId");

    try {
      const body = await c.req.json();
      const {
        name,
        description,
        status,
        coverImageUrl,
      }: {
        name?: string;
        description?: string;
        status?: "active" | "completed" | "archived";
        coverImageUrl?: string;
      } = body;

      if (!name || typeof name !== "string") {
        return c.json({ error: "name is required" }, 400);
      }

      // Build flat args object matching the FastData contract format
      const now = new Date().toISOString();
      const projectStatus = status || "active";

      const transactionArgs = {
        account_id: ctx.nearAccountId,
        [`projects/${projectId}/name`]: name,
        ...(description
          ? { [`projects/${projectId}/description`]: description }
          : {}),
        [`projects/${projectId}/status`]: projectStatus,
        [`projects/${projectId}/updated`]: now,
        ...(coverImageUrl !== undefined
          ? { [`projects/${projectId}/coverImageUrl`]: coverImageUrl }
          : {}),
        [`index/project/${projectId}`]: JSON.stringify({
          type: "project",
          accountId: ctx.nearAccountId,
          name,
          status: projectStatus,
          createdAt: now,
        }),
      };

      // FAST PATH: Try payment key execution (opt-in)
      if (ctx.paymentKeyService) {
        const paymentKey = await ctx.paymentKeyService.getOrCreatePaymentKey(
          ctx.nearAccountId,
        );

        if (paymentKey) {
          // Use database balance instead of checking on-chain
          const initialBalanceNum = parseInt(paymentKey.initialBalance);

          if (initialBalanceNum >= 1000000) {
            // At least $1 USD for projects (NEAR deposit)
            try {
              console.log(
                "[API] Using payment key for project update - FAST PATH",
              );
              // Execute via OutLayer - no wallet popup!
              const result = await ctx.paymentKeyService.executeCall({
                paymentKey: `${ctx.nearAccountId}:${paymentKey.nonce}:${paymentKey.secret}`,
                contractId: "contextual.near",
                methodName: "__fastdata_kv",
                args: transactionArgs,
                gas: "300000000000000",
                deposit: "0.01 NEAR",
              });

              if (result.success) {
                console.log("[API] Payment key execution successful");
                return c.json({
                  id: projectId,
                  nearAccountId: ctx.nearAccountId,
                  name,
                  description: description || null,
                  status: projectStatus,
                  coverImageUrl: coverImageUrl || null,
                  updatedAt: now,
                  executed: true, // Indicates fast path was used
                  transactionHash: result.transactionHash,
                  remainingBalance: result.remainingBalance,
                });
              }
            } catch (error) {
              console.log(
                "[API] Payment key execution failed, falling back to signing",
                error,
              );
            }
          } else {
            console.log(
              "[API] Payment key balance too low:",
              initialBalanceNum,
            );
          }
        }
      }

      // DEFAULT PATH: Prepare transaction for client signing (works for everyone)
      console.log("[API] Using wallet signing - DEFAULT PATH");

      // DEFAULT PATH: Prepare transaction for client signing (works for everyone)
      const transaction = {
        contractId: "contextual.near",
        methodName: "__fastdata_kv",
        args: transactionArgs,
        gas: "300000000000000",
        deposit: "0.01 NEAR",
      };

      return c.json({
        id: projectId,
        nearAccountId: ctx.nearAccountId,
        name,
        description: description || null,
        status: projectStatus,
        coverImageUrl: coverImageUrl || null,
        updatedAt: now,
        executed: false, // Indicates client must sign
        transaction,
      });
    } catch (error) {
      console.error("[api] update project error:", error);
      return c.json({ error: "failed to update project" }, 500);
    }
  });

  // Delete project (prepare transaction for client-side signing)
  api.delete("/projects/:projectId", async (c) => {
    const ctx = await getContext(c);
    if (!ctx.nearAccountId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const projectId = c.req.param("projectId");

    try {
      // Prepare transaction for client-side signing
      const projectsService = new ProjectsService(ctx.db, {
        network: "mainnet",
      });
      const transaction = await projectsService.prepareDeleteTransaction(
        ctx.nearAccountId,
        projectId,
      );

      if (!transaction) {
        return c.json({ error: "Failed to prepare transaction" }, 500);
      }

      // FAST PATH: Try payment key execution (opt-in)
      if (ctx.paymentKeyService && transaction.args) {
        const paymentKey = await ctx.paymentKeyService.getOrCreatePaymentKey(
          ctx.nearAccountId,
        );

        if (paymentKey) {
          // Use database balance instead of checking on-chain
          const initialBalanceNum = parseInt(paymentKey.initialBalance);

          if (initialBalanceNum >= 1000000) {
            // At least $1 USD for projects (NEAR deposit)
            try {
              console.log(
                "[API] Using payment key for project delete - FAST PATH",
              );
              // Execute via OutLayer - no wallet popup!
              const result = await ctx.paymentKeyService.executeCall({
                paymentKey: `${ctx.nearAccountId}:${paymentKey.nonce}:${paymentKey.secret}`,
                contractId: transaction.contractId,
                methodName: transaction.methodName,
                args: transaction.args,
                gas: transaction.gas,
                deposit: transaction.deposit || "0",
              });

              if (result.success) {
                console.log("[API] Payment key execution successful");
                return c.json({
                  success: true,
                  executed: true, // Indicates fast path was used
                  transactionHash: result.transactionHash,
                  remainingBalance: result.remainingBalance,
                });
              }
            } catch (error) {
              console.log(
                "[API] Payment key execution failed, falling back to signing",
                error,
              );
            }
          } else {
            console.log(
              "[API] Payment key balance too low:",
              initialBalanceNum,
            );
          }
        }
      }

      // DEFAULT PATH: Prepare transaction for client signing (works for everyone)
      console.log("[API] Using wallet signing - DEFAULT PATH");

      // DEFAULT PATH: Prepare transaction for client signing (works for everyone)
      return c.json({
        success: true,
        executed: false, // Indicates client must sign
        transaction,
      });
    } catch (error) {
      console.error("[API] Delete project error:", error);
      return c.json({ error: "Failed to delete project" }, 500);
    }
  });

  // Get project KV entries
  api.get("/projects/:projectId/kv", async (c) => {
    const ctx = await getContext(c);
    if (!ctx.nearAccountId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const projectId = c.req.param("projectId");
    const limit = Math.min(Number(c.req.query("limit") || "50"), 100);

    console.log(
      "[API] Fetching KV entries for project:",
      projectId,
      "limit:",
      limit,
    );

    try {
      const projectsService = new ProjectsService(ctx.db, {
        network: "mainnet",
      });
      const entries = await projectsService.getKvEntries(
        ctx.nearAccountId,
        projectId,
        limit,
      );

      console.log("[API] Found", entries.length, "KV entries");

      return c.json({
        entries: entries.map((e) => ({
          projectId: e.projectId,
          key: e.key,
          value: e.value,
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
        })),
      });
    } catch (error) {
      console.error("[API] Get project KV error:", error);
      console.error(
        "[API] Error stack:",
        error instanceof Error ? error.stack : String(error),
      );
      return c.json(
        {
          error: "Failed to fetch project KV",
          details: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });

  // Get projects for an account (public endpoint)
  api.get("/accounts/:accountId/projects", async (c) => {
    const accountId = c.req.param("accountId");
    const status = c.req.query("status") as
      | "active"
      | "completed"
      | "archived"
      | undefined;
    const limit = Math.min(Number(c.req.query("limit") || "50"), 100);
    const offset = Number(c.req.query("offset") || "0");

    try {
      // Query FastData API (not NEAR RPC directly)
      const apiUrl = new URL("https://fastdata.up.railway.app/v1/kv/query");
      apiUrl.searchParams.set("accountId", accountId);
      apiUrl.searchParams.set("contractId", FASTDATA_CONTRACT);
      apiUrl.searchParams.set("key_prefix", `${PROJECTS_PREFIX}/`);
      apiUrl.searchParams.set("value_format", "json");

      const response = await fetch(apiUrl.toString());
      if (!response.ok) {
        console.error("[API] FastData API failed:", response.status);
        return c.json({ error: "Failed to fetch projects" }, 500);
      }

      const json: unknown = await response.json();
      const apiResponse = json as {
        data?: Array<{ key: string; value: string }>;
      };

      if (!apiResponse.data) {
        return c.json({
          projects: [],
          pagination: { limit, offset, hasMore: false },
        });
      }

      // Group keys by project ID
      const projectGroups = new Map<string, Record<string, string>>();
      for (const entry of apiResponse.data) {
        const key = entry.key;
        if (!key.startsWith(`${PROJECTS_PREFIX}/`)) continue;

        const parts = key.split("/");
        if (parts.length < 3) continue;

        const projectId = parts[1];
        if (!projectGroups.has(projectId)) {
          projectGroups.set(projectId, {});
        }

        const field = parts.slice(2).join("/");
        // Parse JSON value (it comes as stringified JSON)
        const value = entry.value.startsWith('"')
          ? JSON.parse(entry.value)
          : entry.value;

        projectGroups.get(projectId)![field] = value;
      }

      // Parse projects
      let projects: any[] = [];
      for (const [projectId, fields] of projectGroups.entries()) {
        const name = fields["name"];
        const description = fields["description"];
        const projectStatus = fields["status"];
        const createdAt = fields["created"];
        const updatedAt = fields["updated"];

        if (name && projectStatus && createdAt && updatedAt) {
          projects.push({
            id: projectId,
            nearAccountId: accountId,
            name,
            description: description || null,
            status: projectStatus,
            createdAt,
            updatedAt,
          });
        }
      }

      // Filter by status if specified
      if (status) {
        projects = projects.filter((p: any) => p.status === status);
      }

      // Sort by updated date (newest first)
      projects.sort(
        (a: any, b: any) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

      // Apply pagination
      const hasMore = offset + limit < projects.length;
      const paginatedProjects = projects.slice(offset, offset + limit);

      return c.json({
        projects: paginatedProjects,
        pagination: {
          limit,
          offset,
          hasMore,
        },
      });
    } catch (error) {
      console.error("[API] Get account projects error:", error);
      return c.json({ error: "Failed to fetch projects" }, 500);
    }
  });

  // Get a project by name for an account (public endpoint)
  api.get("/accounts/:accountId/projects/by-name/:projectName", async (c) => {
    const accountId = c.req.param("accountId");
    const projectName = decodeURIComponent(c.req.param("projectName"));

    console.log(
      `[API] Fetching project by name: ${projectName} for ${accountId}`,
    );

    try {
      // Query FastData API with projects prefix
      const apiUrl = new URL("https://fastdata.up.railway.app/v1/kv/query");
      apiUrl.searchParams.set("accountId", accountId);
      apiUrl.searchParams.set("contractId", FASTDATA_CONTRACT);
      apiUrl.searchParams.set("key_prefix", `${PROJECTS_PREFIX}/`);
      apiUrl.searchParams.set("value_format", "json");

      const response = await fetch(apiUrl.toString());
      if (!response.ok) {
        console.error("[API] FastData API failed:", response.status);
        return c.json({ error: "Failed to fetch project" }, 500);
      }

      const json: unknown = await response.json();
      const apiResponse = json as {
        data?: Array<{ key: string; value: string }>;
      };

      if (!apiResponse.data) {
        return c.json({ error: "Project not found" }, 404);
      }

      // Group keys by project ID
      const projectGroups = new Map<string, Record<string, string>>();
      for (const entry of apiResponse.data) {
        const key = entry.key;
        if (!key.startsWith(`${PROJECTS_PREFIX}/`)) continue;

        const parts = key.split("/");
        if (parts.length < 3) continue;

        const projectId = parts[1];
        if (!projectGroups.has(projectId)) {
          projectGroups.set(projectId, {});
        }

        const field = parts.slice(2).join("/");
        // Parse JSON value (it comes as stringified JSON)
        const value = entry.value.startsWith('"')
          ? JSON.parse(entry.value)
          : entry.value;

        projectGroups.get(projectId)![field] = value;
      }

      // Find project by name (case-insensitive match)
      let foundProject: any = null;
      for (const [projectId, fields] of projectGroups.entries()) {
        const name = fields["name"];
        if (name && name.toLowerCase() === projectName.toLowerCase()) {
          const description = fields["description"];
          const projectStatus = fields["status"];
          const createdAt = fields["created"];
          const updatedAt = fields["updated"];
          const coverImageUrl = fields["coverImageUrl"];

          if (projectStatus && createdAt && updatedAt) {
            foundProject = {
              id: projectId,
              nearAccountId: accountId,
              name,
              description: description || null,
              coverImageUrl: coverImageUrl || null,
              status: projectStatus,
              createdAt,
              updatedAt,
            };
            break;
          }
        }
      }

      if (!foundProject) {
        return c.json({ error: "Project not found" }, 404);
      }

      console.log(
        `[API] Found project: ${foundProject.id} - ${foundProject.name}`,
      );
      return c.json(foundProject);
    } catch (error) {
      console.error("[API] Get project by name error:", error);
      return c.json({ error: "Failed to fetch project" }, 500);
    }
  });

  // ===========================================================================
  // PAYMENT KEYS (Optional fast transaction execution)
  // ===========================================================================

  // Get payment key status
  api.get("/payment-keys/status", async (c) => {
    const ctx = await getContext(c);
    if (!ctx.nearAccountId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    if (!ctx.paymentKeyService) {
      return c.json({ error: "Payment key service not available" }, 503);
    }

    try {
      const paymentKeys = await ctx.paymentKeyService.getAllPaymentKeys(
        ctx.nearAccountId,
      );

      if (paymentKeys.length === 0) {
        return c.json({ keys: [] });
      }

      // Use database values instead of checking on-chain
      // Imported keys may have balance on-chain even if DB shows 0
      const keysWithBalances = paymentKeys.map((key) => {
        const initialBalanceNum = parseInt(key.initialBalance);
        const availableUsd = (initialBalanceNum / 1000000).toFixed(2);

        return {
          id: key.id,
          nonce: key.nonce,
          isActive: key.isActive,
          initialBalance: key.initialBalance,
          spent: "0", // We don't track this separately
          available: key.initialBalance, // Assume all is available
          availableUsd,
          createdAt: key.createdAt,
          isIncomplete: initialBalanceNum === 0, // Only mark incomplete if truly 0
        };
      });

      return c.json({ keys: keysWithBalances });
    } catch (error) {
      console.error("[API] Payment key status error:", error);
      return c.json({ error: "Failed to fetch payment key status" }, 500);
    }
  });

  // Create payment key (generates key data and funding transaction)
  api.post("/payment-keys/create", async (c) => {
    const ctx = await getContext(c);
    if (!ctx.nearAccountId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    if (!ctx.paymentKeyService) {
      return c.json({ error: "Payment key service not available" }, 503);
    }

    try {
      const body = await c.req.json();
      const { initialDeposit = "1" } = body; // Minimum $1 USD

      // Validate deposit amount
      const depositAmount = parseFloat(initialDeposit);
      if (isNaN(depositAmount) || depositAmount < 1) {
        return c.json({ error: "Minimum deposit is $1 USD" }, 400);
      }

      // Prepare TWO transactions for user to sign
      const result = await ctx.paymentKeyService.prepareCreationTx(
        ctx.nearAccountId,
        initialDeposit,
      );

      return c.json({
        transactions: result.transactions, // Array of 2 transactions
        nonce: result.nonce,
        secret: result.secret,
        paymentKey: result.paymentKey, // SHOW ONLY ONCE!
        instructions: result.instructions,
      });
    } catch (error) {
      console.error("[API] Create payment key error:", error);
      return c.json({ error: "Failed to create payment key" }, 500);
    }
  });

  // Store payment key after user completes setup
  api.post("/payment-keys/store", async (c) => {
    try {
      const ctx = await getContext(c);
      if (!ctx.nearAccountId) {
        console.error("[API] Store payment key: No nearAccountId in context");
        return c.json({ error: "Authentication required" }, 401);
      }

      if (!ctx.paymentKeyService) {
        console.error(
          "[API] Store payment key: Payment key service not available in context",
        );
        return c.json({ error: "Payment key service not available" }, 503);
      }

      const body = await c.req.json();
      const { nonce, secret, initialBalance } = body;

      console.log("[API] Store payment key request:", {
        nearAccountId: ctx.nearAccountId,
        nonce,
        hasSecret: !!secret,
        initialBalance,
      });

      if (
        nonce === undefined ||
        nonce === null ||
        !secret ||
        initialBalance === undefined ||
        initialBalance === null
      ) {
        console.error("[API] Store payment key: Missing required fields");
        return c.json(
          { error: "nonce, secret, and initialBalance are required" },
          400,
        );
      }

      // Store the payment key in database
      const paymentKey = await ctx.paymentKeyService.storePaymentKey(
        ctx.nearAccountId,
        parseInt(nonce),
        secret,
        initialBalance,
      );

      console.log("[API] Payment key stored successfully:", paymentKey.id);

      return c.json({
        success: true,
        id: paymentKey.id,
        createdAt: paymentKey.createdAt,
      });
    } catch (error) {
      console.error("[API] Store payment key error:", error);
      return c.json(
        {
          error: "Failed to store payment key",
          details: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });

  // Top up payment key balance
  api.post("/payment-keys/topup", async (c) => {
    const ctx = await getContext(c);
    if (!ctx.nearAccountId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    if (!ctx.paymentKeyService) {
      return c.json({ error: "Payment key service not available" }, 503);
    }

    try {
      const body = await c.req.json();
      const { amount } = body; // USD amount as string

      console.log("[API] /payment-keys/topup called with amount:", amount);

      if (!amount || parseFloat(amount) <= 0) {
        console.log("[API] Invalid amount:", amount);
        return c.json({ error: "Valid amount is required" }, 400);
      }

      // Get all keys and find incomplete ones (created but not yet funded)
      const allKeys = await ctx.paymentKeyService.getAllPaymentKeys(
        ctx.nearAccountId,
      );
      console.log(
        `[API] Found ${allKeys.length} total keys for ${ctx.nearAccountId}`,
      );

      // Filter for incomplete keys (initialBalance is "0" = not yet funded)
      const incompleteKeys = allKeys.filter(
        (k) => k.isActive && k.initialBalance === "0",
      );
      console.log(`[API] Found ${incompleteKeys.length} incomplete keys`);

      if (incompleteKeys.length === 0) {
        return c.json(
          {
            error:
              "No incomplete payment key found to top up. Create a new key first.",
          },
          404,
        );
      }

      // Use the most recent incomplete key (already sorted by createdAt desc)
      const paymentKey = incompleteKeys[0];
      console.log(`[API] Using incomplete key with nonce ${paymentKey.nonce}`);

      const tx = await ctx.paymentKeyService.topUpBalance(
        paymentKey.nonce,
        amount,
      );
      console.log("[API] Transaction prepared:", tx);

      // tx already has the structure { transaction: { contractId, methodName, args, gas, deposit } }
      return c.json(tx);
    } catch (error) {
      console.error("[API] Top up payment key error:", error);
      return c.json({ error: "Failed to prepare top-up transaction" }, 500);
    }
  });

  // Deactivate payment key
  api.delete("/payment-keys/deactivate", async (c) => {
    const ctx = await getContext(c);
    if (!ctx.nearAccountId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    if (!ctx.paymentKeyService) {
      return c.json({ error: "Payment key service not available" }, 503);
    }

    try {
      const deactivated = await ctx.paymentKeyService.deactivateKey(
        ctx.nearAccountId,
      );

      if (!deactivated) {
        return c.json({ error: "No active payment key found" }, 404);
      }

      return c.json({
        success: true,
        message: "Payment key deactivated. You can create a new one anytime.",
      });
    } catch (error) {
      console.error("[API] Deactivate payment key error:", error);
      return c.json({ error: "Failed to deactivate payment key" }, 500);
    }
  });

  // Delete a specific payment key by ID
  api.delete("/payment-keys/:keyId", async (c) => {
    const ctx = await getContext(c);
    if (!ctx.nearAccountId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    if (!ctx.paymentKeyService) {
      return c.json({ error: "Payment key service not available" }, 503);
    }

    try {
      const keyId = c.req.param("keyId");

      if (!keyId) {
        return c.json({ error: "keyId is required" }, 400);
      }

      // Verify the key belongs to the user
      const allKeys = await ctx.paymentKeyService.getAllPaymentKeys(
        ctx.nearAccountId,
      );
      const keyToDelete = allKeys.find((k) => k.id === keyId);

      if (!keyToDelete) {
        return c.json({ error: "Payment key not found" }, 404);
      }

      const deleted = await ctx.paymentKeyService.deletePaymentKey(keyId);

      if (!deleted) {
        return c.json({ error: "Failed to delete payment key" }, 500);
      }

      return c.json({
        success: true,
        message: "Payment key deleted successfully",
      });
    } catch (error) {
      console.error("[API] Delete payment key error:", error);
      return c.json({ error: "Failed to delete payment key" }, 500);
    }
  });

  // Update payment key initial balance after successful funding
  api.post("/payment-keys/update-balance", async (c) => {
    const ctx = await getContext(c);
    if (!ctx.nearAccountId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    if (!ctx.paymentKeyService) {
      return c.json({ error: "Payment key service not available" }, 503);
    }

    try {
      const body = await c.req.json();
      const { nonce, initialBalance } = body;

      if (!nonce || !initialBalance) {
        return c.json({ error: "nonce and initialBalance are required" }, 400);
      }

      const updated = await ctx.paymentKeyService.updateBalance(
        parseInt(nonce),
        initialBalance,
      );

      if (!updated) {
        return c.json({ error: "Failed to update payment key balance" }, 500);
      }

      return c.json({
        success: true,
        message: "Payment key balance updated successfully",
      });
    } catch (error) {
      console.error("[API] Update balance error:", error);
      return c.json({ error: "Failed to update payment key balance" }, 500);
    }
  });

  // Import existing payment key (simple approach - users paste their key)
  api.post("/payment-keys/import", async (c) => {
    const ctx = await getContext(c);
    if (!ctx.nearAccountId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    if (!ctx.paymentKeyService) {
      return c.json({ error: "Payment key service not available" }, 503);
    }

    try {
      const body = await c.req.json();
      const { paymentKey, initialBalance } = body;

      if (!paymentKey || typeof paymentKey !== "string") {
        return c.json({ error: "paymentKey is required" }, 400);
      }

      // Validate payment key format: owner:nonce:secret
      const parts = paymentKey.split(":");
      if (parts.length !== 3) {
        return c.json(
          {
            error:
              "Invalid payment key format. Expected: owner:nonce:secret (e.g., account.near:1:abc123...)",
          },
          400,
        );
      }

      const [owner, nonceStr, secret] = parts;

      // Strip network suffix from authenticated account ID for comparison
      // nearAccountId might be "account.near:mainnet" but payment keys use "account.near"
      const cleanAccountId = ctx.nearAccountId.split(":")[0];

      // Validate owner matches authenticated user
      if (owner !== cleanAccountId) {
        return c.json(
          {
            error: `Payment key owner (${owner}) does not match your account (${cleanAccountId})`,
          },
          400,
        );
      }

      // Validate nonce is a number
      const nonce = parseInt(nonceStr);
      if (isNaN(nonce) || nonce < 1) {
        return c.json(
          { error: "Invalid nonce. Must be a positive integer" },
          400,
        );
      }

      // Validate secret is 64 hex characters (32 bytes)
      if (!/^[a-f0-9]{64}$/i.test(secret)) {
        return c.json(
          {
            error:
              "Invalid secret. Must be 64 hexadecimal characters (32 bytes)",
          },
          400,
        );
      }

      // Check if key already exists in database
      const existingKeys = await ctx.paymentKeyService.getAllPaymentKeys(
        ctx.nearAccountId,
      );
      const existingKey = existingKeys.find((k) => k.nonce === nonce);

      if (existingKey) {
        return c.json(
          { error: "Payment key with this nonce already exists" },
          409,
        );
      }

      // Import the key with provided initial balance or default to 0
      // Convert USD to micro-units if provided as decimal
      let balanceMicro = "0";
      if (initialBalance !== undefined) {
        if (typeof initialBalance === "number") {
          balanceMicro = (initialBalance * 1000000).toString();
        } else if (typeof initialBalance === "string") {
          const usd = parseFloat(initialBalance);
          if (!isNaN(usd)) {
            balanceMicro = (usd * 1000000).toString();
          }
        }
      }

      // Import the key
      try {
        const importedKey = await ctx.paymentKeyService.storePaymentKey(
          ctx.nearAccountId,
          nonce,
          secret,
          balanceMicro,
        );

        const availableUsd = (parseInt(balanceMicro) / 1000000).toFixed(2);

        return c.json({
          success: true,
          paymentKey: {
            id: importedKey.id,
            nonce: importedKey.nonce,
            initialBalance: balanceMicro,
            spent: "0",
            available: balanceMicro,
            availableUsd,
            createdAt: importedKey.createdAt,
          },
          message: `Payment key imported successfully! Available balance: $${availableUsd}`,
        });
      } catch (storeError) {
        console.error("[API] Failed to store imported key:", storeError);
        return c.json(
          {
            error: "Failed to store payment key in database",
            details:
              storeError instanceof Error
                ? storeError.message
                : String(storeError),
          },
          500,
        );
      }
    } catch (error) {
      console.error("[API] Import payment key error:", error);
      return c.json(
        {
          error: "Failed to import payment key",
          details: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });

  // Test payment key execution (debug endpoint - no auth required)
  api.post("/payment-keys/test", async (c) => {
    try {
      const body = await c.req.json();
      const { paymentKey } = body;

      if (!paymentKey) {
        return c.json({ error: "paymentKey is required" }, 400);
      }

      console.log(
        "[API] Testing payment key:",
        paymentKey.substring(0, 20) + "...",
      );

      // Test with a call to your actual OutLayer project
      // URL format: /call/{project_owner}/{project_name}
      const result = await fetch(
        "https://api.outlayer.fastnear.com/call/kampouse.near/random-ark",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Payment-Key": paymentKey,
          },
          body: JSON.stringify({
            input: {
              test: "hello from payment key",
            },
          }),
        },
      );

      const responseText = await result.text();
      console.log("[API] OutLayer response status:", result.status);
      console.log("[API] OutLayer response:", responseText.substring(0, 500));

      if (result.ok) {
        const data = JSON.parse(responseText);
        return c.json({
          success: true,
          message: "Payment key works! OutLayer API accepted the request.",
          data,
        });
      } else {
        return c.json(
          {
            success: false,
            error: `OutLayer API returned ${result.status}`,
            details: responseText.substring(0, 1000),
          },
          400,
        );
      }
    } catch (error) {
      console.error("[API] Payment key test error:", error);
      return c.json(
        {
          error: "Failed to test payment key",
          details: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });

  return api;
}
