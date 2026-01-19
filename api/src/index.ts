import { createPlugin } from "every-plugin";
import { Effect } from "every-plugin/effect";
import type { Scope } from "every-plugin/effect";
import { ORPCError } from "every-plugin/orpc";
import { z } from "every-plugin/zod";
import { and, eq, count, desc } from "drizzle-orm";
import { contract } from "./contract";
import * as schema from "./db/schema";
import { DatabaseContext, DatabaseLive } from "./db";
import { AgentService, AgentContext, AgentLive } from "./services";
import type { Database as DrizzleDatabase } from "./db";

type PluginDeps = {
  db: DrizzleDatabase;
  agentService: AgentService | null;
};
export default createPlugin({
  variables: z.object({
    NEAR_AI_MODEL: z.string().default("deepseek-ai/DeepSeek-V3.1"),
    NEAR_AI_BASE_URL: z.string().default("https://cloud-api.near.ai/v1"),
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
    return Effect.gen(function* () {
      const dbLayer = DatabaseLive(
        config.secrets.API_DATABASE_URL,
        config.secrets.API_DATABASE_AUTH_TOKEN
      );
      const db = yield* Effect.provide(DatabaseContext, dbLayer);

      // Initialize agent service using Effect Layer
      const agentLayer = AgentLive(db, {
        apiKey: config.secrets.NEAR_AI_API_KEY,
        baseUrl: config.variables.NEAR_AI_BASE_URL,
        model: config.variables.NEAR_AI_MODEL,
      });
      const agentService = yield* Effect.provide(AgentContext, agentLayer);

      console.log("[API] Plugin initialized");

      return {
        db,
        agentService,
      };
    });
  },

  shutdown: (_context) =>
    Effect.gen(function* () {
      yield* Effect.promise(async () => console.log("[API] Plugin shutdown"));
    }),

  createRouter: (context, builder) => {
    const { agentService, db } = context;

    const requireAuth = builder.middleware(async ({ context, next }) => {
      if (!context.nearAccountId) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "Authentication required",
          data: { authType: "nearAccountId" },
        });
      }
      return next({
        context: {
          ...context,
          nearAccountId: context.nearAccountId,
          db,
        },
      });
    });

    const requireAdmin = builder.middleware(async ({ context, next }) => {
      if (!context.nearAccountId) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "Authentication required",
          data: { authType: "nearAccountId" },
        });
      }
      if (context.role !== "admin") {
        throw new ORPCError("FORBIDDEN", {
          message: "Admin role required",
        });
      }
      return next({
        context: {
          ...context,
          nearAccountId: context.nearAccountId,
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
      // KEY VALUE
      // ===========================================================================

      getValue: builder.getValue
        .use(requireAuth)
        .handler(async ({ input, context }) => {
          const entry = await context.db.query.kvStore.findFirst({
            where: and(
              eq(schema.kvStore.key, input.key),
              eq(schema.kvStore.nearAccountId, context.nearAccountId)
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
              eq(schema.kvStore.nearAccountId, context.nearAccountId)
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
              data: { retryAfter: 0 }
            });
          }

          return await Effect.runPromise(
            agentService.processMessage(
              context.nearAccountId,
              input.message,
              input.conversationId
            )
          );
        }),

      chatStream: builder.chatStream
        .use(requireAuth)
        .handler(async function* ({ input, context, signal }) {
          if (!agentService) {
            throw new ORPCError("SERVICE_UNAVAILABLE", {
              message: "NEAR AI not connected. Configure NEAR_AI_API_KEY.",
              data: { retryAfter: 0 }
            });
          }

          // Get the async generator from the Effect
          const generator = await Effect.runPromise(
            agentService.processMessageStream(
              context.nearAccountId,
              input.message,
              input.conversationId
            )
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
          const messagesToReturn = hasMore ? messages.slice(0, input.limit) : messages;

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
    };
  },
});
