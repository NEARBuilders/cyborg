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
      }),
    )
    .errors(CommonPluginErrors),

  // ===========================================================================
  // USER
  // ===========================================================================

  getUserRank: oc
    .route({ method: "GET", path: "/user/rank" })
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
});

export type ContractType = typeof contract;
