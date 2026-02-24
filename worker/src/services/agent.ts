// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Safely convert any value to string, preventing [object Object] errors
 * Handles objects, arrays, primitives, null, and undefined
 *
 * This function ensures that any value passed to it will be safely converted
 * to a string representation that won't result in "[object Object]"
 */
function safeStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  // For objects and arrays, use JSON.stringify
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Template tag function for safe string interpolation
 * Prevents [object Object] by safely converting all values
 *
 * Usage:
 *   safeMarkdown`Project: ${project.name}` (handles objects gracefully)
 *   safeMarkdown`Status: ${project.status}` (handles objects gracefully)
 */
function safeMarkdown(
  strings: TemplateStringsArray,
  ...values: unknown[]
): string {
  let result = "";

  for (let i = 0; i < strings.length; i++) {
    result += strings[i];

    if (i < values.length) {
      result += safeStringify(values[i]);
    }
  }

  return result;
}

/**
 * Create a safe markdown formatter that handles all object types
 * Returns an object with methods for common markdown patterns
 */
const md = {
  // Safe inline code: md.code(project.name)
  code: (value: unknown) => `\`${safeStringify(value)}\``,

  // Safe bold: md.bold(project.status)
  bold: (value: unknown) => `**${safeStringify(value)}**`,

  // Safe italic: md.italic(value)
  italic: (value: unknown) => `_${safeStringify(value)}_`,

  // Safe link: md.link(url, text)
  link: (url: unknown, text?: unknown) => {
    const safeUrl = safeStringify(url);
    const safeText = text ? safeStringify(text) : safeUrl;
    return `[${safeText}](${safeUrl})`;
  },

  // Safe image: md.image(url, alt)
  image: (url: unknown, alt?: unknown) => {
    const safeUrl = safeStringify(url);
    const safeAlt = alt ? safeStringify(alt) : "image";
    return `![${safeAlt}](${safeUrl})`;
  },

  // Safe list item: md.li(text)
  li: (value: unknown) => `- ${safeStringify(value)}`,

  // Safe header: md.h2(text)
  h2: (value: unknown) => `## ${safeStringify(value)}`,
  h3: (value: unknown) => `### ${safeStringify(value)}`,

  // Safe line break
  br: () => "\n",

  // Safe horizontal rule
  hr: () => "---",

  // Safe paragraph/line
  line: (value: unknown) => `${safeStringify(value)}\n\n`,
};

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
/**
 * Available tools for the AI agent to discover and connect builders
 * Uses DeepSeek strict mode for enhanced JSON schema validation
 */
export const tools: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_builders",
      strict: true,
      description:
        "Search for builders by interests, skills, description, or what they do. Use this as the primary tool for discovering people based on their expertise and interests.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: {
            type: "string",
            description:
              "Search query - can include skills (react, python, smart contracts), interests (defi, nft, gaming), or any keywords from their profile/description",
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
      name: "search_by_social",
      strict: true,
      description:
        "Find builders who have specific social media accounts. Returns a list of account IDs. IMPORTANT: After calling this tool, you MUST call get_builder_profile for each returned accountId to get detailed information including description, avatar, social links, and role.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          platform: {
            type: "string",
            description:
              "Social platform to search for. Options: twitter, x, telegram, github, discord, youtube, linkedin, instagram, website, or any custom platform name",
          },
          limit: {
            type: "number",
            description: "Number of results to return (default: 20, max: 100)",
          },
        },
        required: ["platform"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_by_tags",
      strict: true,
      description:
        "Find builders by their skills and interests (tags). Returns a list of account IDs. IMPORTANT: After calling this tool, you MUST call get_builder_profile for each returned accountId to get detailed information including description, avatar, social links, and role.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          tags: {
            type: "array",
            items: {
              type: "string",
            },
            description:
              "Array of tags/skills to search for (e.g., ['react', 'typescript'], ['defi', 'trading'], ['rust', 'smart contracts'])",
          },
          matchAll: {
            type: "boolean",
            description:
              "If true, only return builders who have ALL the specified tags. If false, returns builders who have ANY of the tags (default: false)",
          },
          limit: {
            type: "number",
            description: "Number of results to return (default: 20, max: 100)",
          },
        },
        required: ["tags"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_nft_holders",
      strict: true,
      description:
        "Get holders of a specific NFT contract. Shows account IDs and quantities for NFTs like nearlegion.nfts.tg, ascendant.nearlegion.near, initiate.nearlegion.near, etc.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          contractId: {
            type: "string",
            description:
              "NFT contract address (e.g., 'nearlegion.nfts.tg', 'ascendant.nearlegion.near')",
          },
          limit: {
            type: "number",
            description: "Number of holders to return (default: 20)",
          },
        },
        required: ["contractId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_builder_profile",
      strict: true,
      description:
        "Get detailed profile for a specific builder including their description, interests (tags), social links, role (Ascendant/Initiate/Holder), and NFT avatar.",
      parameters: {
        type: "object",
        additionalProperties: false,
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
      strict: true,
      description:
        "Get a paginated list of all Legion members. Filter by role (Ascendant, Initiate, Holder) to find specific tiers of members.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          role: {
            type: "string",
            enum: ["Ascendant", "Initiate", "Holder", "any"],
            description:
              "Filter by Legion rank - Ascendant (highest), Initiate, Holder, or any for all members",
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
      strict: true,
      description:
        "Check a member's Legion rank tier (Legendary/Mythic, Epic/Prime, Rare/Vanguard, Common/Ascendant) based on their skillcape NFTs.",
      parameters: {
        type: "object",
        additionalProperties: false,
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
  {
    type: "function",
    function: {
      name: "get_user_projects",
      strict: true,
      description:
        "Get all projects for a specific user including their name, description, status, cover image, GitHub links, and tags. Use this to see what someone has built.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          accountId: {
            type: "string",
            description:
              "NEAR account ID to get projects for (e.g., 'example.near')",
          },
          status: {
            type: "string",
            enum: ["active", "completed", "archived", "all"],
            description: "Filter by project status (default: 'all')",
          },
        },
        required: ["accountId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_builders_with_projects",
      strict: true,
      description:
        "Find builders who have projects created. Returns a list of account IDs. IMPORTANT: After calling this tool, you MUST call get_builder_profile for each returned accountId to get detailed information including description, avatar, social links, and role.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          status: {
            type: "string",
            enum: ["active", "completed", "archived", "all"],
            description: "Filter by project status (default: 'all')",
          },
          limit: {
            type: "number",
            description: "Number of builders to return (default: 20, max: 100)",
          },
        },
        required: [],
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
    public data?: Record<string, unknown>,
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
    throw new AgentError("SERVICE_UNAVAILABLE", error.message, {
      retryAfter: 30,
    });
  }

  throw new AgentError(
    "SERVICE_UNAVAILABLE",
    error instanceof Error ? error.message : "Unknown error",
    { retryAfter: 30 },
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

  private async getSystemPrompt(nearAccountId: string): Promise<string> {
    const basePrompt = `You are a helpful AI assistant for the Near Legion community.

**You have access to tools that can:**
- Search for builders by interests, skills, and what they do
- Search by social platforms (find people with Twitter/X, Telegram, GitHub, Discord, YouTube, LinkedIn, Instagram, etc.)
- Search by tags/skills (find people with specific interests like 'react', 'defi', 'nft', 'smart contracts', 'rust', etc.)
- Get detailed profiles for specific builders (including NFT avatars!)
- Get user projects (see what builders have created - including GitHub links and tags!)
- List Legion members by rank (Ascendant, Initiate, Holder)
- Check member rank tiers

**CRITICAL FORMATTING RULES:**

1. When tool results contain builder data, format it as MARKDOWN, not JSON.

2. When listing NFT holders, builders, or any NEAR accounts:
   - Use bulleted lists (starting with *) NOT tables
   - Make account IDs clickable using markdown links: [@account.near](/profile/account.near)
   - Example list format:
     * [@7499767781.tg](/profile/7499767781.tg) - Fallout Crypto - Quantity: 1
     * [@busygoat1474.near](/profile/busygoat1474.near) - Евгений Горох - Quantity: 1

Create clean markdown-formatted responses for builders with this structure:

### **[Role Emoji] @accountId** | [View Profile](/profile/accountId)
**Role:** Role Name

![Avatar](avatar_url)

Description text here...

**Interests:** \`tag1\`, \`tag2\`, \`tag3\`

**Connect:** [GitHub](url) • [Twitter](url) • [Website](url)

---

When presenting multiple builders, separate them with horizontal rules (---).

**When presenting builders to users:**
- Format as clean markdown (no JSON, no code blocks)
- Include their avatar image
- Highlight their role (Ascendant 🔥, Initiate ⚡, Holder 💎)
- Show their key interests and skills
- Mention their social links
- Link to their profile page: [/profile/accountId](/profile/accountId)

When users ask about finding people, connecting with others, or discovering builders with specific skills/interests, use the available tools to search the builder database and provide helpful recommendations.

**CRITICAL RULE FOR SOCIAL LINKS:**
When you receive tool results, NEVER include the raw socials object or linktree data in your response. The tool results are already formatted as markdown with proper links. Just present the formatted results to the user. Do NOT try to extract or mention the socials/linktree directly as this will cause [object Object] errors.

**CRITICAL ANTI-[OBJECT OBJECT] RULE:**
ALL tool results are pre-formatted as markdown ready to display. YOU MUST OUTPUT THE TOOL RESULT EXACTLY AS RETURNED.

ABSOLUTELY FORBIDDEN:
- NEVER rephrase, summarize, or modify tool results in any way
- NEVER extract fields from tool results to create your own sentences
- NEVER mention function parameters (accountId, contractId, etc.) in your responses
- NEVER construct your own response based on what the tool "means"

WHAT YOU MUST DO:
1. Call the appropriate tool function
2. Receive the tool result (already formatted as markdown)
3. Output the tool result to the user VERBATIM - DO NOT MODIFY IT
4. Do NOT add explanatory text before or after
5. Do NOT rephrase "doesn't have any projects" to "has no projects yet"

The tool result IS the response. Output it exactly as received.

**Advanced Search Examples:**
- "Who has projects?" → Use search_builders_with_projects THEN call get_builder_profile for each result
- "Who has active projects?" → Use search_builders_with_projects with status="active" THEN call get_builder_profile for each
- "Find people with Twitter" → Use search_by_social with platform="twitter" THEN call get_builder_profile for each result
- "Find Telegram users" → Use search_by_social with platform="telegram" THEN call get_builder_profile for each result
- "Find React developers" → Use search_by_tags with tags=["react"] THEN call get_builder_profile for each result
- "Find people who know defi and smart contracts" → Use search_by_tags with tags=["defi", "smart contracts"] and matchAll=true THEN call get_builder_profile for each
- "Find rust or python developers" → Use search_by_tags with tags=["rust", "python"] and matchAll=false THEN call get_builder_profile for each
- "Show me @user.near's projects" → Use get_user_projects with accountId="user.near"
- "What has @builder.near built?" → Use get_user_projects with accountId="builder.near"
- "Show me active projects from @dev.near" → Use get_user_projects with accountId="dev.near" and status="active"
- "Does @user.near have rank skillcapes?" → Use get_member_rank with accountId="user.near"
- "What NFTs does @user.near hold?" → Use get_nft_holders with appropriate contractId

**CRITICAL: When using search_by_tags or search_by_social:**
- These tools return a list of account IDs in JSON format
- You MUST then call get_builder_profile for EACH accountId to display full profile details
- The get_builder_profile tool returns the formatted profile card with avatar, description, tags, and social links
- Display each profile result exactly as returned by get_builder_profile
- This ensures users see the beautiful profile cards with all information

**When users ask about NFTs, ranks, or projects:**
- Call the appropriate tool function
- Display the tool result exactly as returned
- Do NOT rephrase or summarize the result
- The tool result contains all the information the user needs`;

    if (!this.nearService) {
      return basePrompt;
    }

    try {
      const hasInitiate =
        await this.nearService.hasInitiateToken(nearAccountId);

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
      console.error(
        "[AgentService] Error fetching rank for system prompt:",
        error,
      );
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
      throw new AgentError("FORBIDDEN", "Access denied");
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
    conversationId?: string,
  ): Promise<ChatResponse> {
    try {
      console.log("[processMessage] START:", {
        nearAccountId,
        userMessage: userMessage.slice(0, 50),
      });

      const { convId, chatMessages, now, isNew } = await this.buildChatContext(
        nearAccountId,
        userMessage,
        conversationId,
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
      console.log(
        "[AgentService] Sending chat request with tools:",
        JSON.stringify(tools, null, 2),
      );
      let completion = await this.client.chat.completions.create({
        model: this.config.model,
        messages: chatMessages,
        tools,
        tool_choice: "auto",
      });

      console.log("[AgentService] Received response:", {
        hasToolCalls: !!completion.choices[0]?.message?.tool_calls,
        toolCallsCount: completion.choices[0]?.message?.tool_calls?.length,
        content: completion.choices[0]?.message?.content?.slice(0, 100),
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
                error:
                  toolError instanceof Error
                    ? toolError.message
                    : "Tool execution failed",
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
    conversationId?: string,
  ): AsyncGenerator<StreamEvent> {
    const eventId = () =>
      `evt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    try {
      const { convId, chatMessages, now, isNew } = await this.buildChatContext(
        nearAccountId,
        userMessage,
        conversationId,
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
        console.log(
          `[AgentService] Tool iteration ${toolIteration + 1}/${maxToolIterations}`,
        );
        const stream = await this.client.chat.completions.create({
          model: this.config.model,
          messages: currentMessages,
          stream: true,
          tools,
          tool_choice: "auto",
        });

        let accumulatedContent = "";
        const toolCallMap = new Map<
          number,
          OpenAI.ChatCompletionMessageToolCall
        >();

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
                  if (toolCallChunk.function.name)
                    existing.function.name = toolCallChunk.function.name;
                  if (toolCallChunk.function.arguments) {
                    existing.function.arguments +=
                      toolCallChunk.function.arguments;
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

        console.log(`[AgentService] Iteration complete:`, {
          accumulatedContentLength: accumulatedContent.length,
          toolCallsCount: accumulatedToolCalls.length,
          toolCalls: accumulatedToolCalls.map((tc) => ({
            name: tc.function.name,
            hasArgs: !!tc.function.arguments,
          })),
        });

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

          console.log(
            `[AgentService] Executing ${validToolCalls.length} tools`,
          );

          yield {
            type: "chunk",
            id: eventId(),
            data: { content: "\n\n🔍 Searching...\n\n" },
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
              console.log(
                `[AgentService] Executing tool: ${safeStringify(toolCall.function.name)}`,
                args,
              );
              const result = await this.executeToolCall({
                id: toolCall.id,
                name: toolCall.function.name,
                arguments: args,
              });

              console.log(`[AgentService] Tool result length:`, result.length);

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
                  error:
                    toolError instanceof Error
                      ? toolError.message
                      : "Tool execution failed",
                  tool: toolCall.function.name,
                }),
              });
            }
          }

          toolIteration++;
          console.log(
            `[AgentService] Tool iteration complete, looping to get AI response...`,
          );
        } else {
          // No tool calls, we're done
          console.log("[AgentService] No tool calls, finishing stream");
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
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return false;

    // Count braces to ensure they're balanced
    let braceCount = 0;
    let inString = false;
    let escaped = false;

    for (const char of trimmed) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === "{") braceCount++;
        if (char === "}") braceCount--;
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
   * Returns structured JSON data for UI rendering
   */
  private async searchBuilders(params: {
    query: string;
    limit?: number;
  }): Promise<string> {
    const query = params.query.trim().toLowerCase();
    const limit = Math.min(params.limit || 10, 50);

    if (query.length < 2) {
      return JSON.stringify({ error: "Query must be at least 2 characters" });
    }

    try {
      const isHolderQuery = /holder|nft|legion|member/i.test(query);

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
            like(schema.nearSocialProfiles.accountId, `%${query}%`),
          ),
        )
        .limit(limit);

      if (results.length > 0) {
        return await this.formatBuildersAsMarkdown(
          results,
          params.query,
          limit,
        );
      }

      if (isHolderQuery) {
        const holders = await this.db.query.legionHolders.findMany({
          limit,
          offset: 0,
        });

        const accountSet = new Set<string>();
        const holderList: Array<{ accountId: string; contractId: string }> = [];

        for (const holder of holders) {
          if (!accountSet.has(holder.accountId)) {
            accountSet.add(holder.accountId);
            holderList.push(holder);
          }
          if (holderList.length >= limit) break;
        }

        const profileResults = await Promise.all(
          holderList.map(async (holder) => {
            return await this.db.query.nearSocialProfiles.findFirst({
              where: eq(schema.nearSocialProfiles.accountId, holder.accountId),
            });
          }),
        );

        const validProfiles = profileResults.filter(
          (p): p is NonNullable<typeof p> => p !== null,
        );

        if (validProfiles.length > 0) {
          return await this.formatBuildersAsMarkdown(
            validProfiles,
            `NFT holders (${params.query})`,
            limit,
          );
        }
      }

      return JSON.stringify({
        type: "error",
        message: `No builders found matching "${safeStringify(params.query)}". Try different keywords like specific technologies (react, rust, defi), account names, or ask for "NFT holders", "Legion members", "Ascendant members".`,
      });
    } catch (error) {
      console.error("[searchBuilders] Error:", error);
      return JSON.stringify({
        type: "error",
        message: "Failed to search builders. Please try again.",
      });
    }
  }

  /**
   * Search builders by social media platform
   * Returns account IDs that the AI should then fetch detailed profiles for
   */
  private async searchBySocial(params: {
    platform: string;
    limit?: number;
  }): Promise<string> {
    const platform = params.platform.toLowerCase().trim();
    const limit = Math.min(params.limit || 20, 100);

    if (platform.length < 2) {
      return JSON.stringify({
        error: "Platform must be at least 2 characters",
      });
    }

    try {
      console.log(
        `[searchBySocial] Searching for platform: ${safeStringify(platform)}`,
      );

      // Get all profiles and check their linktree/social links
      const profiles = await this.db
        .select({
          accountId: schema.nearSocialProfiles.accountId,
          name: schema.nearSocialProfiles.name,
          description: schema.nearSocialProfiles.description,
          profileData: schema.nearSocialProfiles.profileData,
          image: schema.nearSocialProfiles.image,
          nftAvatarUrl: schema.nearSocialProfiles.nftAvatarUrl,
        })
        .from(schema.nearSocialProfiles)
        .limit(500); // Get a reasonable batch to check

      // Filter profiles that have the specified social platform
      const matchingProfiles = profiles
        .filter((profile) => {
          try {
            const profileData = JSON.parse(profile.profileData);
            const linktree = profileData?.linktree || {};

            // Check if the platform exists in linktree (case-insensitive)
            const matchingKey = Object.keys(linktree).find(
              (key) =>
                key.toLowerCase() === platform ||
                key.toLowerCase().includes(platform),
            );

            return matchingKey && linktree[matchingKey];
          } catch {
            return false;
          }
        })
        .slice(0, limit);

      if (matchingProfiles.length > 0) {
        // Return a structured response that tells the AI to call get_builder_profile for each match
        const response = {
          type: "builders_found",
          count: matchingProfiles.length,
          query: `builders with ${platform}`,
          // Return just the account IDs and names - the AI will call get_builder_profile for each
          builders: matchingProfiles.map((p) => ({
            accountId: p.accountId,
            name: p.name || p.accountId.split(".")[0],
          })),
          // Instruction for the AI to call get_builder_profile for each
          instruction: `Call get_builder_profile for each accountId to get detailed information`,
        };

        return JSON.stringify(response);
      }

      return JSON.stringify({
        type: "error",
        message: `No builders found with ${safeStringify(platform)}. Try other platforms like twitter, telegram, github, discord, youtube, linkedin, instagram, or website.`,
      });
    } catch (error) {
      console.error("[searchBySocial] Error:", error);
      return JSON.stringify({
        type: "error",
        message: "Failed to search by social platform. Please try again.",
      });
    }
  }

  /**
   * Search builders by tags/skills
   * Returns account IDs that the AI should then fetch detailed profiles for
   */
  private async searchByTags(params: {
    tags: string[];
    matchAll?: boolean;
    limit?: number;
  }): Promise<string> {
    const tags = params.tags
      .map((t) => t.toLowerCase().trim())
      .filter((t) => t.length > 0);
    const matchAll = params.matchAll || false;
    const limit = Math.min(params.limit || 20, 100);

    if (tags.length === 0) {
      return JSON.stringify({ error: "At least one tag is required" });
    }

    try {
      console.log(
        `[searchByTags] Searching for tags: ${tags.join(", ")} (matchAll: ${matchAll})`,
      );

      // Get all profiles and check their tags
      const profiles = await this.db
        .select({
          accountId: schema.nearSocialProfiles.accountId,
          name: schema.nearSocialProfiles.name,
          description: schema.nearSocialProfiles.description,
          profileData: schema.nearSocialProfiles.profileData,
          image: schema.nearSocialProfiles.image,
          nftAvatarUrl: schema.nearSocialProfiles.nftAvatarUrl,
        })
        .from(schema.nearSocialProfiles)
        .limit(1000); // Get a larger batch for tag matching

      // Filter profiles that match the tag criteria
      const matchingProfiles = profiles
        .filter((profile) => {
          try {
            const profileData = JSON.parse(profile.profileData);
            const profileTags = profileData?.tags || {};
            const profileTagKeys = Object.keys(profileTags).map((t) =>
              t.toLowerCase(),
            );

            if (matchAll) {
              // Must have ALL the specified tags
              return tags.every((tag) =>
                profileTagKeys.some(
                  (pt) => pt.includes(tag) || tag.includes(pt),
                ),
              );
            } else {
              // Must have AT LEAST ONE of the specified tags
              return tags.some((tag) =>
                profileTagKeys.some(
                  (pt) => pt.includes(tag) || tag.includes(pt),
                ),
              );
            }
          } catch {
            return false;
          }
        })
        .slice(0, limit);

      if (matchingProfiles.length > 0) {
        const matchType = matchAll ? "all of" : "any of";

        // Return a structured response that tells the AI to call get_builder_profile for each match
        const response = {
          type: "builders_found",
          count: matchingProfiles.length,
          query: `builders with ${matchType}: ${tags.join(", ")}`,
          // Return just the account IDs and names - the AI will call get_builder_profile for each
          builders: matchingProfiles.map((p) => ({
            accountId: p.accountId,
            name: p.name || p.accountId.split(".")[0],
          })),
          // Instruction for the AI to call get_builder_profile for each
          instruction: `Call get_builder_profile for each accountId to get detailed information`,
        };

        return JSON.stringify(response);
      }

      return JSON.stringify({
        type: "error",
        message: `No builders found with ${tags.map((t) => safeStringify(t)).join(" or ")}. Try different tags like: react, typescript, defi, nft, rust, smart contracts, trading, gaming, etc.`,
      });
    } catch (error) {
      console.error("[searchByTags] Error:", error);
      return JSON.stringify({
        type: "error",
        message: "Failed to search by tags. Please try again.",
      });
    }
  }

  /**
   * Format builders as markdown cards
   */
  private async formatBuildersAsMarkdown(
    profiles: Array<{
      accountId: string;
      name: string | null;
      description: string | null;
      profileData: string;
      image: string | null;
      nftAvatarUrl: string | null;
    }>,
    queryTitle: string,
    limit: number,
  ): Promise<string> {
    const builders = await Promise.all(
      profiles.map(async (profile) => {
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
          } else if (holderData.contractId === "initiate.nearlegion.near") {
            role = "Initiate";
            roleEmoji = "⚡";
          } else {
            role = "Holder";
            roleEmoji = "💎";
          }
        }

        // Use NFT avatar if available
        const avatar =
          profile.nftAvatarUrl ||
          profile.image ||
          profileData?.image?.url ||
          (profileData?.image?.ipfs_cid
            ? `https://ipfs.near.social/ipfs/${profileData.image.ipfs_cid}`
            : `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.accountId}`);

        const displayName = profile.name || profile.accountId.split(".")[0];

        // Safely extract tags - ensure they're strings
        const rawTags = profileData?.tags;
        const tags: string[] = [];
        if (rawTags && typeof rawTags === "object") {
          for (const tagKey of Object.keys(rawTags)) {
            tags.push(String(tagKey));
          }
        }

        // Safely extract social links from linktree
        const linktree = profileData?.linktree || {};
        const socialLinks: string[] = [];

        // Helper function to safely extract and validate social links
        const safeSocialLink = (value: unknown): string | null => {
          const str = safeStringify(value);
          return str && str.trim() ? str.trim() : null;
        };

        // Build social links only if they're non-empty strings
        const github = safeSocialLink(linktree.github);
        if (github) {
          socialLinks.push(`[GitHub](https://github.com/${github})`);
        }

        const twitter = safeSocialLink(linktree.twitter);
        if (twitter) {
          socialLinks.push(`[Twitter](https://twitter.com/${twitter})`);
        }

        const website = safeSocialLink(linktree.website);
        if (website) {
          const url = website.startsWith("http")
            ? website
            : `https://${website}`;
          socialLinks.push(`[Website](${url})`);
        }

        const telegram = safeSocialLink(linktree.telegram);
        if (telegram) {
          socialLinks.push(`[Telegram](https://t.me/${telegram})`);
        }

        // Add any other social platforms
        Object.entries(linktree).forEach(([platform, url]) => {
          if (
            platform !== "github" &&
            platform !== "twitter" &&
            platform !== "website" &&
            platform !== "telegram"
          ) {
            const safeUrl = safeSocialLink(url);
            if (safeUrl) {
              const platformName =
                platform.charAt(0).toUpperCase() + platform.slice(1);
              const finalUrl = safeUrl.startsWith("http")
                ? safeUrl
                : `https://${safeUrl}`;
              socialLinks.push(`[${platformName}](${finalUrl})`);
            }
          }
        });

        // Build markdown card for this builder
        let markdown = `### **${safeStringify(roleEmoji)} @${safeStringify(profile.accountId)}**\n`;
        if (role !== "Member") {
          markdown += `###### **${safeStringify(role)}**\n`;
        }
        // Display avatar with clickable link below
        const explorerLink = `https://explorer.oneverse.near.org/accounts/${safeStringify(profile.accountId)}?tab=nfts`;
        markdown += `![${safeStringify(displayName)}](${safeStringify(avatar)})\n\n`;
        markdown += `🔗 **[View NFTs on NEAR Explorer](${explorerLink})**\n\n`;

        if (profile.description) {
          markdown += `${safeStringify(profile.description)}\n\n`;
        }

        // Add clickable NFT link if holder
        if (role !== "Member" && holderData) {
          markdown += `**🔗 View NFTs on [NEAR Explorer](${safeStringify(explorerLink)})**\n\n`;
        }

        if (tags.length > 0) {
          markdown += `**Interests:** ${tags.map((t) => `\`${safeStringify(t)}\``).join(", ")}\n\n`;
        }

        if (socialLinks.length > 0) {
          markdown += `**Connect:** ${socialLinks.join(" • ")}\n\n`;
        }

        return markdown;
      }),
    );

    return (
      `Found ${builders.length} builder${builders.length === 1 ? "" : "s"} matching "${queryTitle}":\n\n` +
      builders.join("\n\n---\n\n")
    );
  }

  /**
   * Get detailed builder profile - Returns markdown
   */
  private async getBuilderProfile(params: {
    accountId: string;
  }): Promise<string> {
    try {
      // Defensive: ensure accountId is a string
      const accountId = safeStringify(params.accountId);

      const profile = await this.db.query.nearSocialProfiles.findFirst({
        where: eq(schema.nearSocialProfiles.accountId, accountId),
      });

      if (!profile) {
        return `No profile found for ${accountId}`;
      }

      const profileData = JSON.parse(profile.profileData);
      const holdings = await this.db.query.legionHolders.findMany({
        where: eq(schema.legionHolders.accountId, accountId),
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
        } else if (h.contractId === "initiate.nearlegion.near") {
          isInitiate = true;
        }
      }

      if (isInitiate && !isLegion) {
        role = "Initiate";
        roleEmoji = "⚡";
      } else if (!isLegion && !isInitiate && holdings.length > 0) {
        role = "Holder";
        roleEmoji = "💎";
      }

      // Use NFT avatar if available
      const avatar =
        profile.nftAvatarUrl ||
        profile.image ||
        profileData?.image?.url ||
        (profileData?.image?.ipfs_cid
          ? `https://ipfs.near.social/ipfs/${profileData.image.ipfs_cid}`
          : `https://api.dicebear.com/7.x/avataaars/svg?seed=${accountId}`);

      const displayName = profile.name || accountId.split(".")[0];

      // Safely extract tags - ensure they're strings
      const rawTags = profileData?.tags;
      const tags: string[] = [];
      if (rawTags && typeof rawTags === "object") {
        for (const tagKey of Object.keys(rawTags)) {
          tags.push(String(tagKey));
        }
      }

      const linktree = profileData?.linktree || {};
      const explorerUrl = `https://explorer.oneverse.near.org/accounts/${accountId}?tab=nfts`;

      let markdown = `### **${safeStringify(roleEmoji)} ${safeStringify(displayName)}** | [View Profile](/profile/${accountId})\n`;
      markdown += `**@${accountId}**\n\n`;
      if (role !== "Member") {
        markdown += `**Role:** ${safeStringify(role)}\n\n`;
      }
      markdown += `![${safeStringify(displayName)}](${safeStringify(avatar)})\n\n`;

      if (profile.description) {
        markdown += `${safeStringify(profile.description)}\n\n`;
      }

      if (tags.length > 0) {
        markdown += `**Interests:** ${tags.map((t) => `\`${safeStringify(t)}\``).join(", ")}\n\n`;
      }

      // Safely build social links
      const socialLinks: string[] = [];

      const safeSocialLink = (value: unknown): string | null => {
        const str = safeStringify(value);
        return str && str.trim() ? str.trim() : null;
      };

      const github = safeSocialLink(linktree.github);
      if (github) {
        socialLinks.push(`[GitHub](https://github.com/${github})`);
      }

      const twitter = safeSocialLink(linktree.twitter);
      if (twitter) {
        socialLinks.push(`[Twitter](https://twitter.com/${twitter})`);
      }

      const website = safeSocialLink(linktree.website);
      if (website) {
        const url = website.startsWith("http") ? website : `https://${website}`;
        socialLinks.push(`[Website](${url})`);
      }

      const telegram = safeSocialLink(linktree.telegram);
      if (telegram) {
        socialLinks.push(`[Telegram](https://t.me/${telegram})`);
      }

      // Add any other social platforms
      Object.entries(linktree).forEach(([platform, url]) => {
        if (
          platform !== "github" &&
          platform !== "twitter" &&
          platform !== "website" &&
          platform !== "telegram"
        ) {
          const safeUrl = safeSocialLink(url);
          if (safeUrl) {
            const platformName =
              platform.charAt(0).toUpperCase() + platform.slice(1);
            const finalUrl = safeUrl.startsWith("http")
              ? safeUrl
              : `https://${safeUrl}`;
            socialLinks.push(`[${platformName}](${finalUrl})`);
          }
        }
      });

      if (socialLinks.length > 0) {
        markdown += `**Connect:** ${socialLinks.join(" • ")}\n\n`;
      }

      markdown += `**[View NFTs on NEAR Explorer](${explorerUrl})**\n`;

      return markdown;
    } catch (error) {
      console.error("[getBuilderProfile] Error:", error);
      return "Failed to fetch profile. Please try again.";
    }
  }

  /**
   * List Legion members with optional role filter - Returns markdown
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
      const filteredAccounts: Array<{
        accountId: string;
        role: string;
        roleEmoji: string;
      }> = [];

      for (const [accountId, { contracts }] of accountMap) {
        let role = "Holder";
        let roleEmoji = "💎";
        if (contracts.includes("ascendant.nearlegion.near")) {
          role = "Ascendant";
          roleEmoji = "🔥";
        } else if (contracts.includes("initiate.nearlegion.near")) {
          role = "Initiate";
          roleEmoji = "⚡";
        }

        if (params.role && params.role !== "any" && role !== params.role) {
          continue;
        }

        filteredAccounts.push({ accountId, role, roleEmoji });
      }

      if (filteredAccounts.length === 0) {
        return `No Legion members found${params.role && params.role !== "any" ? ` with role "${safeStringify(params.role)}"` : ""}.`;
      }

      // Fetch profiles for filtered accounts and build markdown
      const builders = await Promise.all(
        filteredAccounts
          .slice(0, limit)
          .map(async ({ accountId, role, roleEmoji }) => {
            const profile = await this.db.query.nearSocialProfiles.findFirst({
              where: eq(schema.nearSocialProfiles.accountId, accountId),
            });

            const profileData = profile?.profileData
              ? JSON.parse(profile.profileData)
              : null;
            const displayName = profile?.name || accountId.split(".")[0];

            // Safely extract tags - ensure they're strings
            const rawTags = profileData?.tags;
            const tags: string[] = [];
            if (rawTags && typeof rawTags === "object") {
              for (const tagKey of Object.keys(rawTags)) {
                tags.push(String(tagKey));
              }
            }

            const linktree = profileData?.linktree || {};

            // Use NFT avatar if available
            const avatar =
              profile?.nftAvatarUrl ||
              profile?.image ||
              profileData?.image?.url ||
              (profileData?.image?.ipfs_cid
                ? `https://ipfs.near.social/ipfs/${profileData.image.ipfs_cid}`
                : `https://api.dicebear.com/7.x/avataaars/svg?seed=${accountId}`);

            return {
              accountId,
              displayName,
              avatar,
              role,
              roleEmoji,
              description: profile?.description || "",
              tags,
              socials: linktree,
            };
          }),
      );

      let markdown = `## Legion Members (${safeStringify(builders.length)})\n\n`;

      for (const builder of builders) {
        markdown += `### **${safeStringify(builder.roleEmoji)} ${safeStringify(builder.displayName)}** | [View Profile](/profile/${safeStringify(builder.accountId)})\n`;
        markdown += `**@${safeStringify(builder.accountId)}** • **${safeStringify(builder.role)}**\n\n`;
        markdown += `![${safeStringify(builder.displayName)}](${safeStringify(builder.avatar)})\n\n`;

        if (builder.description) {
          markdown += `${safeStringify(builder.description)}\n\n`;
        }

        if (builder.tags.length > 0) {
          markdown += `**Interests:** ${builder.tags.map((t) => `\`${safeStringify(t)}\``).join(", ")}\n\n`;
        }

        // Safely build social links
        const socialLinks: string[] = [];

        const safeSocialLink = (value: unknown): string | null => {
          const str = safeStringify(value);
          return str && str.trim() ? str.trim() : null;
        };

        const github = safeSocialLink(builder.socials.github);
        if (github) {
          socialLinks.push(`[GitHub](https://github.com/${github})`);
        }

        const twitter = safeSocialLink(builder.socials.twitter);
        if (twitter) {
          socialLinks.push(`[Twitter](https://twitter.com/${twitter})`);
        }

        const website = safeSocialLink(builder.socials.website);
        if (website) {
          const url = website.startsWith("http")
            ? website
            : `https://${website}`;
          socialLinks.push(`[Website](${url})`);
        }

        const telegram = safeSocialLink(builder.socials.telegram);
        if (telegram) {
          socialLinks.push(`[Telegram](https://t.me/${telegram})`);
        }

        // Add any other social platforms
        Object.entries(builder.socials).forEach(([platform, url]) => {
          if (
            platform !== "github" &&
            platform !== "twitter" &&
            platform !== "website" &&
            platform !== "telegram"
          ) {
            const safeUrl = safeSocialLink(url);
            if (safeUrl) {
              const platformName =
                platform.charAt(0).toUpperCase() + platform.slice(1);
              const finalUrl = safeUrl.startsWith("http")
                ? safeUrl
                : `https://${safeUrl}`;
              socialLinks.push(`[${platformName}](${finalUrl})`);
            }
          }
        });

        if (socialLinks.length > 0) {
          markdown += `**Connect:** ${socialLinks.join(" • ")}\n\n`;
        }

        markdown += `---\n\n`;
      }

      return markdown.trim();
    } catch (error) {
      console.error("[listLegionMembers] Error:", error);
      return "Failed to list members. Please try again.";
    }
  }

  /**
   * Get holders of a specific NFT contract
   */
  private async getNftHolders(params: {
    contractId: string;
    limit?: number;
  }): Promise<string> {
    // Default to showing only 5 holders to avoid overwhelming the user
    const limit = Math.min(params.limit || 5, 50);

    try {
      const holders = await this.db.query.legionHolders.findMany({
        where: (holders, { eq }) => eq(holders.contractId, params.contractId),
        limit,
      });

      if (holders.length === 0) {
        return `No holders found for contract ${safeStringify(params.contractId)}.`;
      }

      // Format as markdown
      let markdown = `## NFT Holders (${holders.length})\n\nContract: \`${safeStringify(params.contractId)}\`\n\n`;

      // Fetch profile data for each holder and append to markdown
      for (const holder of holders) {
        const profile = await this.db.query.nearSocialProfiles.findFirst({
          where: eq(schema.nearSocialProfiles.accountId, holder.accountId),
        });

        const profileData = profile?.profileData
          ? JSON.parse(profile.profileData)
          : null;
        const displayName = profile?.name || holder.accountId.split(".")[0];

        // Safely extract tags - ensure they're strings
        const rawTags = profileData?.tags;
        const tags: string[] = [];
        if (rawTags && typeof rawTags === "object") {
          for (const tagKey of Object.keys(rawTags)) {
            tags.push(String(tagKey));
          }
        }

        const avatar =
          profile?.nftAvatarUrl ||
          profile?.image ||
          profileData?.image?.url ||
          (profileData?.image?.ipfs_cid
            ? `https://ipfs.near.social/ipfs/${profileData.image.ipfs_cid}`
            : `https://api.dicebear.com/7.x/avataaars/svg?seed=${holder.accountId}`);

        markdown += `### **@${safeStringify(holder.accountId)}**\n`;
        markdown += `**Quantity:** ${safeStringify(holder.quantity)}\n\n`;
        markdown += `![${safeStringify(displayName)}](${safeStringify(avatar)})\n\n`;

        if (profile?.description) {
          markdown += `${safeStringify(profile.description)}\n\n`;
        }

        if (tags.length > 0) {
          markdown += `**Interests:** ${tags.map((t) => `\`${safeStringify(t)}\``).join(", ")}\n\n`;
        }

        markdown += `---\n\n`;
      }

      return markdown;
    } catch (error) {
      console.error("[getNftHolders] Error:", error);
      return "Failed to fetch NFT holders. Please try again.";
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
      // Defensive: ensure accountId is a string
      const accountId = safeStringify(params.accountId);

      const rankData = await this.nearService.getUserRank(accountId);

      if (!rankData) {
        return `${accountId} doesn't have a rank skillcape yet. Complete missions to get ranks!`;
      }

      const rankDisplay: Record<string, string> = {
        legendary: "Mythic",
        epic: " Prime",
        rare: "Vanguard",
        common: "🌟 Ascendant",
      };

      return `**@${safeStringify(params.accountId)}** has the rank: ${safeStringify(rankDisplay[rankData.rank] || rankData.rank)}\n\nToken ID: \`${safeStringify(rankData.tokenId)}\``;
    } catch (error) {
      console.error("[getMemberRank] Error:", error);
      return "Failed to fetch rank. Please try again.";
    }
  }

  /**
   * Get user projects from API (same as profile page)
   */
  private async getUserProjects(params: {
    accountId: string;
    status?: string;
  }): Promise<string> {
    try {
      // Defensive: ensure accountId and status are strings
      const accountId = safeStringify(params.accountId);
      const status = safeStringify(params.status || "all");

      console.log(
        `[getUserProjects] Fetching projects for ${safeStringify(accountId)} with status ${safeStringify(status)}`,
      );

      // Use the FastData API directly (same as /api/projects endpoint)
      // Since we're in the Worker, we query FastData directly instead of calling our own API
      const apiUrl = new URL("https://fastdata.up.railway.app/v1/kv/query");
      apiUrl.searchParams.set("accountId", accountId);
      apiUrl.searchParams.set("contractId", "contextual.near");
      apiUrl.searchParams.set("key_prefix", "projects/");
      apiUrl.searchParams.set("value_format", "json");

      const response = await fetch(apiUrl.toString(), {
        headers: { "User-Agent": "near-agent-worker/1.0" },
      });

      if (!response.ok) {
        console.error(
          "[getUserProjects] FastData API failed:",
          response.status,
        );
        return `Failed to fetch projects for @${safeStringify(accountId)}. Please try again.`;
      }

      const data = await response.json();

      if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
        return `@${accountId} does not have Projects**\n\n`;
      }

      // Group by project ID
      const projectsMap = new Map<string, Record<string, any>>();

      for (const entry of data.data) {
        const key = entry.key;
        if (!key.startsWith("projects/")) continue;

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

      // Build projects array
      const projects: Array<{
        id: string;
        name: string;
        description: string | null;
        status: string;
        coverImageUrl: string | null;
        githubLinks: Array<{ url: string; description?: string }> | null;
        tags: Array<{ name: string; target?: string }> | null;
        createdAt: string;
        updatedAt: string;
      }> = [];

      for (const [projectId, fields] of projectsMap.entries()) {
        const name = safeStringify(fields.name);
        const description = safeStringify(fields.description || null);
        const projectStatus = safeStringify(fields.status);
        const createdAt = safeStringify(fields.created);
        const updatedAt = safeStringify(fields.updated);
        const coverImageUrl = safeStringify(
          fields.coverImageUrl !== undefined ? fields.coverImageUrl : null,
        );

        // Parse JSON fields
        let githubLinks = null;
        let tags = null;
        try {
          if (fields.githubLinks) {
            githubLinks =
              typeof fields.githubLinks === "string"
                ? JSON.parse(fields.githubLinks)
                : fields.githubLinks;
          }
          if (fields.tags) {
            tags =
              typeof fields.tags === "string"
                ? JSON.parse(fields.tags)
                : fields.tags;
          }
        } catch (e) {
          console.warn(
            `[getUserProjects] Failed to parse JSON for project ${projectId}:`,
            e,
          );
        }

        // Only include valid projects
        if (name && projectStatus && createdAt && updatedAt) {
          projects.push({
            id: projectId,
            name,
            description,
            status: projectStatus,
            coverImageUrl,
            githubLinks,
            tags,
            createdAt,
            updatedAt,
          });
        }
      }

      // Filter by status if specified
      let filteredProjects = projects;
      if (status !== "all") {
        filteredProjects = projects.filter((p) => p.status === status);
      }

      if (filteredProjects.length === 0) {
        // Return plain text without any markdown to prevent AI from chunking/rephrasing

        return `## **@$ ${accountId} does not have Projects**\n\n no`;
      }

      // Format as markdown
      let markdown = `## **@$ ${accountId}'s Projects**\n\n`;
      markdown += `Found ${filteredProjects.length} project${filteredProjects.length === 1 ? "" : "s"}:\n\n`;

      for (const project of filteredProjects) {
        markdown += `${project.name}\n\n`;

        if (project.coverImageUrl) {
          markdown += `![${safeStringify(project.name)}](${safeStringify(project.coverImageUrl)})\n\n`;
        }

        if (project.description) {
          markdown += `${project.description}\n\n`;
        }

        // Status badge
        const statusEmoji: Record<string, string> = {
          active: "🟢",
          completed: "✅",
          archived: "📦",
        };
        markdown += `**Status:** ${statusEmoji[project.status] || ""} ${safeStringify(project.status)}\n\n`;

        // GitHub links
        if (project.githubLinks && project.githubLinks.length > 0) {
          markdown += `**GitHub Links:**\n`;
          for (const link of project.githubLinks) {
            const desc = link.description
              ? ` (${safeStringify(link.description)})`
              : "";
            markdown += `- [${desc || safeStringify(link.url)}](${safeStringify(link.url)})\n`;
          }
          markdown += `\n`;
        }

        // Tags
        if (project.tags && project.tags.length > 0) {
          markdown += `**Tags:** ${project.tags
            .map((t) => {
              const target = t.target ? ` → ${safeStringify(t.target)}` : "";
              return `\`${safeStringify(t.name)}${target}\``;
            })
            .join(", ")}\n\n`;
        }

        markdown += `---\n\n`;
      }

      return markdown;
    } catch (error) {
      console.error("[getUserProjects] Error:", error);
      return `Failed to fetch projects for @${safeStringify(params.accountId)}. Please try again.`;
    }
  }

  /**
   * Search for builders who have projects
   * Returns account IDs that the AI should then fetch detailed profiles for
   */
  private async searchBuildersWithProjects(params: {
    status?: string;
    limit?: number;
  }): Promise<string> {
    const status = safeStringify(params.status || "all");
    const limit = Math.min(params.limit || 20, 100);

    try {
      console.log(
        `[searchBuildersWithProjects] Finding builders with projects (status: ${status})`,
      );

      // Step 1: Get all account IDs from the contract
      const accountsUrl = new URL("https://near.garden/v1/kv/accounts");
      accountsUrl.searchParams.set("contractId", "contextual.near");
      accountsUrl.searchParams.set("limit", "1000");

      const accountsResponse = await fetch(accountsUrl.toString(), {
        headers: { "User-Agent": "near-agent-worker/1.0" },
      });

      if (!accountsResponse.ok) {
        console.error(
          "[searchBuildersWithProjects] Failed to fetch accounts:",
          accountsResponse.status,
        );
        return JSON.stringify({
          type: "error",
          message:
            "Failed to search for builders with projects. Please try again.",
        });
      }

      const accountsData = await accountsResponse.json();

      if (!accountsData.data || !Array.isArray(accountsData.data)) {
        return JSON.stringify({
          type: "error",
          message: "No builders found with projects.",
        });
      }

      const allAccountIds = accountsData.data as string[];
      console.log(
        `[searchBuildersWithProjects] Checking ${allAccountIds.length} accounts for projects`,
      );

      // Step 2: Check each account for projects
      const buildersWithProjects: string[] = [];

      for (const accountId of allAccountIds) {
        // Skip if we've reached the limit
        if (buildersWithProjects.length >= limit) break;

        const queryUrl = new URL("https://near.garden/v1/kv/query");
        queryUrl.searchParams.set("accountId", accountId);
        queryUrl.searchParams.set("contractId", "contextual.near");
        queryUrl.searchParams.set("key_prefix", "projects/");
        queryUrl.searchParams.set("value_format", "json");
        queryUrl.searchParams.set("limit", "1"); // We only need to know if they have projects

        try {
          const queryResponse = await fetch(queryUrl.toString(), {
            headers: { "User-Agent": "near-agent-worker/1.0" },
          });

          if (queryResponse.ok) {
            const queryData = await queryResponse.json();
            if (
              queryData.data &&
              Array.isArray(queryData.data) &&
              queryData.data.length > 0
            ) {
              buildersWithProjects.push(accountId);
            }
          }
        } catch (error) {
          console.error(
            `[searchBuildersWithProjects] Error checking ${accountId}:`,
            error,
          );
        }
      }

      if (buildersWithProjects.length === 0) {
        return JSON.stringify({
          type: "error",
          message: "No builders found with projects.",
        });
      }

      console.log(
        `[searchBuildersWithProjects] Found ${buildersWithProjects.length} builders with projects`,
      );

      const accountIds = buildersWithProjects;

      if (accountIds.length === 0) {
        return JSON.stringify({
          type: "error",
          message: "No builders found with projects.",
        });
      }

      // Fetch profile names for better display
      const builders = await Promise.all(
        accountIds.map(async (accountId) => {
          const profile = await this.db.query.nearSocialProfiles.findFirst({
            where: eq(schema.nearSocialProfiles.accountId, accountId),
          });

          return {
            accountId,
            name: profile?.name || accountId.split(".")[0],
          };
        }),
      );

      // Return a structured response that tells the AI to call get_builder_profile for each match
      const result = {
        type: "builders_found",
        count: builders.length,
        query: `builders with projects${status !== "all" ? ` (status: ${status})` : ""}`,
        builders: builders,
        instruction: `Call get_builder_profile for each accountId to get detailed information`,
      };

      return JSON.stringify(result);
    } catch (error) {
      console.error("[searchBuildersWithProjects] Error:", error);
      return JSON.stringify({
        type: "error",
        message:
          "Failed to search for builders with projects. Please try again.",
      });
    }
  }

  /**
   * Execute a tool call and return the result
   */
  async executeToolCall(toolCall: ToolCall): Promise<string> {
    const { name, arguments: args } = toolCall;

    console.log(`[executeToolCall] ${safeStringify(name)}:`, args);

    switch (name) {
      case "search_builders":
        return this.searchBuilders(args as { query: string; limit?: number });

      case "search_by_social":
        return this.searchBySocial(
          args as { platform: string; limit?: number },
        );

      case "search_by_tags":
        return this.searchByTags(
          args as { tags: string[]; matchAll?: boolean; limit?: number },
        );

      case "get_nft_holders":
        return this.getNftHolders(
          args as { contractId: string; limit?: number },
        );

      case "get_builder_profile":
        return this.getBuilderProfile(args as { accountId: string });

      case "list_legion_members":
        return this.listLegionMembers(
          args as {
            role?: string;
            limit?: number;
            offset?: number;
          },
        );

      case "get_member_rank":
        return this.getMemberRank(args as { accountId: string });

      case "get_user_projects":
        return this.getUserProjects(
          args as { accountId: string; status?: string },
        );

      case "search_builders_with_projects":
        return this.searchBuildersWithProjects(
          args as { status?: string; limit?: number },
        );

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
  nearService: NearService | null,
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
    nearService,
  );
}
