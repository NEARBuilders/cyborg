# NEAR Agent

AI-powered NEAR Protocol agent with streaming chat, builders directory, and NEAR Social profile integration.

**Live Demo:** [near-agent.pages.dev](https://near-agent.pages.dev)

## Features

- **AI Chat** - Streaming chat powered by NEAR AI Cloud (DeepSeek-V3)
- **Builders Directory** - Browse NEAR Legion & Initiate NFT holders with profiles
- **NEAR Social Integration** - Profile data from NEAR Social
- **NEAR Authentication** - Wallet-based sign-in via Better-Auth
- **Per-User Storage** - Key-value storage for user data

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│         Cloudflare Worker (near-agent.pages.dev)        │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Hono.js + Drizzle + Better-Auth                │   │
│  │                                                  │   │
│  │  /api/*        → API routes (chat, builders)    │   │
│  │  /auth/*       → Better-Auth handler            │   │
│  │  /*            → Static UI assets               │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  Bindings:                                               │
│  - D1 Database (SQLite)                                 │
│  - NEAR AI API                                          │
│  - NEARBlocks API                                       │
└───────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Clone and install
git clone https://github.com/NEARBuilders/cyborg.git && cd cyborg
bun install

# Copy environment file
cp .env.example .env

# Add your API keys
# NEAR_AI_API_KEY - Get from https://cloud.near.ai
# NEARBLOCKS_API_KEY - Get from https://nearblocks.io/api

# Start development
bun dev
```

Visit [http://localhost:8787](http://localhost:8787)

## Environment Variables

```bash
# Required
NEAR_AI_API_KEY=sk-xxx          # NEAR AI Cloud API key
NEARBLOCKS_API_KEY=xxx          # NEARBlocks API key

# Optional (with defaults)
BETTER_AUTH_URL=http://localhost:8787
NEAR_AI_BASE_URL=https://cloud-api.near.ai/v1
NEAR_AI_MODEL=deepseek-ai/DeepSeek-V3.1
NEAR_RPC_URL=https://rpc.mainnet.near.org
```

## Deployment

### Deploy to Cloudflare

```bash
# Build UI
bun run --cwd ui build

# Deploy worker (serves UI + API)
bun run --cwd worker wrangler deploy
```

### Set Worker Secrets

```bash
# Better Auth
bun run --cwd worker wrangler secret put BETTER_AUTH_SECRET

# NEAR AI Cloud
bun run --cwd worker wrangler secret put NEAR_AI_API_KEY

# NEARBlocks API
bun run --cwd worker wrangler secret put NEARBLOCKS_API_KEY
```

## Project Structure

```
cyborg/
├── worker/                 # Cloudflare Worker (backend)
│   ├── src/
│   │   ├── index.ts       # Entry point, Hono app setup
│   │   ├── routes/        # API routes
│   │   ├── services/      # Business logic
│   │   ├── db/            # Database schema & client
│   │   └── auth.ts        # Better-Auth configuration
│   └── wrangler.toml      # Worker config
│
├── ui/                     # React Frontend
│   ├── src/
│   │   ├── routes/        # TanStack Router file-based routes
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom hooks
│   │   ├── integrations/  # External integrations
│   │   └── utils/         # Utilities
│   ├── _worker.js         # Pages Functions (API proxy)
│   └── wrangler.toml      # Pages config
│
└── .env                    # Environment variables
```

## Tech Stack

### Frontend
- **React 19** - UI framework
- **TanStack Router** - File-based routing
- **TanStack Query** - Server state management
- **Tailwind CSS v4** - Styling
- **shadcn/ui** - Component library

### Backend (Worker)
- **Hono.js** - Web framework
- **Drizzle ORM** - Database ORM
- **D1 (SQLite)** - Database
- **Better-Auth** - Authentication
- **better-near-auth** - NEAR wallet integration

### AI & APIs
- **NEAR AI Cloud** - AI chat (DeepSeek-V3)
- **NEARBlocks API** - NFT holder data
- **NEAR Social** - User profiles

## Available Scripts

```bash
# Development
bun dev                # Start worker dev server
bun dev:ui             # Start UI only

# Building
bun build              # Build all packages
bun build:ui           # Build UI for production

# Database
bun db:push            # Push schema to D1
bun db:studio          # Open Drizzle Studio
bun db:generate        # Generate migrations

# Testing
bun typecheck          # Type checking
bun test               # Run tests
```

## API Endpoints

### Health
- `GET /health` - Health check

### Chat (Authenticated)
- `POST /api/chat` - Send chat message
- `POST /api/chat/stream` - Streaming chat (SSE)
- `GET /api/conversations/:id` - Get conversation history

### Builders
- `POST /api/builders` - Fetch NFT holders (NEARBlocks proxy)
- `GET /api/builders/:id` - Get collection info

### User (Authenticated)
- `GET /api/user/rank/:accountId` - Get user NFT rank

### Storage (Authenticated)
- `GET /api/kv/:key` - Get user value
- `POST /api/kv/:key` - Set user value

### Admin (Authenticated, admin role)
- `GET /api/admin/stats` - Get platform stats

## NEAR Contracts

- **Legion Contract:** `ascendant.nearlegion.near`
- **Initiate Contract:** `initiate.nearlegion.near`

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT

## Acknowledgments

- **[every-plugin](https://github.com/near-everything/every-plugin)** - Plugin framework inspiration
- **[near-kit](https://kit.near.tools)** - NEAR Protocol SDK
- **[better-near-auth](https://github.com/elliotBraem/better-near-auth)** - NEAR authentication
