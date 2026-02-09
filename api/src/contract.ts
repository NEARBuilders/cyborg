import { CommonPluginErrors } from "every-plugin";
import { oc, eventIterator } from "every-plugin/orpc";
import { z } from "every-plugin/zod";

// =============================================================================
// SHARED SCHEMAS
// =============================================================================

const MessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  createdAt: z.iso.datetime(),
});

const ConversationSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  nearAccountId: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

const KeyValueSchema = z.object({
  key: z.string(),
  value: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

const ProjectSchema = z.object({
  id: z.string(),
  nearAccountId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(["active", "completed", "archived"]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

const ProjectWithTransactionSchema = z.object({
  id: z.string(),
  nearAccountId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(["active", "completed", "archived"]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  transaction: z.object({
    contractId: z.string(),
    methodName: z.string(),
    args: z.record(z.union([z.string(), z.null()])),
    gas: z.string(),
    deposit: z.string(),
  }),
});

const ProjectDeleteWithTransactionSchema = z.object({
  success: z.boolean(),
  transaction: z.object({
    contractId: z.string(),
    methodName: z.string(),
    args: z.record(z.union([z.string(), z.null()])),
    gas: z.string(),
    deposit: z.string(),
  }),
});

const ProjectKvSchema = z.object({
  projectId: z.string(),
  key: z.string(),
  value: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

const StreamChunkSchema = z.object({
  content: z.string(),
});

const StreamCompleteSchema = z.object({
  conversationId: z.string(),
  messageId: z.string(),
});

const StreamErrorSchema = z.object({
  message: z.string(),
});

const StreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("chunk"),
    id: z.string(),
    data: StreamChunkSchema,
  }),
  z.object({
    type: z.literal("complete"),
    id: z.string(),
    data: StreamCompleteSchema,
  }),
  z.object({
    type: z.literal("error"),
    id: z.string(),
    data: StreamErrorSchema,
  }),
]);

// =============================================================================
// CONTRACT
// =============================================================================

export const contract = oc.router({
  // ===========================================================================
  // HEALTH
  // ===========================================================================

  ping: oc
    .route({ method: "GET", path: "/ping" })
    .output(
      z.object({
        status: z.literal("ok"),
        timestamp: z.iso.datetime(),
      }),
    )
    .errors(CommonPluginErrors),

  protected: oc
    .route({ method: "GET", path: "/protected" })
    .output(
      z.object({
        message: z.string(),
        accountId: z.string(),
        timestamp: z.iso.datetime(),
      }),
    )
    .errors(CommonPluginErrors),

  // ===========================================================================
  // KEY VALUE
  // ===========================================================================

  getValue: oc
    .route({ method: "GET", path: "/kv/{key}" })
    .input(
      z.object({
        key: z
          .string()
          .min(1)
          .max(256)
          .regex(/^[a-zA-Z0-9_\-\.]+$/, "Key must be alphanumeric with _ - ."),
      }),
    )
    .output(KeyValueSchema)
    .errors(CommonPluginErrors),

  setValue: oc
    .route({ method: "POST", path: "/kv/{key}" })
    .input(
      z.object({
        key: z
          .string()
          .min(1)
          .max(256)
          .regex(/^[a-zA-Z0-9_\-\.]+$/, "Key must be alphanumeric with _ - ."),
        value: z.string().max(100000),
      }),
    )
    .output(KeyValueSchema)
    .errors(CommonPluginErrors),

  // ===========================================================================
  // ADMIN
  // ===========================================================================

  adminStats: oc
    .route({ method: "GET", path: "/admin/stats" })
    .output(
      z.object({
        conversations: z.number(),
        messages: z.number(),
        kvEntries: z.number(),
        projects: z.number(),
      }),
    )
    .errors(CommonPluginErrors),

  // ===========================================================================
  // USER
  // ===========================================================================

  getUserRank: oc
    .route({ method: "GET", path: "/user/rank/{accountId}" })
    .input(
      z.object({
        accountId: z.string().min(1),
      }),
    )
    .output(
      z.object({
        rank: z.enum(["legendary", "epic", "rare", "common"]).nullable(),
        tokenId: z.string().nullable(),
        hasNft: z.boolean(),
        hasInitiate: z.boolean(),
      }),
    )
    .errors(CommonPluginErrors),

  // ===========================================================================
  // BUILDERS
  // ===========================================================================

  getBuilders: oc
    .route({ method: "GET", path: "/builders" })
    .input(
      z.object({
        path: z.string().optional().default("collections"),
        params: z
          .record(
            z.string(),
            z.union([z.string(), z.number()]).transform(String),
          )
          .optional()
          .default({}),
      }),
    )
    .output(z.unknown())
    .errors(CommonPluginErrors),

  postBuilders: oc
    .route({ method: "POST", path: "/builders" })
    .input(
      z.object({
        path: z.string(),
        params: z
          .record(
            z.string(),
            z.union([z.string(), z.number()]).transform(String),
          )
          .optional()
          .default({}),
      }),
    )
    .output(z.unknown())
    .errors(CommonPluginErrors),

  getBuilderById: oc
    .route({ method: "GET", path: "/builders/{id}" })
    .input(
      z.object({
        id: z.string(),
        params: z
          .record(
            z.string(),
            z.union([z.string(), z.number()]).transform(String),
          )
          .optional()
          .default({}),
      }),
    )
    .output(z.unknown())
    .errors(CommonPluginErrors),

  // ===========================================================================
  // CHAT
  // ===========================================================================

  // Send a message and get a response
  chat: oc
    .route({ method: "POST", path: "/chat" })
    .input(
      z.object({
        message: z.string().min(1).max(10000),
        conversationId: z.string().optional(),
      }),
    )
    .output(
      z.object({
        conversationId: z.string(),
        message: MessageSchema,
      }),
    )
    .errors(CommonPluginErrors),

  // Streaming chat endpoint
  chatStream: oc
    .route({ method: "POST", path: "/chat/stream" })
    .input(
      z.object({
        message: z.string().min(1).max(10000),
        conversationId: z.string().optional(),
      }),
    )
    .output(eventIterator(StreamEventSchema))
    .errors(CommonPluginErrors),

  // Get a specific conversation with messages
  getConversation: oc
    .route({ method: "GET", path: "/conversations/{id}" })
    .input(
      z.object({
        id: z.string(),
        limit: z.number().int().min(1).max(200).default(100),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .output(
      z.object({
        conversation: ConversationSchema,
        messages: z.array(MessageSchema),
        pagination: z.object({
          limit: z.number(),
          offset: z.number(),
          hasMore: z.boolean(),
        }),
      }),
    )
    .errors(CommonPluginErrors),

  // ===========================================================================
  // EMAIL (near.email integration)
  // ===========================================================================

  sendEmail: oc
    .route({ method: "POST", path: "/email/send" })
    .input(
      z.object({
        to: z.string().min(1).max(100), // NEAR account ID
        subject: z.string().min(1).max(200),
        body: z.string().min(1).max(5000),
      }),
    )
    .output(
      z.object({
        success: z.boolean(),
        messageId: z.string().optional(),
        txHash: z.string().optional(),
      }),
    )
    .errors(CommonPluginErrors),

  getMessages: oc
    .route({ method: "GET", path: "/email/messages/{accountId}" })
    .input(
      z.object({
        accountId: z.string().min(1),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .output(
      z.object({
        messages: z.array(
          z.object({
            id: z.string(),
            from: z.string(),
            to: z.string(),
            subject: z.string(),
            body: z.string(),
            timestamp: z.string(),
            isIncoming: z.boolean(),
          })
        ),
      }),
    )
    .errors(CommonPluginErrors),

  // ===========================================================================
  // SOCIAL GRAPH (Follow/Follower System)
  // ===========================================================================

  followUser: oc
    .route({ method: "POST", path: "/social/follow" })
    .input(
      z.object({
        targetAccountId: z.string().min(1).max(256),
      })
    )
    .output(
      z.object({
        success: z.boolean(),
        transaction: z.any().optional(),
      })
    )
    .errors(CommonPluginErrors),

  unfollowUser: oc
    .route({ method: "POST", path: "/social/unfollow" })
    .input(
      z.object({
        targetAccountId: z.string().min(1).max(256),
      })
    )
    .output(
      z.object({
        success: z.boolean(),
        transaction: z.any().optional(),
      })
    )
    .errors(CommonPluginErrors),

  getFollowers: oc
    .route({ method: "GET", path: "/social/followers" })
    .input(
      z.object({
        account_id: z.string().min(1),
        contract_id: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
        after_account: z.string().optional(),
      })
    )
    .output(
      z.object({
        accounts: z.array(z.string()),
        count: z.number(),
        meta: z.object({
          has_more: z.boolean(),
          next_cursor: z.string().optional(),
          truncated: z.boolean().optional(),
        }),
      })
    )
    .errors(CommonPluginErrors),

  getFollowing: oc
    .route({ method: "GET", path: "/social/following" })
    .input(
      z.object({
        account_id: z.string().min(1),
        contract_id: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
        after_account: z.string().optional(),
      })
    )
    .output(
      z.object({
        accounts: z.array(z.string()),
        count: z.number(),
        meta: z.object({
          has_more: z.boolean(),
          next_cursor: z.string().optional(),
          truncated: z.boolean().optional(),
        }),
      })
    )
    .errors(CommonPluginErrors),

  isFollowing: oc
    .route({ method: "GET", path: "/social/is-following" })
    .input(
      z.object({
        account_id: z.string().min(1),
        target_account_id: z.string().min(1),
      })
    )
    .output(
      z.object({
        isFollowing: z.boolean(),
      })
    )
    .errors(CommonPluginErrors),

  // ===========================================================================
  // PROJECTS
  // ===========================================================================

  createProject: oc
    .route({ method: "POST", path: "/projects" })
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(1000).optional(),
        status: z.enum(["active", "completed", "archived"]).optional(),
      }),
    )
    .output(ProjectWithTransactionSchema)
    .errors(CommonPluginErrors),

  getProjects: oc
    .route({ method: "GET", path: "/projects" })
    .input(
      z.object({
        status: z.enum(["active", "completed", "archived"]).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .output(
      z.object({
        projects: z.array(ProjectSchema),
        pagination: z.object({
          limit: z.number(),
          offset: z.number(),
          hasMore: z.boolean(),
        }),
      }),
    )
    .errors(CommonPluginErrors),

  getProject: oc
    .route({ method: "GET", path: "/projects/{id}" })
    .input(
      z.object({
        id: z.string().min(1),
      }),
    )
    .output(ProjectSchema)
    .errors(CommonPluginErrors),

  updateProject: oc
    .route({ method: "PUT", path: "/projects/{id}" })
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(1000).optional(),
        status: z.enum(["active", "completed", "archived"]).optional(),
      }),
    )
    .output(ProjectWithTransactionSchema)
    .errors(CommonPluginErrors),

  deleteProject: oc
    .route({ method: "DELETE", path: "/projects/{id}" })
    .input(
      z.object({
        id: z.string().min(1),
      }),
    )
    .output(ProjectDeleteWithTransactionSchema)
    .errors(CommonPluginErrors),

  setProjectKv: oc
    .route({ method: "POST", path: "/projects/{projectId}/kv" })
    .input(
      z.object({
        projectId: z.string().min(1),
        key: z
          .string()
          .min(1)
          .max(256)
          .regex(/^[a-zA-Z0-9_\-\.\/]+$/, "Key must be alphanumeric with _ - . /"),
        value: z.string().max(100000),
      }),
    )
    .output(
      z.object({
        projectId: z.string(),
        key: z.string(),
        value: z.string(),
        createdAt: z.iso.datetime(),
        updatedAt: z.iso.datetime(),
        transaction: z.object({
          contractId: z.string(),
          methodName: z.string(),
          args: z.record(z.union([z.string(), z.null()])),
          gas: z.string(),
          deposit: z.string(),
        }),
      })
    )
    .errors(CommonPluginErrors),

  getProjectKv: oc
    .route({ method: "GET", path: "/projects/{projectId}/kv/{key}" })
    .input(
      z.object({
        projectId: z.string().min(1),
        key: z.string().min(1).max(256),
      }),
    )
    .output(ProjectKvSchema)
    .errors(CommonPluginErrors),

  listProjectKv: oc
    .route({ method: "GET", path: "/projects/{projectId}/kv" })
    .input(
      z.object({
        projectId: z.string().min(1),
        prefix: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .output(
      z.object({
        entries: z.array(ProjectKvSchema),
        pagination: z.object({
          limit: z.number(),
          offset: z.number(),
          hasMore: z.boolean(),
        }),
      }),
    )
    .errors(CommonPluginErrors),
});

export type ContractType = typeof contract;
