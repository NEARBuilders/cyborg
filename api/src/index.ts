import { createPlugin } from "every-plugin";
import { Effect } from "every-plugin/effect";
import type { Scope } from "every-plugin/effect";
import { ORPCError } from "every-plugin/orpc";
import { z } from "every-plugin/zod";
import { and, eq, count, desc } from "drizzle-orm";
import { contract } from "./contract";
import * as schema from "./db/schema";
import { DatabaseContext, DatabaseLive } from "./db";
import {
  AgentService,
  AgentContext,
  AgentLive,
  NearService,
  NearContext,
  NearLive,
} from "./services";
import type { Database as DrizzleDatabase } from "./db";
import { handleBuildersRequest } from "./builders";

type PluginDeps = {
  db: DrizzleDatabase;
  agentService: AgentService | null;
  nearService: NearService | null;
};
export default createPlugin({
  variables: z.object({
    NEAR_AI_MODEL: z.string().default("deepseek-ai/DeepSeek-V3.1"),
    NEAR_AI_BASE_URL: z.string().default("https://cloud-api.near.ai/v1"),
    NEAR_RPC_URL: z.string().default("https://rpc.mainnet.near.org"),
    NEAR_LEGION_CONTRACT: z.string().default("ascendant.nearlegion.near"),
    NEAR_INITIATE_CONTRACT: z.string().default("initiate.nearlegion.near"),
  }),

  secrets: z.object({
    API_DATABASE_URL: z.string().default("file:./api.db"),
    API_DATABASE_AUTH_TOKEN: z.string().optional(),
    NEAR_AI_API_KEY: z.string().optional(),
  }),

  context: z.object({
    nearAccountId: z.string().optional(),
    role: z.string().optional(),
  }),

  contract,

  initialize: (config): Effect.Effect<PluginDeps, Error, Scope.Scope> => {
    console.log("[API] Initialize called with config:", {
      dbUrl: config.secrets.API_DATABASE_URL,
      hasApiKey: !!config.secrets.NEAR_AI_API_KEY,
      model: config.variables.NEAR_AI_MODEL,
    });

    return Effect.gen(function* () {
      console.log("[API] Creating database layer...");
      const dbLayer = DatabaseLive(
        config.secrets.API_DATABASE_URL,
        config.secrets.API_DATABASE_AUTH_TOKEN,
      );
      const db = yield* Effect.provide(DatabaseContext, dbLayer);
      console.log("[API] Database initialized");

      // Initialize NEAR service
      console.log("[API] Creating NEAR service...");
      const nearLayer = NearLive(db, {
        rpcUrl: config.variables.NEAR_RPC_URL,
        contractId: config.variables.NEAR_LEGION_CONTRACT,
        initiateContractId: config.variables.NEAR_INITIATE_CONTRACT,
      });
      const nearService = yield* Effect.provide(NearContext, nearLayer);
      console.log("[API] NEAR service initialized");

      // Initialize agent service with NEAR service
      console.log("[API] Creating agent service...");
      const agentLayer = AgentLive(
        db,
        {
          apiKey: config.secrets.NEAR_AI_API_KEY,
          baseUrl: config.variables.NEAR_AI_BASE_URL,
          model: config.variables.NEAR_AI_MODEL,
        },
        nearService,
      );
      const agentService = yield* Effect.provide(AgentContext, agentLayer);
      console.log("[API] Agent service initialized");

      console.log("[API] Plugin initialized successfully");

      return {
        db,
        agentService,
        nearService,
      };
    }).pipe(
      Effect.tapError((error: unknown) =>
        Effect.sync(() => {
          console.error("[API] Initialize FAILED with error:", error);
          console.error("[API] Error type:", typeof error);
          if (error instanceof Error) {
            console.error("[API] Error constructor:", error.constructor?.name);
            console.error("[API] Error message:", error.message);
            console.error("[API] Error stack:", error.stack);
          }
        }),
      ),
    );
  },

  shutdown: (_context) =>
    Effect.gen(function* () {
      yield* Effect.promise(async () => console.log("[API] Plugin shutdown"));
    }),

  createRouter: (context, builder) => {
    const { agentService, db, nearService } = context;
    const isDev = process.env.NODE_ENV !== "production";

    const requireAuth = builder.middleware(async ({ context, next }) => {
      // In dev mode, fall back to DEV_USER if no context is provided
      // This is needed because every-plugin dev server doesn't extract context from headers
      const nearAccountId =
        context.nearAccountId ||
        (isDev ? process.env.DEV_USER || "test.near" : undefined);

      if (!nearAccountId) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "Authentication required",
          data: { authType: "nearAccountId" },
        });
      }
      return next({
        context: {
          ...context,
          nearAccountId,
          db,
        },
      });
    });

    const requireAdmin = builder.middleware(async ({ context, next }) => {
      // In dev mode, fall back to DEV_USER if no context is provided
      const nearAccountId =
        context.nearAccountId ||
        (isDev ? process.env.DEV_USER || "test.near" : undefined);

      if (!nearAccountId) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "Authentication required",
          data: { authType: "nearAccountId" },
        });
      }
      // In dev mode, treat DEV_USER as admin
      const role = context.role || (isDev ? "admin" : undefined);
      if (role !== "admin") {
        throw new ORPCError("FORBIDDEN", {
          message: "Admin role required",
        });
      }
      return next({
        context: {
          ...context,
          nearAccountId,
          db,
        },
      });
    });

    return {
      // ===========================================================================
      // HEALTH
      // ===========================================================================

      ping: builder.ping.handler(async () => {
        return {
          status: "ok" as const,
          timestamp: new Date().toISOString(),
        };
      }),

      protected: builder.protected
        .use(requireAuth)
        .handler(async ({ context }) => {
          return {
            message: "This is a protected endpoint",
            accountId: context.nearAccountId,
            timestamp: new Date().toISOString(),
          };
        }),

      // ===========================================================================
      // ADMIN
      // ===========================================================================

      adminStats: builder.adminStats
        .use(requireAdmin)
        .handler(async ({ context }) => {
          // Count conversations
          const [conversationCount] = await context.db
            .select({ value: count() })
            .from(schema.conversation);

          // Count messages
          const [messageCount] = await context.db
            .select({ value: count() })
            .from(schema.message);

          // Count KV entries
          const [kvCount] = await context.db
            .select({ value: count() })
            .from(schema.kvStore);

          return {
            conversations: conversationCount?.value ?? 0,
            messages: messageCount?.value ?? 0,
            kvEntries: kvCount?.value ?? 0,
          };
        }),

      // ===========================================================================
      // USER
      // ===========================================================================

      getUserRank: builder.getUserRank
        .use(requireAuth)
        .handler(async ({ input }) => {
        if (!nearService) {
          return {
            rank: null,
            tokenId: null,
            hasNft: false,
            hasInitiate: false,
          };
        }

        try {
          // Check both initiate token and rank skillcapes
          const [hasInitiate, rankData] = await Promise.all([
            nearService.hasInitiateToken(input.accountId),
            nearService.getUserRank(input.accountId),
          ]);

          return {
            rank: rankData?.rank ?? null,
            tokenId: rankData?.tokenId ?? null,
            hasNft: rankData !== null,
            hasInitiate,
          };
        } catch (error) {
          console.error("[API] Error fetching user rank:", error);
          // Graceful fallback
          return {
            rank: null,
            tokenId: null,
            hasNft: false,
            hasInitiate: false,
          };
        }
      }),

      // ===========================================================================
      // KEY VALUE
      // ===========================================================================

      getValue: builder.getValue
        .use(requireAuth)
        .handler(async ({ input, context }) => {
          const entry = await context.db.query.kvStore.findFirst({
            where: and(
              eq(schema.kvStore.key, input.key),
              eq(schema.kvStore.nearAccountId, context.nearAccountId),
            ),
          });

          if (!entry) {
            throw new ORPCError("NOT_FOUND", {
              message: "Key not found",
            });
          }

          return {
            key: entry.key,
            value: entry.value,
            createdAt: new Date(entry.createdAt).toISOString(),
            updatedAt: new Date(entry.updatedAt).toISOString(),
          };
        }),

      setValue: builder.setValue
        .use(requireAuth)
        .handler(async ({ input, context }) => {
          const now = new Date();

          await context.db
            .insert(schema.kvStore)
            .values({
              key: input.key,
              value: input.value,
              nearAccountId: context.nearAccountId,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: [schema.kvStore.key, schema.kvStore.nearAccountId],
              set: {
                value: input.value,
                updatedAt: now,
              },
            });

          // Fetch the actual stored entry to get correct timestamps
          const entry = await context.db.query.kvStore.findFirst({
            where: and(
              eq(schema.kvStore.key, input.key),
              eq(schema.kvStore.nearAccountId, context.nearAccountId),
            ),
          });

          if (!entry) {
            throw new ORPCError("INTERNAL_SERVER_ERROR", {
              message: "Failed to persist key value entry",
            });
          }

          return {
            key: entry.key,
            value: entry.value,
            createdAt: new Date(entry.createdAt).toISOString(),
            updatedAt: new Date(entry.updatedAt).toISOString(),
          };
        }),

      // ===========================================================================
      // CHAT
      // ===========================================================================

      chat: builder.chat
        .use(requireAuth)
        .handler(async ({ input, context }) => {
          if (!agentService) {
            throw new ORPCError("SERVICE_UNAVAILABLE", {
              message: "NEAR AI not connected. Configure NEAR_AI_API_KEY.",
              data: { retryAfter: 0 },
            });
          }

          return await Effect.runPromise(
            agentService.processMessage(
              context.nearAccountId,
              input.message,
              input.conversationId,
            ),
          );
        }),

      chatStream: builder.chatStream.use(requireAuth).handler(async function* ({
        input,
        context,
        signal,
      }) {
        if (!agentService) {
          throw new ORPCError("SERVICE_UNAVAILABLE", {
            message: "NEAR AI not connected. Configure NEAR_AI_API_KEY.",
            data: { retryAfter: 0 },
          });
        }

        // Get the async generator from the Effect
        const generator = await Effect.runPromise(
          agentService.processMessageStream(
            context.nearAccountId,
            input.message,
            input.conversationId,
          ),
        );

        // Stream events from the generator
        for await (const event of generator) {
          // Check if client has disconnected
          if (signal?.aborted) {
            console.log("[API] Client disconnected, stopping stream");
            break;
          }

          yield event;
        }
      }),

      getConversation: builder.getConversation
        .use(requireAuth)
        .handler(async ({ input, context }) => {
          // Access DB directly - no AI service needed for reading conversation history
          const conversation = await context.db.query.conversation.findFirst({
            where: eq(schema.conversation.id, input.id),
          });

          if (!conversation) {
            throw new ORPCError("NOT_FOUND", {
              message: "Conversation not found",
            });
          }

          // Verify ownership
          if (conversation.nearAccountId !== context.nearAccountId) {
            throw new ORPCError("FORBIDDEN", { message: "Access denied" });
          }

          // Fetch limit + 1 to check if there are more messages
          const messages = await context.db.query.message.findMany({
            where: eq(schema.message.conversationId, input.id),
            orderBy: [desc(schema.message.createdAt)],
            limit: input.limit + 1,
            offset: input.offset,
          });

          const hasMore = messages.length > input.limit;
          const messagesToReturn = hasMore
            ? messages.slice(0, input.limit)
            : messages;

          return {
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
              limit: input.limit,
              offset: input.offset,
              hasMore,
            },
          };
        }),

      // ===========================================================================
      // BUILDERS
      // ===========================================================================

      getBuilders: builder.getBuilders.handler(async ({ input }) => {
        const result = await Effect.runPromise(handleBuildersRequest(input));

        if (result.success) {
          return result.data;
        } else {
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: result.error || "Failed to fetch builders data",
          });
        }
      }),

      postBuilders: builder.postBuilders.handler(async ({ input }) => {
        const result = await Effect.runPromise(handleBuildersRequest(input));

        if (result.success) {
          return result.data;
        } else {
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: result.error || "Failed to fetch builders data",
          });
        }
      }),

      getBuilderById: builder.getBuilderById.handler(async ({ input }) => {
        const request = {
          path: `collections/${input.id}`,
          params: input.params,
        };

        const result = await Effect.runPromise(handleBuildersRequest(request));

        if (result.success) {
          return result.data;
        } else {
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: result.error || "Failed to fetch builder data",
          });
        }
      }),
    };
  },
});
