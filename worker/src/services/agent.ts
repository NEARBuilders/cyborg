/**
 * Agent Service for Cloudflare Workers
 *
 * Provides AI-powered chat responses via NEAR AI Cloud.
 * Adapted from api/src/services/agent.ts with Workers-compatible APIs.
 *
 * Key changes from Node.js version:
 * - Uses D1 database via Drizzle
 * - Removed Effect-TS layer pattern (not needed for per-request instantiation)
 */

import OpenAI from "openai";
import { nanoid } from "nanoid";
import { eq, desc, count, inArray, sql, or, like } from "drizzle-orm";
import type { Database } from "../db";
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
// TOOL DEFINITIONS
// =============================================================================

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  result: string;
}

/**
 * Available tools for the AI agent to discover and connect builders
 */
export const tools: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_builders",
      description: "Search for builders by interests, skills, description, or what they do. This is the main tool for discovering people based on their expertise and interests. Use this when users ask to find people with specific skills, interests, or expertise.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query - can include skills (react, python, smart contracts), interests (defi, nft, gaming), or any keywords from their profile/description",
          },
          limit: {
            type: "number",
            description: "Maximum results to return (default: 10, max: 50)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_builder_profile",
      description: "Get detailed profile for a specific builder including their description, interests (tags), social links, role (Ascendant/Initiate/Holder), and NFT avatar.",
      parameters: {
        type: "object",
        properties: {
          accountId: {
            type: "string",
            description: "NEAR account ID (e.g., 'example.near')",
          },
        },
        required: ["accountId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_legion_members",
      description: "Get a paginated list of all Legion members. Filter by role (Ascendant, Initiate, Holder) to find specific tiers of members.",
      parameters: {
        type: "object",
        properties: {
          role: {
            type: "string",
            enum: ["Ascendant", "Initiate", "Holder", "any"],
            description: "Filter by Legion rank - Ascendant (highest), Initiate, Holder, or any for all members",
          },
          limit: {
            type: "number",
            description: "Number of members to return (default: 20)",
          },
          offset: {
            type: "number",
            description: "Skip N members for pagination (default: 0)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_member_rank",
      description: "Check a member's Legion rank tier (Legendary/Mythic, Epic/Prime, Rare/Vanguard, Common/Ascendant) based on their skillcape NFTs.",
      parameters: {
        type: "object",
        properties: {
          accountId: {
            type: "string",
            description: "NEAR account ID to check",
          },
        },
        required: ["accountId"],
      },
    },
  },
];

// =============================================================================
// ERROR TYPES
// =============================================================================

export class AgentError extends Error {
  constructor(
    public code: string,
    message: string,
    public data?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AgentError";
  }
}

/**
 * Maps OpenAI API errors to AgentError for proper error handling
 */
function mapOpenAIError(error: unknown): never {
  if (error instanceof AgentError) throw error;

  if (error instanceof OpenAI.APIError) {
    if (error.status === 401) {
      throw new AgentError("UNAUTHORIZED", "Invalid NEAR AI API key");
    }
    if (error.status === 429) {
      throw new AgentError("RATE_LIMITED", "Rate limited", {
        retryAfter: parseInt(error.headers?.["retry-after"] || "60"),
      });
    }
    throw new AgentError("SERVICE_UNAVAILABLE", error.message, { retryAfter: 30 });
  }

  throw new AgentError(
    "SERVICE_UNAVAILABLE",
    error instanceof Error ? error.message : "Unknown error",
    { retryAfter: 30 }
  );
}

// =============================================================================
// SERVICE
// =============================================================================

export class AgentService {
  private client: OpenAI;

  constructor(
    private db: Database,
    private config: AgentConfig,
    private nearService: NearService | null
  ) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
  }

  // ===========================================================================
  // SYSTEM PROMPT GENERATION
  // ===========================================================================

  private async getSystemPrompt(nearAccountId: string): Promise<string> {
    const basePrompt = `You are a helpful AI assistant for the Near Legion community.

**You have access to tools that can:**
- Search for builders by interests, skills, and what they do
- Get detailed profiles for specific builders (including NFT avatars!)
- List Legion members by rank (Ascendant, Initiate, Holder)
- Check member rank tiers

**When presenting builders to users:**
- Always use markdown formatting for better readability
- Include their NFT avatar image if available
- Highlight their role (Ascendant, Initiate, Holder)
- Show their key interests and skills
- Mention their social links (github, twitter)
- Present in a visually appealing way with bullet points and formatting

Example format:
### **@builder.near** 🔥 Ascendant
![Avatar](https://...)
- **Skills:** React, TypeScript, Smart Contracts
- **Interests:** DeFi, NFTs, Gaming
- **GitHub:** [@username](https://github.com/...)

When users ask about finding people, connecting with others, or discovering builders with specific skills/interests, use the available tools to search the builder database and provide helpful recommendations in a visually engaging format.`;

    if (!this.nearService) {
      return basePrompt;
    }

    try {
      const hasInitiate = await this.nearService.hasInitiateToken(nearAccountId);

      if (!hasInitiate) {
        return `${basePrompt}

Welcome to Near Legion! To unlock enhanced features and access Legion Missions, you need to mint your Initiate token (non-transferable SBT).

**STEP 1:** Go to https://nearlegion.com/mint
**STEP 2:** Connect your wallet (make sure you have some NEAR)
**STEP 3:** Make the pledge
**STEP 4:** Join the Telegram and fill out the form

Once you've minted your Initiate token, you'll be able to earn rank skillcapes by completing missions across 5 skill tracks (Amplifier, Power User, Builder, Connector, Chaos Agent). Higher ranks unlock more capabilities.

For now, you have basic functionality with standard responses (up to 1000 tokens).`;
      }

      const rankData = await this.nearService.getUserRank(nearAccountId);

      if (!rankData) {
        return `${basePrompt}

Welcome, Legionnaire! You have your Initiate token. Complete missions at https://app.nearlegion.com to earn rank skillcapes and unlock enhanced capabilities.

**Current Rank:** Initiate
**Available Ranks:** Ascendant -> Vanguard -> Prime -> Mythic
**Skill Tracks:** Amplifier, Power User, Builder, Connector, Chaos Agent

Your current functionality: Standard helpful responses (up to 1000 tokens).`;
      }

      const rank = rankData.rank;

      switch (rank) {
        case "legendary":
          return `${basePrompt}

**MYTHIC RANK LEGIONNAIRE** - You have access to maximum capabilities and can provide highly detailed, comprehensive responses (up to 3000 tokens). Include explanations, code examples, and best practices when relevant.`;

        case "epic":
          return `${basePrompt}

**PRIME RANK LEGIONNAIRE** - You have enhanced capabilities and can provide detailed responses (up to 2000 tokens). Include helpful context and examples when relevant.`;

        case "rare":
          return `${basePrompt}

**VANGUARD RANK LEGIONNAIRE** - You have standard plus features and can provide good detail (up to 1500 tokens).`;

        case "common":
          return `${basePrompt}

**ASCENDANT RANK LEGIONNAIRE** - You have earned your first skillcape! You can receive helpful responses (up to 1200 tokens).`;

        default:
          return basePrompt;
      }
    } catch (error) {
      console.error("[AgentService] Error fetching rank for system prompt:", error);
      return basePrompt;
    }
  }

  // ===========================================================================
  // CORE CHAT METHODS
  // ===========================================================================

  private async resolveConversation(nearAccountId: string, conversationId?: string) {
    const convId = conversationId ?? nanoid();
    const conversation = await this.db.query.conversation.findFirst({
      where: eq(schema.conversation.id, convId),
    });

    if (conversation && conversation.nearAccountId !== nearAccountId) {
      throw new AgentError("FORBIDDEN", "Access denied");
    }

    return { convId, isNew: !conversation };
  }

  private async buildChatContext(
    nearAccountId: string,
    userMessage: string,
    conversationId?: string
  ) {
    const { convId, isNew } = await this.resolveConversation(nearAccountId, conversationId);
    const now = new Date();
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

    if (params.isNew) {
      await this.db.insert(schema.conversation).values({
        id: params.convId,
        nearAccountId: params.nearAccountId,
        title: params.userMessage.slice(0, 100),
        createdAt: params.createdAt,
        updatedAt: params.createdAt,
      });
    } else {
      await this.db
        .update(schema.conversation)
        .set({ updatedAt: params.createdAt })
        .where(eq(schema.conversation.id, params.convId));
    }

    await this.db.insert(schema.message).values({
      id: userMsgId,
      conversationId: params.convId,
      role: "user",
      content: params.userMessage,
      createdAt: params.createdAt,
    });

    return userMsgId;
  }

  private async persistAssistantMessage(params: {
    convId: string;
    assistantMessageId: string;
    content: string;
    createdAt: Date;
  }) {
    await this.db
      .update(schema.conversation)
      .set({ updatedAt: params.createdAt })
      .where(eq(schema.conversation.id, params.convId));

    await this.db.insert(schema.message).values({
      id: params.assistantMessageId,
      conversationId: params.convId,
      role: "assistant",
      content: params.content,
      createdAt: params.createdAt,
    });
  }

  /**
   * Process a message and return a response (non-streaming)
   * Supports tool calling for builder discovery
   */
  async processMessage(
    nearAccountId: string,
    userMessage: string,
    conversationId?: string
  ): Promise<ChatResponse> {
    try {
      console.log("[processMessage] START:", {
        nearAccountId,
        userMessage: userMessage.slice(0, 50),
      });

      const { convId, chatMessages, now, isNew } = await this.buildChatContext(
        nearAccountId,
        userMessage,
        conversationId
      );

      await this.persistUserMessage({
        nearAccountId,
        convId,
        isNew,
        userMessage,
        createdAt: now,
      });

      console.log("[processMessage] Calling NEAR AI with tools...");

      // Initial request with tools available
      let completion = await this.client.chat.completions.create({
        model: this.config.model,
        messages: chatMessages,
        tools,
        tool_choice: "auto",
      });

      // Handle tool calls if present
      let currentMessages = [...chatMessages];
      let maxToolIterations = 5; // Prevent infinite loops
      let toolIteration = 0;

      const messageToolCalls = completion.choices[0]?.message?.tool_calls;

      while (
        messageToolCalls &&
        messageToolCalls.length > 0 &&
        toolIteration < maxToolIterations
      ) {
        const assistantMessage = completion.choices[0]!.message!;
        const toolCalls = assistantMessage.tool_calls!;

        currentMessages.push({
          role: "assistant",
          content: assistantMessage.content || "",
          tool_calls: toolCalls,
        });

        // Execute all tool calls
        for (const toolCall of toolCalls) {
          try {
            // Validate JSON before parsing
            if (!this.isValidJson(toolCall.function.arguments)) {
              console.error("[AgentService] Invalid JSON in tool call:", {
                tool: toolCall.function.name,
                arguments: toolCall.function.arguments,
              });
              currentMessages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  error: "Invalid JSON in tool call arguments",
                  tool: toolCall.function.name,
                }),
              });
              continue;
            }

            const args = JSON.parse(toolCall.function.arguments);
            const result = await this.executeToolCall({
              id: toolCall.id,
              name: toolCall.function.name,
              arguments: args,
            });

            currentMessages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: result,
            });
          } catch (toolError) {
            console.error("[AgentService] Tool execution failed:", {
              tool: toolCall.function.name,
              error: toolError,
            });
            // Return error to model so it can recover
            currentMessages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                error: toolError instanceof Error ? toolError.message : "Tool execution failed",
                tool: toolCall.function.name,
              }),
            });
          }
        }

        // Get next response from model with tool results
        completion = await this.client.chat.completions.create({
          model: this.config.model,
          messages: currentMessages,
          tools,
          tool_choice: "auto",
        });

        toolIteration++;

        // Update tool calls reference for next iteration
        const nextToolCalls = completion.choices[0]?.message?.tool_calls;
        if (!nextToolCalls || nextToolCalls.length === 0) break;
      }

      const assistantContent = completion.choices[0]?.message?.content ?? "";
      const assistantCreatedAt = new Date();
      const assistantMsgId = nanoid();

      await this.persistAssistantMessage({
        convId,
        assistantMessageId: assistantMsgId,
        content: assistantContent,
        createdAt: assistantCreatedAt,
      });

      return {
        conversationId: convId,
        message: {
          id: assistantMsgId,
          role: "assistant",
          content: assistantContent,
          createdAt: assistantCreatedAt.toISOString(),
        },
      };
    } catch (error) {
      console.error("[processMessage] Error:", error);
      return mapOpenAIError(error);
    }
  }

  /**
   * Process a message with streaming
   * Returns an async generator for SSE streaming
   * Supports tool calling for builder discovery
   */
  async *processMessageStream(
    nearAccountId: string,
    userMessage: string,
    conversationId?: string
  ): AsyncGenerator<StreamEvent> {
    const eventId = () =>
      `evt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    try {
      const { convId, chatMessages, now, isNew } = await this.buildChatContext(
        nearAccountId,
        userMessage,
        conversationId
      );

      await this.persistUserMessage({
        nearAccountId,
        convId,
        isNew,
        userMessage,
        createdAt: now,
      });

      let currentMessages = [...chatMessages];
      let maxToolIterations = 5;
      let toolIteration = 0;
      let fullContent = "";
      const assistantMsgId = nanoid();

      while (toolIteration < maxToolIterations) {
        const stream = await this.client.chat.completions.create({
          model: this.config.model,
          messages: currentMessages,
          stream: true,
          tools,
          tool_choice: "auto",
        });

        let accumulatedContent = "";
        const toolCallMap = new Map<number, OpenAI.ChatCompletionMessageToolCall>();

        // Stream the response
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;

          if (delta?.content) {
            accumulatedContent += delta.content;
            fullContent += delta.content;
            yield {
              type: "chunk",
              id: eventId(),
              data: { content: delta.content },
            };
          }

          // Accumulate tool calls by index
          if (delta?.tool_calls) {
            for (const toolCallChunk of delta.tool_calls) {
              const index = toolCallChunk.index;
              if (index === undefined) continue;

              const existing = toolCallMap.get(index);
              if (existing) {
                // Update existing tool call
                if (toolCallChunk.id) existing.id = toolCallChunk.id;
                if (toolCallChunk.function) {
                  if (toolCallChunk.function.name) existing.function.name = toolCallChunk.function.name;
                  if (toolCallChunk.function.arguments) {
                    existing.function.arguments += toolCallChunk.function.arguments;
                  }
                }
              } else {
                // Create new tool call
                toolCallMap.set(index, {
                  id: toolCallChunk.id || "",
                  type: toolCallChunk.type || "function",
                  function: {
                    name: toolCallChunk.function?.name || "",
                    arguments: toolCallChunk.function?.arguments || "",
                  },
                });
              }
            }
          }
        }

        const accumulatedToolCalls = Array.from(toolCallMap.values());

        // Check if model wants to call tools
        if (accumulatedToolCalls.length > 0) {
          // Validate all tool calls have complete JSON arguments
          const validToolCalls: OpenAI.ChatCompletionMessageToolCall[] = [];
          let hasInvalidJson = false;

          for (const toolCall of accumulatedToolCalls) {
            if (this.isValidJson(toolCall.function.arguments)) {
              validToolCalls.push(toolCall);
            } else {
              console.warn("[AgentService] Incomplete JSON for tool call:", {
                tool: toolCall.function.name,
                arguments: toolCall.function.arguments,
              });
              hasInvalidJson = true;
            }
          }

          // Only proceed if we have valid tool calls
          if (validToolCalls.length === 0) {
            // All tool calls have invalid JSON, break and let the model respond normally
            console.warn("[AgentService] No valid tool calls, breaking loop");
            break;
          }

          // Yield a special event indicating tools are being used
          yield {
            type: "chunk",
            id: eventId(),
            data: { content: "\n\n🔍 Searching builders database...\n\n" },
          };

          currentMessages.push({
            role: "assistant",
            content: accumulatedContent,
            tool_calls: validToolCalls,
          });

          // Execute all valid tool calls
          for (const toolCall of validToolCalls) {
            try {
              const args = JSON.parse(toolCall.function.arguments);
              const result = await this.executeToolCall({
                id: toolCall.id,
                name: toolCall.function.name,
                arguments: args,
              });

              currentMessages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: result,
              });
            } catch (toolError) {
              console.error("[AgentService] Tool execution failed:", {
                tool: toolCall.function.name,
                error: toolError,
              });
              // Return error to model so it can recover
              currentMessages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  error: toolError instanceof Error ? toolError.message : "Tool execution failed",
                  tool: toolCall.function.name,
                }),
              });
            }
          }

          toolIteration++;
        } else {
          // No tool calls, we're done
          break;
        }
      }

      const assistantCreatedAt = new Date();

      await this.persistAssistantMessage({
        convId,
        assistantMessageId: assistantMsgId,
        content: fullContent,
        createdAt: assistantCreatedAt,
      });

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
      try {
        mapOpenAIError(error);
      } catch (agentError) {
        const safeMessage =
          agentError instanceof AgentError
            ? agentError.message
            : "Chat stream failed";
        yield {
          type: "error",
          id: eventId(),
          data: { message: safeMessage },
        };
      }
    }
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
      messageStats.map((stat) => [stat.conversationId, stat])
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
      throw new AgentError("FORBIDDEN", "Access denied");
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

  // ===========================================================================
  // TOOL HANDLERS - Functions the AI can call
  // ===========================================================================

  /**
   * Validate if a string is complete, valid JSON
   */
  private isValidJson(str: string): boolean {
    if (!str || str.trim().length === 0) return false;

    // Quick check for common incomplete JSON patterns
    const trimmed = str.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return false;

    // Count braces to ensure they're balanced
    let braceCount = 0;
    let inString = false;
    let escaped = false;

    for (const char of trimmed) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
      }
    }

    if (braceCount !== 0) return false;

    // Try to parse - this is the final validation
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Search builders by interests, skills, or description
   */
  private async searchBuilders(params: {
    query: string;
    limit?: number;
  }): Promise<string> {
    const query = params.query.trim().toLowerCase();
    const limit = Math.min(params.limit || 10, 50);

    if (query.length < 2) {
      return "Error: Query must be at least 2 characters";
    }

    try {
      // Search in profiles table for matching descriptions, names, or tags
      const results = await this.db
        .select({
          accountId: schema.nearSocialProfiles.accountId,
          name: schema.nearSocialProfiles.name,
          description: schema.nearSocialProfiles.description,
          profileData: schema.nearSocialProfiles.profileData,
          image: schema.nearSocialProfiles.image,
          nftAvatarUrl: schema.nearSocialProfiles.nftAvatarUrl,
        })
        .from(schema.nearSocialProfiles)
        .where(
          or(
            like(schema.nearSocialProfiles.description, `%${query}%`),
            like(schema.nearSocialProfiles.name, `%${query}%`),
            like(schema.nearSocialProfiles.accountId, `%${query}%`)
          )
        )
        .limit(limit);

      if (results.length === 0) {
        return `No builders found matching "${params.query}". Try different keywords like specific technologies (react, rust, defi) or broader terms.`;
      }

      const builders = await Promise.all(
        results.map(async (profile) => {
          const profileData = JSON.parse(profile.profileData);
          const holderData = await this.db.query.legionHolders.findFirst({
            where: eq(schema.legionHolders.accountId, profile.accountId),
          });

          let role = "Member";
          let roleEmoji = "";
          if (holderData) {
            if (holderData.contractId === "ascendant.nearlegion.near") {
              role = "Ascendant";
              roleEmoji = "🔥";
            }
            else if (holderData.contractId === "initiate.nearlegion.near") {
              role = "Initiate";
              roleEmoji = "⚡";
            }
            else {
              role = "Holder";
              roleEmoji = "💎";
            }
          }

          // Use NFT avatar if available, otherwise fall back to profile image
          const avatar = profile.nftAvatarUrl || profile.image || profileData?.image?.url ||
            (profileData?.image?.ipfs_cid
              ? `https://ipfs.near.social/ipfs/${profileData.image.ipfs_cid}`
              : `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.accountId}`);

          const displayName = profile.name || profile.accountId.split(".")[0];
          const tags = profileData?.tags ? Object.keys(profileData.tags) : [];
          const github = profileData?.linktree?.github;
          const twitter = profileData?.linktree?.twitter;
          const website = profileData?.linktree?.website;

          // Build markdown card for this builder
          let markdown = `### **${roleEmoji} @${profile.accountId}**\n`;
          if (role !== "Member") {
            markdown += `###### **${role}**\n`;
          }
          markdown += `![${displayName}](${avatar})\n\n`;

          if (profile.description) {
            markdown += `${profile.description}\n\n`;
          }

          if (tags.length > 0) {
            markdown += `**Interests:** ${tags.map(t => `\`${t}\``).join(", ")}\n\n`;
          }

          if (github || twitter || website) {
            markdown += `**Connect:** `;
            const links = [];
            if (github) links.push(`[GitHub](https://github.com/${github})`);
            if (twitter) links.push(`[Twitter](https://twitter.com/${twitter})`);
            if (website) links.push(`[Website](${website})`);
            markdown += links.join(" • ");
            markdown += "\n";
          }

          return markdown;
        })
      );

      return `Found ${builders.length} builder${builders.length === 1 ? '' : 's'} matching "${params.query}":\n\n` + builders.join("\n\n---\n\n");
    } catch (error) {
      console.error("[searchBuilders] Error:", error);
      return "Failed to search builders. Please try again.";
    }
  }

  /**
   * Get detailed builder profile
   */
  private async getBuilderProfile(params: { accountId: string }): Promise<string> {
    try {
      const profile = await this.db.query.nearSocialProfiles.findFirst({
        where: eq(schema.nearSocialProfiles.accountId, params.accountId),
      });

      if (!profile) {
        return `No profile found for ${params.accountId}`;
      }

      const profileData = JSON.parse(profile.profileData);
      const holdings = await this.db.query.legionHolders.findMany({
        where: eq(schema.legionHolders.accountId, params.accountId),
      });

      let role = "Member";
      let roleEmoji = "👤";
      let isLegion = false;
      let isInitiate = false;

      for (const h of holdings) {
        if (h.contractId === "ascendant.nearlegion.near") {
          role = "Ascendant";
          roleEmoji = "🔥";
          isLegion = true;
        }
        else if (h.contractId === "initiate.nearlegion.near") {
          isInitiate = true;
        }
      }

      if (isInitiate && !isLegion) {
        role = "Initiate";
        roleEmoji = "⚡";
      }
      else if (!isLegion && !isInitiate && holdings.length > 0) {
        role = "Holder";
        roleEmoji = "💎";
      }

      // Use NFT avatar if available
      const avatar = profile.nftAvatarUrl || profile.image || profileData?.image?.url ||
        (profileData?.image?.ipfs_cid
          ? `https://ipfs.near.social/ipfs/${profileData.image.ipfs_cid}`
          : `https://api.dicebear.com/7.x/avataaars/svg?seed=${params.accountId}`);

      const displayName = profile.name || params.accountId.split(".")[0];
      const tags = profileData?.tags ? Object.keys(profileData.tags) : [];
      const github = profileData?.linktree?.github;
      const twitter = profileData?.linktree?.twitter;
      const website = profileData?.linktree?.website;
      const telegram = profileData?.linktree?.telegram;

      // Build detailed markdown profile
      let markdown = `### **${roleEmoji} @${params.accountId}**\n`;
      markdown += `###### **${role}**\n\n`;
      markdown += `![${displayName}](${avatar})\n\n`;

      if (profile.description) {
        markdown += `**Bio:** ${profile.description}\n\n`;
      }

      if (tags.length > 0) {
        markdown += `**Interests:** ${tags.map(t => `\`${t}\``).join(", ")}\n\n`;
      }

      // Contracts held
      if (holdings.length > 0) {
        markdown += `**NFTs Held:**\n`;
        for (const h of holdings) {
          markdown += `- \`${h.contractId}\` (Qty: ${h.quantity})\n`;
        }
        markdown += "\n";
      }

      // Social links
      if (github || twitter || website || telegram) {
        markdown += `**Connect:**\n`;
        if (github) markdown += `- [GitHub](https://github.com/${github})\n`;
        if (twitter) markdown += `- [Twitter](https://twitter.com/${twitter})\n`;
        if (telegram) markdown += `- [Telegram](${telegram})\n`;
        if (website) markdown += `- [Website](${website})\n`;
      }

      return markdown;
    } catch (error) {
      console.error("[getBuilderProfile] Error:", error);
      return "Failed to fetch profile. Please try again.";
    }
  }

  /**
   * List Legion members with optional role filter
   */
  private async listLegionMembers(params: {
    role?: string;
    limit?: number;
    offset?: number;
  }): Promise<string> {
    const limit = Math.min(params.limit || 20, 100);
    const offset = params.offset || 0;

    try {
      const holders = await this.db.query.legionHolders.findMany({
        limit,
        offset,
      });

      // Group by account and determine role
      const accountMap = new Map<string, { contracts: string[] }>();

      for (const holder of holders) {
        const existing = accountMap.get(holder.accountId);
        if (existing) {
          existing.contracts.push(holder.contractId);
        } else {
          accountMap.set(holder.accountId, { contracts: [holder.contractId] });
        }
      }

      // Filter by role if specified
      const filteredAccounts: Array<{ accountId: string; role: string; roleEmoji: string }> = [];

      for (const [accountId, { contracts }] of accountMap) {
        let role = "Holder";
        let roleEmoji = "💎";
        if (contracts.includes("ascendant.nearlegion.near")) {
          role = "Ascendant";
          roleEmoji = "🔥";
        }
        else if (contracts.includes("initiate.nearlegion.near")) {
          role = "Initiate";
          roleEmoji = "⚡";
        }

        if (params.role && params.role !== "any" && role !== params.role) {
          continue;
        }

        filteredAccounts.push({ accountId, role, roleEmoji });
      }

      if (filteredAccounts.length === 0) {
        return `No Legion members found${params.role && params.role !== "any" ? ` with role "${params.role}"` : ""}.`;
      }

      // Fetch profiles for filtered accounts and build markdown
      const memberCards = await Promise.all(
        filteredAccounts.slice(0, limit).map(async ({ accountId, role, roleEmoji }) => {
          const profile = await this.db.query.nearSocialProfiles.findFirst({
            where: eq(schema.nearSocialProfiles.accountId, accountId),
          });

          const profileData = profile?.profileData ? JSON.parse(profile.profileData) : null;
          const displayName = profile?.name || accountId.split(".")[0];
          const tags = profileData?.tags ? Object.keys(profileData.tags) : [];

          // Use NFT avatar if available
          const avatar = profile?.nftAvatarUrl || profile?.image || profileData?.image?.url ||
            (profileData?.image?.ipfs_cid
              ? `https://ipfs.near.social/ipfs/${profileData.image.ipfs_cid}`
              : `https://api.dicebear.com/7.x/avataaars/svg?seed=${accountId}`);

          let markdown = `### **${roleEmoji} @${accountId}**\n`;
          markdown += `###### **${role}**\n\n`;
          markdown += `![${displayName}](${avatar})\n\n`;

          if (profile?.description) {
            markdown += `${profile.description}\n\n`;
          }

          if (tags.length > 0) {
            markdown += `**Interests:** ${tags.map(t => `\`${t}\``).join(", ")}\n\n`;
          }

          return markdown;
        })
      );

      const roleFilter = params.role && params.role !== "any" ? ` with role **${params.role}**` : "";
      return `Found ${memberCards.length} Legion member${memberCards.length === 1 ? '' : 's'}${roleFilter}:\n\n` + memberCards.join("\n\n---\n\n");
    } catch (error) {
      console.error("[listLegionMembers] Error:", error);
      return "Failed to list members. Please try again.";
    }
  }

  /**
   * Get member's rank tier
   */
  private async getMemberRank(params: { accountId: string }): Promise<string> {
    if (!this.nearService) {
      return "Rank service not available";
    }

    try {
      const rankData = await this.nearService.getUserRank(params.accountId);

      if (!rankData) {
        return `**@${params.accountId}** doesn't have a rank skillcape yet. Complete missions at https://app.nearlegion.com to earn ranks!`;
      }

      const rankDisplay: Record<string, string> = {
        legendary: "🏆 Legendary / Mythic",
        epic: "⭐ Epic / Prime",
        rare: "💫 Rare / Vanguard",
        common: "🌟 Common / Ascendant",
      };

      return `**@${params.accountId}** has the rank: ${rankDisplay[rankData.rank] || rankData.rank}\n\nToken ID: \`${rankData.tokenId}\``;
    } catch (error) {
      console.error("[getMemberRank] Error:", error);
      return "Failed to fetch rank. Please try again.";
    }
  }

  /**
   * Execute a tool call and return the result
   */
  async executeToolCall(toolCall: ToolCall): Promise<string> {
    const { name, arguments: args } = toolCall;

    console.log(`[executeToolCall] ${name}:`, args);

    switch (name) {
      case "search_builders":
        return this.searchBuilders(args as { query: string; limit?: number });

      case "get_builder_profile":
        return this.getBuilderProfile(args as { accountId: string });

      case "list_legion_members":
        return this.listLegionMembers(args as {
          role?: string;
          limit?: number;
          offset?: number;
        });

      case "get_member_rank":
        return this.getMemberRank(args as { accountId: string });

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  }
}

/**
 * Create an AgentService instance (returns null if API key not configured)
 */
export function createAgentService(
  db: Database,
  config: { apiKey?: string; baseUrl: string; model: string },
  nearService: NearService | null
): AgentService | null {
  if (!config.apiKey) {
    console.log("[AgentService] API key not provided - service unavailable");
    return null;
  }

  return new AgentService(
    db,
    {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
    },
    nearService
  );
}
