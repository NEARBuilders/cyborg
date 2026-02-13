import { createPlugin } from "every-plugin";
import { Effect } from "every-plugin/effect";
import type { Scope } from "every-plugin/effect";
import { ORPCError } from "every-plugin/orpc";
import { z } from "every-plugin/zod";
import { and, eq, count, desc, like } from "drizzle-orm";
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
  EmailService,
  EmailContext,
  EmailLive,
  EmailMock,
  SocialService,
  SocialContext,
  SocialLive,
  ProjectsService,
  ProjectsContext,
  ProjectsLive,
} from "./services";
import type { Database as DrizzleDatabase } from "./db";
import { handleBuildersRequest } from "./builders";

type PluginDeps = {
  db: DrizzleDatabase;
  agentService: AgentService | null;
  nearService: NearService | null;
  emailService: EmailService | null;
  socialService: SocialService | null;
  projectsService: ProjectsService | null;
};
export default createPlugin({
  variables: z.object({
    NEAR_AI_MODEL: z.string().default("deepseek-ai/DeepSeek-V3.1"),
    NEAR_AI_BASE_URL: z.string().default("https://cloud-api.near.ai/v1"),
    NEAR_RPC_URL: z.string().default("https://rpc.mainnet.near.org"),
    NEAR_LEGION_CONTRACT: z.string().default("ascendant.nearlegion.near"),
    NEAR_INITIATE_CONTRACT: z.string().default("initiate.nearlegion.near"),
    NEAR_FASTDATA_CONTRACT: z.string().default("contextual.near"),
    NEAR_FASTDATA_API_URL: z.string().optional(),
  }),

  secrets: z.object({
    API_DATABASE_URL: z.string().default("file:./api.db"),
    API_DATABASE_AUTH_TOKEN: z.string().optional(),
    NEAR_AI_API_KEY: z.string().optional(),
    NEAR_EMAIL_PAYMENT_KEY: z.string().optional(),
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
      hasEmailKey: !!config.secrets.NEAR_EMAIL_PAYMENT_KEY,
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

      // Initialize email service
      console.log("[API] Creating email service...");
      const emailLayer = config.secrets.NEAR_EMAIL_PAYMENT_KEY
        ? EmailLive({ paymentKey: config.secrets.NEAR_EMAIL_PAYMENT_KEY })
        : EmailMock;
      const emailService = yield* Effect.provide(EmailContext, emailLayer);
      console.log("[API] Email service initialized");

      // Initialize social service
      console.log("[API] Creating social service...");
      const socialLayer = SocialLive(db, {
        network: "mainnet",
        rpcUrl: config.variables.NEAR_RPC_URL,
        fastDataContract:
          config.variables.NEAR_FASTDATA_CONTRACT || "contextual.near",
        fastdataApiUrl: config.variables.NEAR_FASTDATA_API_URL,
      });
      const socialService = yield* Effect.provide(SocialContext, socialLayer);
      console.log("[API] Social service initialized");

      // Initialize projects service
      console.log("[API] Creating projects service...");
      const projectsLayer = ProjectsLive(db, {
        network: "mainnet",
        rpcUrl: config.variables.NEAR_RPC_URL,
        fastDataContract:
          config.variables.NEAR_FASTDATA_CONTRACT || "contextual.near",
        fastdataApiUrl: config.variables.NEAR_FASTDATA_API_URL,
      });
      const projectsService = yield* Effect.provide(
        ProjectsContext,
        projectsLayer,
      );
      console.log("[API] Projects service initialized");

      console.log("[API] Plugin initialized successfully");

      return {
        db,
        agentService,
        nearService,
        emailService,
        socialService,
        projectsService,
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
    const {
      agentService,
      db,
      nearService,
      emailService,
      socialService,
      projectsService,
    } = context;
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
            projects: 0, // Projects stored on blockchain, not in DB
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

      // ===========================================================================
      // EMAIL
      // ===========================================================================

      sendEmail: builder.sendEmail
        .use(requireAuth)
        .handler(async ({ input }) => {
          if (!emailService) {
            throw new ORPCError("SERVICE_UNAVAILABLE", {
              message: "Email service not available",
            });
          }

          return await Effect.runPromise(
            emailService.sendEmail(input.to, input.subject, input.body),
          );
        }),

      getMessages: builder.getMessages
        .use(requireAuth)
        .handler(async ({ input, context }) => {
          // For now, return empty array
          // TODO: Implement actual message fetching from near.email
          return {
            messages: [],
          };
        }),

      // ===========================================================================
      // SOCIAL GRAPH
      // ===========================================================================

      followUser: builder.followUser
        .use(requireAuth)
        .handler(async ({ input, context }) => {
          if (!socialService) {
            throw new ORPCError("SERVICE_UNAVAILABLE", {
              message: "Social service not available",
            });
          }

          const result = await socialService.prepareFollowTransaction(
            context.nearAccountId,
            input.targetAccountId,
          );

          if (!result.success) {
            throw new ORPCError("INTERNAL_SERVER_ERROR", {
              message: result.error || "Failed to prepare follow transaction",
            });
          }

          return {
            success: true,
            transaction: result.transaction,
          };
        }),

      unfollowUser: builder.unfollowUser
        .use(requireAuth)
        .handler(async ({ input, context }) => {
          if (!socialService) {
            throw new ORPCError("SERVICE_UNAVAILABLE", {
              message: "Social service not available",
            });
          }

          const result = await socialService.prepareUnfollowTransaction(
            context.nearAccountId,
            input.targetAccountId,
          );

          if (!result.success) {
            throw new ORPCError("INTERNAL_SERVER_ERROR", {
              message: result.error || "Failed to prepare unfollow transaction",
            });
          }

          return {
            success: true,
            transaction: result.transaction,
          };
        }),

      getFollowers: builder.getFollowers.handler(async ({ input }) => {
        if (!socialService) {
          return {
            accounts: [],
            count: 0,
            meta: { has_more: false },
          };
        }

        const result = await socialService.getFollowers(
          input.account_id,
          input.limit,
          input.offset,
          input.after_account,
        );

        // Extract just account IDs to match FastData spec
        const accounts = result.items.map((item) => item.accountId);

        return {
          accounts,
          count: result.total,
          meta: {
            has_more: result.hasMore,
            ...(result.nextCursor ? { next_cursor: result.nextCursor } : {}),
          },
        };
      }),

      getFollowing: builder.getFollowing.handler(async ({ input }) => {
        if (!socialService) {
          return {
            accounts: [],
            count: 0,
            meta: { has_more: false },
          };
        }

        const result = await socialService.getFollowing(
          input.account_id,
          input.limit,
          input.offset,
          input.after_account,
        );

        // Extract just account IDs to match FastData spec
        const accounts = result.items.map((item) => item.accountId);

        return {
          accounts,
          count: result.total,
          meta: {
            has_more: result.hasMore,
            ...(result.nextCursor ? { next_cursor: result.nextCursor } : {}),
          },
        };
      }),

      isFollowing: builder.isFollowing.handler(async ({ input }) => {
        if (!socialService) {
          return { isFollowing: false };
        }

        const isFollowing = await socialService.isFollowing(
          input.account_id,
          input.target_account_id,
        );

        return { isFollowing };
      }),

      // ===========================================================================
      // PROJECTS (FastData - client-side signing required)
      // ===========================================================================

      createProject: builder.createProject
        .use(requireAuth)
        .handler(async ({ input, context }) => {
          if (!projectsService) {
            throw new ORPCError("SERVICE_UNAVAILABLE", {
              message: "Projects service not available",
            });
          }

          const result = await projectsService.prepareCreateProjectTransaction(
            context.nearAccountId,
            {
              name: input.name,
              description: input.description,
              status: input.status || "active",
            },
          );

          if (!result.success || !result.transaction) {
            throw new ORPCError("INTERNAL_SERVER_ERROR", {
              message: result.error || "Failed to prepare transaction",
            });
          }

          // Return transaction for client-side signing
          return {
            id: result.projectId!,
            nearAccountId: context.nearAccountId,
            name: input.name,
            description: input.description || null,
            status: input.status || "active",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            transaction: result.transaction,
          };
        }),

      getProjects: builder.getProjects
        .use(requireAuth)
        .handler(async ({ input, context }) => {
          if (!projectsService) {
            return {
              projects: [],
              pagination: {
                limit: input.limit,
                offset: input.offset,
                hasMore: false,
              },
            };
          }

          const projects = await projectsService.getProjects(
            context.nearAccountId,
            input.status,
          );

          // Apply pagination
          const hasMore = input.offset + input.limit < projects.length;
          const paginatedProjects = projects.slice(
            input.offset,
            input.offset + input.limit,
          );

          return {
            projects: paginatedProjects.map((p) => ({
              id: p.id,
              nearAccountId: context.nearAccountId,
              name: p.name,
              description: p.description || null,
              status: p.status,
              createdAt: p.createdAt,
              updatedAt: p.updatedAt,
            })),
            pagination: {
              limit: input.limit,
              offset: input.offset,
              hasMore,
            },
          };
        }),

      getProject: builder.getProject
        .use(requireAuth)
        .handler(async ({ input, context }) => {
          if (!projectsService) {
            throw new ORPCError("SERVICE_UNAVAILABLE", {
              message: "Projects service not available",
            });
          }

          const project = await projectsService.getProject(
            context.nearAccountId,
            input.id,
          );

          if (!project) {
            throw new ORPCError("NOT_FOUND", {
              message: "Project not found",
            });
          }

          return {
            id: project.id,
            nearAccountId: context.nearAccountId,
            name: project.name,
            description: project.description || null,
            status: project.status,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
          };
        }),

      updateProject: builder.updateProject
        .use(requireAuth)
        .handler(async ({ input, context }) => {
          if (!projectsService) {
            throw new ORPCError("SERVICE_UNAVAILABLE", {
              message: "Projects service not available",
            });
          }

          // First, get the existing project
          const existing = await projectsService.getProject(
            context.nearAccountId,
            input.id,
          );

          if (!existing) {
            throw new ORPCError("NOT_FOUND", {
              message: "Project not found",
            });
          }

          // Prepare update transaction
          const result = await projectsService.prepareUpdateProjectTransaction(
            context.nearAccountId,
            {
              id: input.id,
              name: input.name ?? existing.name,
              description: input.description ?? existing.description,
              status: input.status ?? existing.status,
              createdAt: existing.createdAt,
              updatedAt: existing.updatedAt,
            },
          );

          if (!result.success || !result.transaction) {
            throw new ORPCError("INTERNAL_SERVER_ERROR", {
              message: result.error || "Failed to prepare transaction",
            });
          }

          // Return transaction for client-side signing
          return {
            id: input.id,
            nearAccountId: context.nearAccountId,
            name: input.name ?? existing.name,
            description: input.description ?? existing.description ?? null,
            status: input.status ?? existing.status,
            createdAt: existing.createdAt,
            updatedAt: new Date().toISOString(),
            transaction: result.transaction,
          };
        }),

      deleteProject: builder.deleteProject
        .use(requireAuth)
        .handler(async ({ input, context }) => {
          if (!projectsService) {
            throw new ORPCError("SERVICE_UNAVAILABLE", {
              message: "Projects service not available",
            });
          }

          // Verify project exists
          const existing = await projectsService.getProject(
            context.nearAccountId,
            input.id,
          );

          if (!existing) {
            throw new ORPCError("NOT_FOUND", {
              message: "Project not found",
            });
          }

          const result = await projectsService.prepareDeleteProjectTransaction(
            context.nearAccountId,
            input.id,
          );

          if (!result.success || !result.transaction) {
            throw new ORPCError("INTERNAL_SERVER_ERROR", {
              message: result.error || "Failed to prepare transaction",
            });
          }

          // Return transaction for client-side signing
          return {
            success: true,
            transaction: result.transaction,
          };
        }),

      setProjectKv: builder.setProjectKv
        .use(requireAuth)
        .handler(async ({ input, context }) => {
          if (!projectsService) {
            throw new ORPCError("SERVICE_UNAVAILABLE", {
              message: "Projects service not available",
            });
          }

          // Verify project exists
          const existing = await projectsService.getProject(
            context.nearAccountId,
            input.projectId,
          );

          if (!existing) {
            throw new ORPCError("NOT_FOUND", {
              message: "Project not found",
            });
          }

          const result = await projectsService.prepareSetProjectKvTransaction(
            context.nearAccountId,
            input.projectId,
            input.key,
            input.value,
          );

          if (!result.success || !result.transaction) {
            throw new ORPCError("INTERNAL_SERVER_ERROR", {
              message: result.error || "Failed to prepare transaction",
            });
          }

          // Return transaction for client-side signing
          return {
            projectId: input.projectId,
            key: input.key,
            value: input.value,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            transaction: result.transaction,
          };
        }),

      getProjectKv: builder.getProjectKv
        .use(requireAuth)
        .handler(async ({ input, context }) => {
          if (!projectsService) {
            throw new ORPCError("SERVICE_UNAVAILABLE", {
              message: "Projects service not available",
            });
          }

          // Verify project exists
          const existing = await projectsService.getProject(
            context.nearAccountId,
            input.projectId,
          );

          if (!existing) {
            throw new ORPCError("NOT_FOUND", {
              message: "Project not found",
            });
          }

          const kvData = await projectsService.getProjectKv(
            context.nearAccountId,
            input.projectId,
            input.key,
          );

          if (!kvData) {
            throw new ORPCError("NOT_FOUND", {
              message: "Key not found",
            });
          }

          return {
            projectId: kvData.projectId,
            key: kvData.key,
            value: kvData.value,
            createdAt: kvData.createdAt,
            updatedAt: kvData.updatedAt,
          };
        }),

      listProjectKv: builder.listProjectKv
        .use(requireAuth)
        .handler(async ({ input, context }) => {
          if (!projectsService) {
            return {
              entries: [],
              pagination: {
                limit: input.limit,
                offset: input.offset,
                hasMore: false,
              },
            };
          }

          // Verify project exists
          const existing = await projectsService.getProject(
            context.nearAccountId,
            input.projectId,
          );

          if (!existing) {
            throw new ORPCError("NOT_FOUND", {
              message: "Project not found",
            });
          }

          const entries = await projectsService.listProjectKv(
            context.nearAccountId,
            input.projectId,
            input.prefix,
          );

          // Apply pagination
          const hasMore = input.offset + input.limit < entries.length;
          const paginatedEntries = entries.slice(
            input.offset,
            input.offset + input.limit,
          );

          return {
            entries: paginatedEntries.map((e) => ({
              projectId: e.projectId,
              key: e.key,
              value: e.value,
              createdAt: e.createdAt,
              updatedAt: e.updatedAt,
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
