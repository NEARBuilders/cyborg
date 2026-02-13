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
    const ctx = getContext();
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
    const ctx = getContext();
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
    const ctx = getContext();
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
    const ctx = getContext();
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
    const ctx = getContext();
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
    const ctx = getContext();
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

  // Create project (prepare transaction for client-side signing)
  api.post("/projects/create", async (c) => {
    const ctx = getContext();
    if (!ctx.nearAccountId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    try {
      const body = await c.req.json();
      const {
        name,
        description,
        status = "active",
      }: {
        name?: string;
        description?: string;
        status?: "active" | "completed" | "archived";
      } = body;

      if (!name || typeof name !== "string") {
        return c.json({ error: "name is required" }, 400);
      }

      // Generate unique project ID
      const projectId = `${ctx.nearAccountId}-${Date.now()}`;

      // Prepare transaction for client-side signing
      const projectsService = new ProjectsService(ctx.db, {
        network: "mainnet",
      });
      const transaction = await projectsService.prepareCreateTransaction(
        ctx.nearAccountId,
        projectId,
        name,
        description || "",
        status,
      );

      if (!transaction) {
        return c.json({ error: "Failed to prepare transaction" }, 500);
      }

      return c.json({
        id: projectId,
        nearAccountId: ctx.nearAccountId,
        name,
        description: description || null,
        status,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        transaction,
      });
    } catch (error) {
      console.error("[API] Create project error:", error);
      return c.json({ error: "Failed to create project" }, 500);
    }
  });

  // Update project (prepare transaction for client-side signing)
  api.put("/projects/:projectId", async (c) => {
    const ctx = getContext();
    if (!ctx.nearAccountId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const projectId = c.req.param("projectId");

    try {
      const body = await c.req.json();
      const {
        name,
        description,
        status,
      }: {
        name?: string;
        description?: string;
        status?: "active" | "completed" | "archived";
      } = body;

      // Prepare transaction for client-side signing
      const projectsService = new ProjectsService(ctx.db, {
        network: "mainnet",
      });
      const transaction = await projectsService.prepareUpdateTransaction(
        ctx.nearAccountId,
        projectId,
        name,
        description,
        status,
      );

      if (!transaction) {
        return c.json({ error: "Failed to prepare transaction" }, 500);
      }

      return c.json({
        id: projectId,
        nearAccountId: ctx.nearAccountId,
        name,
        description: description || null,
        status,
        updatedAt: new Date().toISOString(),
        transaction,
      });
    } catch (error) {
      console.error("[API] Update project error:", error);
      return c.json({ error: "Failed to update project" }, 500);
    }
  });

  // Delete project (prepare transaction for client-side signing)
  api.delete("/projects/:projectId", async (c) => {
    const ctx = getContext();
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

      return c.json({
        success: true,
        transaction,
      });
    } catch (error) {
      console.error("[API] Delete project error:", error);
      return c.json({ error: "Failed to delete project" }, 500);
    }
  });

  // Get project KV entries
  api.get("/projects/:projectId/kv", async (c) => {
    const ctx = getContext();
    if (!ctx.nearAccountId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const projectId = c.req.param("projectId");
    const limit = Math.min(Number(c.req.query("limit") || "50"), 100);

    try {
      const projectsService = new ProjectsService(ctx.db, {
        network: "mainnet",
      });
      const entries = await projectsService.getKvEntries(
        ctx.nearAccountId,
        projectId,
        limit,
      );

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
      return c.json({ error: "Failed to fetch project KV" }, 500);
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

  return api;
}
