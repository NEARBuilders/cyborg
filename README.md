# Cyborg: NEAR AI Agent Starter Kit

## Module Federation Monorepo

A Module Federation monorepo featuring every-plugin architecture, runtime-loaded configuration, better-near-auth sessions, NEAR AI Cloud API integration with streaming chat, and per-user key-value storage.

Built with React, Hono.js, oRPC, Better-Auth, Module Federation, and NEAR AI Cloud.

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/NEARBuilders/cyborg.git && cd cyborg
bun install

# 2. Create environment files
cp host/.env.example host/.env
cp api/.env.example api/.env

# 3. Initialize database
bun db:migrate

# 4. Start development server
bun dev
```

Visit [http://localhost:3001](http://localhost:3001) to see the application.

### Enable AI Chat

1. Get an API key from [cloud.near.ai](https://cloud.near.ai)
2. Add to `api/.env`: `NEAR_AI_API_KEY=your_key_here`
3. Restart with `bun dev`

## Documentation

- **[CLAUDE.md](./CLAUDE.md)** - Quick reference for Claude Code and AI assistants
- **[LLM.txt](./LLM.txt)** - Comprehensive technical guide (architecture, patterns, examples)
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Contribution guidelines and development workflow
- **[API README](./api/README.md)** - API plugin documentation
- **[UI README](./ui/README.md)** - Frontend documentation
- **[Host README](./host/README.md)** - Server host documentation

## Architecture

**Module Federation Monorepo** with runtime-loaded configuration:

```
┌─────────────────────────────────────────────────────────┐
│                  host (Server)                          │
│  Hono.js + oRPC + bos.config.json loader                │
│  ┌──────────────────┐      ┌──────────────────┐         │
│  │ Module Federation│      │ every-plugin     │         │
│  │ Runtime          │      │ Runtime          │         │
│  └────────┬─────────┘      └────────┬─────────┘         │
│           ↓                         ↓                   │
│  Loads UI Remote           Loads API Plugins            │
└───────────┬─────────────────────────┬───────────────────┘
            ↓                         ↓
┌───────────────────────┐ ┌───────────────────────┐
│    ui/ (Remote)       │ │   api/ (Plugin)       │
│  React + TanStack     │ │  oRPC + Effect        │
│  remoteEntry.js       │ │  remoteEntry.js       │
└───────────────────────┘ └───────────────────────┘
```

**Key Features:**

- ✅ **AI Chat** - Streaming chat built on NEAR AI Cloud (OpenAI-compatible)
- ✅ **NEAR Authentication** - Wallet-based sign-in with Better-Auth
- ✅ **Key-Value Storage** - Per-user persistent storage demo
- ✅ **Runtime Configuration** - All URLs loaded from `bos.config.json`
- ✅ **Independent Deployment** - UI, API, and Host deploy separately
- ✅ **Type Safety** - End-to-end with oRPC contracts
- ✅ **CDN-Ready** - Module Federation with automatic CDN deployment

See [LLM.txt](./LLM.txt) for complete architecture details.

## Tech Stack

**Frontend:**

- React 19 + TanStack Router (file-based) + TanStack Query
- Tailwind CSS v4 + shadcn/ui components
- Module Federation for microfrontend architecture

**Backend:**

- Hono.js server + oRPC (type-safe RPC + OpenAPI)
- every-plugin architecture for modular APIs
- Effect-TS for service composition

**Database & Auth:**

- SQLite (libsql) + Drizzle ORM
- Better-Auth with NEAR Protocol support

## Configuration

All runtime configuration lives in `bos.config.json`:

```json
{
  "account": "example.near",
  "app": {
    "host": {
      "title": "App Title",
      "development": "http://localhost:3001",
      "production": "https://example.com"
    },
    "ui": {
      "name": "ui",
      "development": "http://localhost:3002",
      "production": "https://cdn.example.com/ui/remoteEntry.js"
    },
    "api": {
      "name": "api",
      "development": "http://localhost:3014",
      "production": "https://cdn.example.com/api/remoteEntry.js",
      "variables": {},
      "secrets": ["API_DATABASE_URL", "API_DATABASE_AUTH_TOKEN"]
    }
  }
}
```

**Benefits:**

- Switch environments via `NODE_ENV` (no rebuild)
- Update CDN URLs without code changes
- Template injection for secrets

## Rate Limiting

Built-in rate limiting protects against abuse:

| Endpoint  | Limit         | Window   |
| --------- | ------------- | -------- |
| Chat/AI   | 20 requests   | 1 minute |
| Key-Value | 100 requests  | 1 minute |
| Auth      | 100 requests  | 1 minute |
| Global    | 1000 requests | 1 minute |

Rate limit headers included in responses:

- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Unix timestamp when window resets

## Health Checks

Two health endpoints are available:

- `GET /health` - Basic liveness check (always returns 200 if server is running)
- `GET /health/ready` - Readiness check with dependency status

Example readiness response:

```json
{
  "status": "ready",
  "checks": {
    "database": true,
    "ai": true
  },
  "timestamp": "2025-01-17T12:00:00.000Z"
}
```

Use `/health/ready` for load balancer health checks.

## Available Scripts

```bash
# Development
bun dev              # All services (API: 3014, UI: 3002, Host: 3001)
bun dev:api          # API plugin only
bun dev:ui           # UI remote only
bun dev:host         # Host server only

# Production
bun build            # Build all packages
bun build:api        # Build API plugin → uploads to CDN
bun build:ui         # Build UI remote → uploads to CDN
bun build:host       # Build host server

# Database
bun db:migrate       # Run migrations
bun db:push          # Push schema changes
bun db:studio        # Open Drizzle Studio

# Testing
bun test             # Run all tests
bun typecheck        # Type checking
```

## Development Workflow

1. **Make changes** to any workspace (ui/, api/, host/)
2. **Hot reload** works automatically during development
3. **Build & deploy** independently:
   - `bun build:ui` → uploads to CDN → updates `bos.config.json`
   - `bun build:api` → uploads to CDN → updates `bos.config.json`
   - Host automatically loads new versions!

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed development workflow.

## Migrating from Template

This project evolved from the [every-plugin template](https://github.com/near-everything/every-plugin). Key customizations include:

### AI Chat Integration

- **AgentService** in `api/src/services/agent.ts` - AI-powered chat with streaming
- **NEAR AI Cloud** integration (OpenAI-compatible API)
- **Database schema** - `conversation` and `message` tables with optimized indices
- **Streaming endpoints** - `/chat` and `/chat/stream` with SSE

### Authentication & Roles

- **Better-Auth** with admin plugin (`host/src/lib/auth.ts`)
- **User roles** - "user" (default) and "admin"
- **Admin routes** - Protected via TanStack Router (`ui/src/routes/_layout/_authenticated/_admin.tsx`)
- **Role management** - Promote users via: `bun run promote-admin <near-account-id>`

### Database

- **Schema** - `api/src/db/schema.ts` (conversations, messages, kvStore)
- **Migrations** - Drizzle Kit workflow (generate → push → migrate)
- **Indices** - Optimized for conversation and message queries
- **Per-user isolation** - Composite primary key on kvStore `(key, nearAccountId)`

### Building Your Own

To customize this template for your use case:

1. **Define your domain** - Replace chat/conversation logic with your domain models
2. **Update schema** - Modify `api/src/db/schema.ts` with your tables
3. **Add services** - Create services in `api/src/services/` following Effect-TS Layer patterns
4. **Update contract** - Define API routes in `api/src/contract.ts`
5. **UI routes** - Add pages in `ui/src/routes/` with TanStack Router
6. **Configuration** - Update `bos.config.json` with your deployment URLs

## Related Projects

- **[every-plugin](https://github.com/near-everything/every-plugin)** - Plugin framework for modular APIs
- **[near-kit](https://kit.near.tools)** - Unified NEAR Protocol SDK
- **[better-near-auth](https://github.com/elliotBraem/better-near-auth)** - NEAR authentication for Better-Auth

## License

MIT
