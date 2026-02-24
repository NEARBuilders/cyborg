# AI Integration - agent.ts Architecture
https://chat.justrnd.com/chat/cf116b79-21cc-4522-9bf9-7d3423f9eed9/?message=
https://chatjimmy.ai/
https://www.inceptionlabs.ai/
https://openclaw.ai/
                                    Speed
                                      ▲
                                     / \
                                    /   \
                                   /     \
                                  /       \
                                 /         \
                                /           \
                               /      here   \
                              /               \
                             /                 \
                            /                   \
                           /_____________________\
                        Efficiency               Cost
```
```
## Overview

The `agent.ts` file is the core AI service that powers intelligent chat functionality with **tool calling** capabilities. It enables users to discover and connect with builders in the NEAR Legion community through natural conversation.

---

## Key Technologies

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **AI Provider** | OpenAI SDK | Connects to NEAR AI Cloud for LLM responses |
| **Database** | Drizzle ORM + D1 | Stores conversations, messages, and builder profiles |
| **Blockchain** | NEAR Protocol | Handles rank checking via NearService |
| **AI Model** | DeepSeek-compatible | Uses strict mode for reliable JSON schema validation |

---

## Architecture

┌─────────────────────────────────────────────────────────────────────┐
│                         USER MESSAGE                                │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     AgentService.processMessage()                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  1. Build Chat Context                                       │  │
│  │     - Resolve/create conversation                            │  │
│  │     - Fetch last 20 messages                                 │  │
│  │     - Generate rank-aware system prompt                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  2. Send to AI with Tools Available                          │  │
│  │     - System prompt + conversation history + user message    │  │
│  │     - Tools: search_builders, get_builder_profile, etc.      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                    │                               │
│                                    ▼                               │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  3. Tool Calling Loop (max 5 iterations)                     │  │
│  │  ┌────────────────────────────────────────────────────────┐  │  │
│  │  │  AI requests tool?                                     │  │  │
│  │  │       │                                                │  │  │
│  │  │       ├── YES → executeToolCall() → Query Database     │  │  │
│  │  │       │                                                │  │  │
│  │  │       └── NO → Return response                         │  │  │
│  │  └────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  4. Persist & Return                                         │  │
│  │     - Save assistant message to database                     │  │
│  │     - Return response (or stream chunks)                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘

---

## Rank-Based System Prompt

The AI dynamically adjusts its behavior based on user's Legion rank:

| Rank | Token Limit | Capabilities |
|------|-------------|--------------|
| **No Token** | 1000 | Basic responses + prompt to mint Initiate |
| **Initiate** | 1000 | Standard responses + mission encouragement |
| **Ascendant** (Common) | 1200 | Enhanced helpful responses |
| **Vanguard** (Rare) | 1500 | Standard plus features with good detail |
| **Prime** (Epic) | 2000 | Enhanced with context and examples |
| **Mythic** (Legendary) | 3000 | Maximum capabilities with comprehensive detail |

---

## Tool Definitions (9 Tools)

### Discovery Tools
| Tool | Purpose |
|------|---------|
| `search_builders` | Search by interests, skills, description |
| `search_by_social` | Find builders with specific social platforms |
| `search_by_tags` | Find by tags/skills (AND/OR logic) |
| `search_builders_with_projects` | Find builders who have created projects |

### Profile Tools
| Tool | Purpose |
|------|---------|
| `get_builder_profile` | Get detailed profile with avatar, tags, socials |
| `get_user_projects` | Get all projects with GitHub links, tags, status |

### Community Tools
| Tool | Purpose |
|------|---------|
| `list_legion_members` | List all members with role filtering |
| `get_nft_holders` | Get holders of specific NFT contracts |
| `get_member_rank` | Check member's rank tier |

---

## Tool Calling Flow

```
User: "Find React developers"

┌─────────────────────────────────────────────────────────────┐
│ AI decides: search_by_tags(tags=["react"], matchAll=false) │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ Tool returns: {                                             │
│   type: "builders_found",                                   │
│   builders: [                                               │
│     { accountId: "user1.near", name: "Alice" },             │
│     { accountId: "user2.near", name: "Bob" }                │
│   ],                                                        │
│   instruction: "Call get_builder_profile for each"          │
│ }                                                           │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ AI calls: get_builder_profile("user1.near")                 │
│ AI calls: get_builder_profile("user2.near")                 │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ Returns formatted markdown cards with:                      │
│ - NFT avatar images                                         │
│ - Role badges (Ascendant 🔥, Initiate ⚡, Holder 💎)        │
│ - Description and interests                                 │
│ - Social links (GitHub, Twitter, Telegram, etc.)           │
│ - Clickable profile links                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Sources

### Internal Database (D1)
| Table | Purpose |
|-------|---------|
| `conversation` | Chat sessions with title, timestamps |
| `message` | Individual messages (user/assistant) |
| `nearSocialProfiles` | Builder profiles with tags, linktree |
| `legionHolders` | NFT ownership for role determination |

### External APIs
| API | Purpose |
|-----|---------|
| **NEAR AI Cloud** | LLM with tool calling |
| **NearService** | Check rank skillcapes on-chain |
| **FastData API** | Query user projects (contextual.near) |
| **NEAR Garden** | List accounts with projects |

---

## Response Modes

### 1. Non-Streaming (`processMessage`)
- Returns complete response after all tool calls complete
- Better for simple queries
- Returns `ChatResponse` with full content

### 2. Streaming (`processMessageStream`)
- Yields chunks as they arrive for real-time display
- Better for long responses with tool calls
- Returns `AsyncGenerator<StreamEvent>` with events:
  - `chunk` - Content piece
  - `complete` - Final message metadata
  - `error` - Error information

---

## Safety Features

### 1. JSON Validation
```typescript
private isValidJson(str: string): boolean
```
- Validates tool call arguments before parsing
- Prevents crashes from malformed JSON
- Checks brace balancing and structure

### 2. Safe Stringification
```typescript
function safeStringify(value: unknown): string
```
- Prevents `[object Object]` errors in AI responses
- Handles nested objects, arrays, primitives
- Critical for social links and tag display

### 3. Anti-[Object Object] Rules
The system prompt includes strict rules:
- Tool results are pre-formatted as markdown
- AI must output tool results verbatim
- No rephrasing or summarizing tool results
- Prevents malformed responses

---

## Example Output

```markdown
### **🔥 @alice.near** | [View Profile](/profile/alice.near)
**Role:** Ascendant

![Avatar](https://ipfs.near.social/ipfs/...)

Full-stack developer passionate about DeFi and NFTs...

**Interests:** `react`, `typescript`, `defi`, `smart contracts`

**Connect:** [GitHub](https://github.com/alice) • [Twitter](https://twitter.com/alice) • [Website](https://alice.dev)

---

### **⚡ @bob.near** | [View Profile](/profile/bob.near)
**Role:** Initiate

![Avatar](...)

Blockchain developer focusing on Rust...

**Interests:** `rust`, `near protocol`, `smart contracts`

**Connect:** [GitHub](https://github.com/bob) • [Telegram](https://t.me/bob)
```

---

## Error Handling

| Error Type | Code | Retry After |
|------------|------|-------------|
| Invalid API Key | `UNAUTHORIZED` | - |
| Rate Limited | `RATE_LIMITED` | 60s |
| Service Error | `SERVICE_UNAVAILABLE` | 30s |
| Access Denied | `FORBIDDEN` | - |

All errors extend `AgentError` class with structured data for client handling.

---

## Summary

The `agent.ts` service provides:

1. **Natural Language Interface** - Users chat normally to discover builders
2. **Intelligent Tool Calling** - AI decides which tools to use based on intent
3. **Rank-Based Personalization** - Higher ranks get more detailed responses
4. **Real-Time Streaming** - Instant feedback for better UX
5. **Builder Discovery** - 9 tools for finding and connecting developers
6. **Safe Output** - Pre-formatted markdown prevents display errors
7. **Multi-Source Data** - Combines on-chain, social, and project data

This enables the NEAR Legion community to connect builders based on skills, interests, social presence, and project contributions through conversational AI.
