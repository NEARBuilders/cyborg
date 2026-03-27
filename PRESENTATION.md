# Cyborg: AI-Powered Social Platform for NEAR Builders

## Presentation Overview

This document provides a comprehensive overview of the Cyborg platform architecture, AI agents, and infrastructure for presentation purposes.

---

## Table of Contents

1. [What is Cyborg?](#what-is-cyborg)
2. [Architecture Overview](#architecture-overview)
3. [AI Agents & Skills](#ai-agents--skills)
4. [Core Infrastructure](#core-infrastructure)
5. [Data Layer](#data-layer)
6. [Key Integrations](#key-integrations)
7. [Getting Started](#getting-started)

---

## What is Cyborg?

**Cyborg** (branded as "Legion Social") is a hybrid platform that creates a social layer for NEAR ecosystem builders through:

- **AI Chat** powered by NEAR AI Cloud (GLM-4.6 model)
- **Builder Discovery** - browse NEAR Legion NFT holders
- **Project Management** - showcase your work
- **Social Graph** - follow builders, build your network
- **Privacy Features** - encrypted messaging via Nova SDK

**Live Demo:** https://near-agent.pages.dev/

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CYBORG PLATFORM                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Frontend (ui/ - React 19)                  │    │
│  │  • TanStack Router (file-based routing)                 │    │
│  │  • TanStack Query (server state)                        │    │
│  │  • Tailwind CSS v4 + shadcn/ui                         │    │
│  │  • Module Federation (runtime-loaded)                   │    │
│  └────────────────────────┬────────────────────────────────┘    │
│                           │                                      │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Worker (worker/ - Cloudflare)              │    │
│  │  • Hono.js web framework                                │    │
│  │  • D1 Database (SQLite @ Edge)                         │    │
│  │  • Better-Auth + NEAR wallet auth                      │    │
│  └────────────────────────┬────────────────────────────────┘    │
│                           │                                      │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              API Plugin (api/ - every-plugin)           │    │
│  │  • oRPC type-safe routes                                │    │
│  │  • Drizzle ORM                                          │    │
│  │  • NEAR AI Cloud integration                            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Privacy App (privacy/)                     │    │
│  │  • End-to-end encrypted messaging                       │    │
│  │  • Nova SDK + IPFS storage                              │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Package Structure

| Package | Purpose | Port |
|---------|---------|------|
| `ui/` | React frontend with Module Federation | 3002 |
| `worker/` | Cloudflare Worker edge deployment | 8787 |
| `api/` | API plugin with oRPC routes | 3014 |
| `privacy/` | Standalone encrypted messaging app | 3000 |

---

## AI Agents & Skills

The platform includes **Claude Code skills** that act as AI agents for code review and assistance:

### 1. API Agent (`/api`)

**Purpose:** Reviews the API package for oRPC contracts, database schema, and plugin patterns.

**Scope:**
```
api/
├── src/
│   ├── contract.ts      # oRPC route definitions
│   ├── index.ts         # Plugin definition
│   ├── db/
│   │   ├── schema.ts    # Drizzle ORM tables
│   │   └── migrations/  # SQL migrations
│   └── services/
│       └── agent.ts     # NEAR AI integration
```

**Checks:**
- oRPC contract definitions with Zod schemas
- Plugin structure with `createPlugin()`
- Database tables: `conversation`, `message`, `kvStore`
- NEAR AI Cloud streaming chat

### 2. UI Agent (`/ui`)

**Purpose:** Reviews frontend components, routing, and styling.

**Scope:**
```
ui/
├── src/
│   ├── router.tsx       # Client router
│   ├── components/
│   │   ├── chat/        # Chat components
│   │   ├── kv/          # Key-value editor
│   │   └── ui/          # shadcn primitives
│   ├── hooks/           # Custom hooks
│   ├── lib/             # Auth, utilities
│   └── routes/          # TanStack routes
```

**Checks:**
- Semantic Tailwind classes
- TanStack Router conventions
- oRPC client integration
- Module Federation exports

### 3. Host Agent (`/host`)

**Purpose:** Reviews server setup, configuration, and authentication.

**Scope:**
```
host/
├── server.ts           # Entry point
├── src/
│   ├── program.ts      # Main server
│   ├── services/
│   │   ├── auth.ts     # Better-Auth
│   │   ├── config.ts   # Runtime config
│   │   ├── plugins.ts  # Plugin loader
│   │   └── router.ts   # Route creation
│   └── layers/         # Effect-TS layers
└── bos.config.json     # Central config
```

**Checks:**
- Hono.js server setup
- Runtime config from `bos.config.json`
- Plugin runtime (every-plugin)
- Better-Auth + NEAR auth

---

## Core Infrastructure

### 1. Runtime Configuration (`bos.config.json`)

Central configuration loaded at runtime - no rebuild needed for URL changes:

```json
{
  "account": "agency.near",
  "apps": {
    "host": { "dev": "http://localhost:3001", "prod": "https://..." },
    "ui": { "dev": "http://localhost:3002", "prod": "https://..." },
    "api": { "dev": "http://localhost:3014", "prod": "https://..." }
  },
  "variables": { "NEAR_AI_MODEL": "glm/glm-4-plus" },
  "secrets": { "NEAR_AI_API_KEY": "{{NEAR_AI_API_KEY}}" }
}
```

### 2. Type-Safe API (oRPC)

```typescript
// api/src/contract.ts
export const contract = oc.router({
  chat: oc.route({ method: 'POST', path: '/chat' })
    .input(z.object({ message: z.string() }))
    .output(z.object({ response: z.string() }))
});
```

### 3. Module Federation

UI components are loaded at runtime, enabling:
- Independent deployment
- Hot updates without full rebuild
- Shared dependency management

---

## Data Layer

### FastKV Protocol

**Key Innovation:** Store data on NEAR without storage deposits - only pay transaction fees.

**How it works:**
1. Indexes transaction ledger for `__fastdata_kv` function calls
2. Works with any contract (even without the method)
3. Key structure: `(predecessor, receiver, key)`
4. Full version history retained

**Benefits:**
- 10-50x cheaper than contract storage
- Instant REST API queries
- No gas for reads
- Zero deposit barrier

### Database Schema (D1/SQLite)

```sql
-- Conversations
CREATE TABLE conversation (
  id TEXT PRIMARY KEY,
  nearAccountId TEXT NOT NULL,
  createdAt TEXT
);

-- Messages
CREATE TABLE message (
  id TEXT PRIMARY KEY,
  conversationId TEXT REFERENCES conversation(id),
  role TEXT, -- 'user' | 'assistant'
  content TEXT,
  createdAt TEXT
);

-- Key-Value Store
CREATE TABLE kvStore (
  id TEXT PRIMARY KEY,
  nearAccountId TEXT NOT NULL,
  key TEXT,
  value TEXT
);
```

---

## Key Integrations

### NEAR AI Cloud

```typescript
// Streaming chat implementation
const response = await openai.chat.completions.create({
  model: 'glm/glm-4-plus',
  messages: conversationHistory,
  stream: true
});

for await (const chunk of response) {
  yield chunk.choices[0]?.delta?.content;
}
```

### NEAR Social Profiles

- Fetch builder profiles from blockchain
- Display skills, projects, social links
- NFT-based reputation badges

### NEARBlocks API

- Query NFT holdings across contracts
- Sync holder data to D1 cache
- 10-50x faster cached queries

### Outlayer Payment Keys

- Gasless transaction execution
- Pre-authorized spending
- Instant follows/updates

---

## Getting Started

### Prerequisites

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash
```

### Installation

```bash
git clone https://github.com/NEARBuilders/cyborg.git
cd cyborg
bun install

# Run database migrations
bun db:migrate

# Start development
bun dev
```

### Environment

```bash
# Required
NEAR_AI_API_KEY=sk-xxx

# Optional (with defaults)
NEAR_AI_MODEL=glm/glm-4-plus
NEAR_AI_BASE_URL=https://cloud-api.near.ai/v1
NEAR_RPC_URL=https://rpc.mainnet.near.org
```

### Commands

```bash
bun dev              # All services
bun dev:worker       # Worker only
bun build            # Build all
bun test             # Run tests
bun db:studio        # Open Drizzle Studio
```

---

## Tech Stack Summary

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TanStack Router/Query, Tailwind v4 |
| Backend | Hono.js, oRPC, Effect-TS |
| Database | D1 (SQLite), Drizzle ORM |
| Auth | Better-Auth + better-near-auth |
| AI | NEAR AI Cloud (GLM-4.6) |
| Deployment | Cloudflare Workers/Pages |
| Build | Turbo, Rsbuild, Zephyr CDN |

---

## License

MIT

---

**Built for NEARCON 2026 Innovation Sandbox**

*Private. Intelligence. Yours.*
