/**
 * Agent Service
 *
 * Provides AI-powered chat responses.
 */

import OpenAI from "openai";
import { nanoid } from "nanoid";
import { eq, desc, count, inArray, sql } from "drizzle-orm";
import { ORPCError } from "every-plugin/orpc";
import { Context, Layer, Effect } from "every-plugin/effect";
import type { Database as DrizzleDatabase } from "../db";
import * as schema from "../db/schema";
import type { NearService } from "./near";

// =============================================================================
// TYPES
// =============================================================================

export interface AgentConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface ChatResponse {
  conversationId: string;
  message: {
    id: string;
    role: "assistant";
    content: string;
    createdAt: string;
  };
}

export interface StreamChunkData {
  content: string;
}

export interface StreamCompleteData {
  conversationId: string;
  messageId: string;
}

export interface StreamErrorData {
  message: string;
}

export type StreamEvent =
  | { type: "chunk"; id: string; data: StreamChunkData }
  | { type: "complete"; id: string; data: StreamCompleteData }
  | { type: "error"; id: string; data: StreamErrorData };

// =============================================================================
// SYSTEM PROMPT (Dynamic based on NFT rank)
// =============================================================================

// =============================================================================
// ERROR MAPPING
// =============================================================================

/**
 * Maps OpenAI API errors to ORPCError types for proper error handling
 */
function mapOpenAIError(error: unknown): never {
  if (error instanceof ORPCError) throw error;

  if (error instanceof OpenAI.APIError) {
    if (error.status === 401) {
      throw new ORPCError("UNAUTHORIZED", {
        message: "Invalid NEAR AI API key",
      });
    }
    if (error.status === 429) {
      throw new ORPCError("RATE_LIMITED", {
        data: {
          retryAfter: parseInt(error.headers?.["retry-after"] || "60"),
          limitType: "requests" as const,
        },
      });
    }
    throw new ORPCError("SERVICE_UNAVAILABLE", {
      message: error.message,
      data: { retryAfter: 30 },
    });
  }

  throw new ORPCError("SERVICE_UNAVAILABLE", {
    message: error instanceof Error ? error.message : "Unknown error",
    data: { retryAfter: 30 },
  });
}

// =============================================================================
// SERVICE
// =============================================================================

export class AgentService {
  private client: OpenAI;

  constructor(
    private db: DrizzleDatabase,
    private config: AgentConfig,
    private nearService: NearService | null,
  ) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
  }

  // ===========================================================================
  // SYSTEM PROMPT GENERATION
  // ===========================================================================

  /**
   * Get dynamic system prompt based on user's NFT rank
   */
  private async getSystemPrompt(nearAccountId: string): Promise<string> {
    // Base prompt
    const basePrompt = "You are a helpful AI assistant.";

    // If no NEAR service, use default
    if (!this.nearService) {
      return basePrompt;
    }

    try {
      // Check if user has the Initiate SBT (onboarding token)
      const hasInitiate = await this.nearService.hasInitiateToken(nearAccountId);

      if (!hasInitiate) {
        // User hasn't minted the initiate token yet
        return `${basePrompt}

🫡 Welcome to Near Legion! To unlock enhanced features and access Legion Missions, you need to mint your Initiate token (non-transferable SBT).

**STEP 1:** Go to https://nearlegion.com/mint
**STEP 2:** Connect your wallet (make sure you have some NEAR)
**STEP 3:** Make the pledge
**STEP 4:** Join the Telegram and fill out the form

Once you've minted your Initiate token, you'll be able to earn rank skillcapes by completing missions across 5 skill tracks (Amplifier, Power User, Builder, Connector, Chaos Agent). Higher ranks unlock more capabilities.

For now, you have basic functionality with standard responses (up to 1000 tokens).`;
      }

      // User has Initiate token, check for rank skillcapes
      const rankData = await this.nearService.getUserRank(nearAccountId);

      if (!rankData) {
        // User has Initiate but no skillcapes yet
        return `${basePrompt}

🫡 Welcome, Legionnaire! You have your Initiate token. Complete missions at https://app.nearlegion.com to earn rank skillcapes and unlock enhanced capabilities.

**Current Rank:** Initiate
**Available Ranks:** Ascendant → Vanguard → Prime → Mythic
**Skill Tracks:** Amplifier, Power User, Builder, Connector, Chaos Agent

Your current functionality: Standard helpful responses (up to 1000 tokens).`;
      }

      const rank = rankData.rank;

      // Apply functional modifications by rank
      switch (rank) {
        case "legendary":
          // Assuming "legendary" maps to Mythic (highest achievable)
          return `${basePrompt}

🔥 **MYTHIC RANK LEGIONNAIRE** – You have access to maximum capabilities and can provide highly detailed, comprehensive responses (up to 3000 tokens). Include explanations, code examples, and best practices when relevant.`;

        case "epic":
          // Assuming "epic" maps to Prime
          return `${basePrompt}

⚡ **PRIME RANK LEGIONNAIRE** – You have enhanced capabilities and can provide detailed responses (up to 2000 tokens). Include helpful context and examples when relevant.`;

        case "rare":
          // Assuming "rare" maps to Vanguard
          return `${basePrompt}

🎖️ **VANGUARD RANK LEGIONNAIRE** – You have standard plus features and can provide good detail (up to 1500 tokens).`;

        case "common":
          // Assuming "common" maps to Ascendant
          return `${basePrompt}

🌟 **ASCENDANT RANK LEGIONNAIRE** – You have earned your first skillcape! You can receive helpful responses (up to 1200 tokens).`;

        default:
          return basePrompt;
      }
    } catch (error) {
      console.error("[AgentService] Error fetching rank for system prompt:", error);
      // Graceful fallback
      return basePrompt;
    }
  }

  // ===========================================================================
  // CORE CHAT METHODS
  // ===========================================================================

  private async resolveConversation(
    nearAccountId: string,
    conversationId?: string,
  ) {
    const convId = conversationId ?? nanoid();
    const conversation = await this.db.query.conversation.findFirst({
      where: eq(schema.conversation.id, convId),
    });

    if (conversation && conversation.nearAccountId !== nearAccountId) {
      throw new ORPCError("FORBIDDEN", { message: "Access denied" });
    }

    return { convId, isNew: !conversation };
  }

  private async buildChatContext(
    nearAccountId: string,
    userMessage: string,
    conversationId?: string,
  ) {
    const { convId, isNew } = await this.resolveConversation(
      nearAccountId,
      conversationId,
    );

    const now = new Date();

    // Fetch dynamic system prompt based on NFT rank
    const systemPrompt = await this.getSystemPrompt(nearAccountId);

    const messages = await this.db.query.message.findMany({
      where: eq(schema.message.conversationId, convId),
      orderBy: [desc(schema.message.createdAt)],
      limit: 20,
    });

    const chatMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...messages.reverse().map((msg) => ({
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content,
      })),
      { role: "user", content: userMessage },
    ];

    return { convId, now, isNew, chatMessages };
  }

  private async persistUserMessage(params: {
    nearAccountId: string;
    convId: string;
    isNew: boolean;
    userMessage: string;
    createdAt: Date;
  }) {
    const userMsgId = nanoid();
    await this.db.transaction(async (tx) => {
      if (params.isNew) {
        await tx.insert(schema.conversation).values({
          id: params.convId,
          nearAccountId: params.nearAccountId,
          title: params.userMessage.slice(0, 100),
          createdAt: params.createdAt,
          updatedAt: params.createdAt,
        });
      } else {
        await tx
          .update(schema.conversation)
          .set({ updatedAt: params.createdAt })
          .where(eq(schema.conversation.id, params.convId));
      }

      await tx.insert(schema.message).values({
        id: userMsgId,
        conversationId: params.convId,
        role: "user",
        content: params.userMessage,
        createdAt: params.createdAt,
      });
    });

    return userMsgId;
  }

  private async persistAssistantMessage(params: {
    convId: string;
    assistantMessageId: string;
    content: string;
    createdAt: Date;
  }) {
    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.conversation)
        .set({ updatedAt: params.createdAt })
        .where(eq(schema.conversation.id, params.convId));

      await tx.insert(schema.message).values({
        id: params.assistantMessageId,
        conversationId: params.convId,
        role: "assistant",
        content: params.content,
        createdAt: params.createdAt,
      });
    });
  }

  /**
   * Process a message and return a response (non-streaming)
   */
  processMessage(
    nearAccountId: string,
    userMessage: string,
    conversationId?: string,
  ) {
    return Effect.tryPromise({
      try: async (): Promise<ChatResponse> => {
        console.log("[processMessage] START:", {
          nearAccountId,
          userMessage: userMessage.slice(0, 50),
        });

        try {
          const { convId, chatMessages, now, isNew } =
            await this.buildChatContext(
              nearAccountId,
              userMessage,
              conversationId,
            );
          console.log("[processMessage] Context built:", { convId, isNew });

          await this.persistUserMessage({
            nearAccountId,
            convId,
            isNew,
            userMessage,
            createdAt: now,
          });
          console.log("[processMessage] User message persisted");

          console.log("[processMessage] Calling NEAR AI...");
          const completion = await this.client.chat.completions.create({
            model: this.config.model,
            messages: chatMessages,
          });
          console.log("[processMessage] Got response from NEAR AI");

          const assistantContent =
            completion.choices[0]?.message?.content ?? "";
          const assistantCreatedAt = new Date();
          const assistantMsgId = nanoid();

          await this.persistAssistantMessage({
            convId,
            assistantMessageId: assistantMsgId,
            content: assistantContent,
            createdAt: assistantCreatedAt,
          });
          console.log("[processMessage] Assistant message persisted");

          return {
            conversationId: convId,
            message: {
              id: assistantMsgId,
              role: "assistant",
              content: assistantContent,
              createdAt: assistantCreatedAt.toISOString(),
            },
          };
        } catch (innerError) {
          console.error("[processMessage] Inner error:", innerError);
          throw innerError;
        }
      },
      catch: (error) => {
        console.error("[processMessage] Outer catch:", error);
        return mapOpenAIError(error);
      },
    });
  }

  /**
   * Process a message with streaming
   */
  processMessageStream(
    nearAccountId: string,
    userMessage: string,
    conversationId?: string,
  ) {
    const self = this;
    const eventId = () =>
      `evt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    return Effect.tryPromise({
      try: async (): Promise<AsyncGenerator<StreamEvent>> => {
        // Setup: resolve conversation and save user message
        const { convId, chatMessages, now, isNew } =
          await self.buildChatContext(
            nearAccountId,
            userMessage,
            conversationId,
          );

        await self.persistUserMessage({
          nearAccountId,
          convId,
          isNew,
          userMessage,
          createdAt: now,
        });

        // Return async generator for streaming
        async function* streamGenerator(): AsyncGenerator<StreamEvent> {
          try {
            // Stream AI response from NEAR AI
            const stream = await self.client.chat.completions.create({
              model: self.config.model,
              messages: chatMessages,
              stream: true,
            });

            let fullContent = "";
            const assistantMsgId = nanoid();

            for await (const chunk of stream) {
              const delta = chunk.choices[0]?.delta?.content;
              if (delta) {
                fullContent += delta;
                yield {
                  type: "chunk",
                  id: eventId(),
                  data: { content: delta },
                };
              }
            }

            // Store complete assistant message
            const assistantCreatedAt = new Date();

            await self.persistAssistantMessage({
              convId,
              assistantMessageId: assistantMsgId,
              content: fullContent,
              createdAt: assistantCreatedAt,
            });

            // Send completion event
            yield {
              type: "complete",
              id: eventId(),
              data: {
                conversationId: convId,
                messageId: assistantMsgId,
              },
            };
          } catch (error) {
            console.error("[AgentService] Stream failed", error);
            // Map error using our error handler
            try {
              mapOpenAIError(error);
            } catch (orpcError) {
              const safeMessage =
                orpcError instanceof ORPCError
                  ? orpcError.message
                  : "Chat stream failed";
              yield {
                type: "error",
                id: eventId(),
                data: {
                  message: safeMessage,
                },
              };
            }
          }
        }

        return streamGenerator();
      },
      catch: mapOpenAIError,
    });
  }

  /**
   * List conversations for a user
   */
  async listConversations(nearAccountId: string) {
    const conversations = await this.db.query.conversation.findMany({
      where: eq(schema.conversation.nearAccountId, nearAccountId),
      orderBy: [desc(schema.conversation.updatedAt)],
      limit: 50,
    });

    if (conversations.length === 0) {
      return [];
    }

    const conversationIds = conversations.map((conv) => conv.id);
    const messageStats = await this.db
      .select({
        conversationId: schema.message.conversationId,
        messageCount: count(schema.message.id),
        lastMessageAt: sql<Date | null>`max(${schema.message.createdAt})`,
      })
      .from(schema.message)
      .where(inArray(schema.message.conversationId, conversationIds))
      .groupBy(schema.message.conversationId);

    const statsByConversationId = new Map(
      messageStats.map((stat) => [stat.conversationId, stat]),
    );

    return conversations.map((conv) => {
      const stats = statsByConversationId.get(conv.id);
      return {
        id: conv.id,
        title: conv.title,
        messageCount: stats?.messageCount ?? 0,
        lastMessageAt: stats?.lastMessageAt?.toISOString() ?? null,
      };
    });
  }

  /**
   * Get a specific conversation with all messages
   */
  async getConversation(nearAccountId: string, conversationId: string) {
    const conversation = await this.db.query.conversation.findFirst({
      where: eq(schema.conversation.id, conversationId),
    });

    if (!conversation) {
      return null;
    }

    if (conversation.nearAccountId !== nearAccountId) {
      throw new ORPCError("FORBIDDEN", { message: "Access denied" });
    }

    const messages = await this.db.query.message.findMany({
      where: eq(schema.message.conversationId, conversationId),
      orderBy: [desc(schema.message.createdAt)],
    });

    return {
      conversation: {
        id: conversation.id,
        title: conversation.title,
        nearAccountId: conversation.nearAccountId,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
      },
      messages: messages.reverse().map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt.toISOString(),
      })),
    };
  }
}

// =============================================================================
// EFFECT LAYER
// =============================================================================

export class AgentContext extends Context.Tag("AgentService")<
  AgentContext,
  AgentService | null
>() {}

export const AgentLive = (
  db: DrizzleDatabase,
  config: { apiKey?: string; baseUrl: string; model: string },
  nearService: NearService | null,
): Layer.Layer<AgentContext, never, never> => {
  if (!config.apiKey) {
    console.log("[AgentService] API key not provided - service unavailable");
    return Layer.succeed(AgentContext, null);
  }

  // Capture apiKey in scope for type safety
  const apiKey = config.apiKey;

  const service = new AgentService(db, {
    apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
  }, nearService);
  console.log("[AgentService] Initialized with NEAR AI");
  return Layer.succeed(AgentContext, service);
};
