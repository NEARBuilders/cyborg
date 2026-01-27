# api

[every-plugin](https://github.com/near-everything/every-plugin) based API with NEAR AI Cloud integration.

## Plugin Architecture

Built with **every-plugin** framework (Rspack + Module Federation):

```bash
┌─────────────────────────────────────────────────────────┐
│                    createPlugin()                       │
├─────────────────────────────────────────────────────────┤
│  variables: { NEAR_AI_MODEL, NEAR_AI_BASE_URL }         │
│  secrets: { API_DATABASE_URL, NEAR_AI_API_KEY, ... }    │
│  contract: oRPC route definitions                       │
│  initialize(): Effect → { db, agentService }            │
│  createRouter(): handlers using services                │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   Host Integration                      │
├─────────────────────────────────────────────────────────┤
│  bos.config.json → plugin URL + secrets                 │
│  host/src/services/plugins.ts → loadPlugin()            │
│  host/src/services/router.ts → merge plugin router      │
└─────────────────────────────────────────────────────────┘
```

## Directory Structure

```
api/
├── src/
│   ├── contract.ts         # oRPC contract definition
│   ├── index.ts            # Plugin definition (createPlugin)
│   ├── db/
│   │   ├── index.ts        # Database connection layer
│   │   ├── schema.ts       # Drizzle ORM schema
│   │   └── migrations/     # SQL migration files
│   └── services/
│       ├── index.ts        # Service exports
│       └── agent.ts        # NEAR AI integration
├── plugin.dev.ts           # Local dev configuration
├── drizzle.config.ts       # Drizzle Kit config
└── package.json
```

## Tech Stack

- **Framework**: every-plugin + oRPC
- **Effects**: Effect-TS for service composition
- **Database**: SQLite (libsql) + Drizzle ORM
- **AI**: OpenAI SDK (NEAR AI Cloud compatible)

## Available Scripts

- `bun dev` - Start dev server (port 3014)
- `bun build` - Build plugin (deploys to CDN)
- `bun test` - Run tests
- `bun typecheck` - Type checking
- `bun db:push` - Push schema to database
- `bun db:generate` - Generate migrations
- `bun db:migrate` - Run migrations
- `bun db:studio` - Open Drizzle Studio

## Configuration

**bos.config.json**:

```json
{
  "app": {
    "api": {
      "name": "api",
      "development": "http://localhost:3014",
      "production": "https://cdn.example.com/api",
      "variables": {
        "NEAR_AI_MODEL": "deepseek-ai/DeepSeek-V3.1",
        "NEAR_AI_BASE_URL": "https://cloud-api.near.ai/v1"
      },
      "secrets": [
        "API_DATABASE_URL",
        "API_DATABASE_AUTH_TOKEN",
        "NEAR_AI_API_KEY",
        "NEAR_AI_BASE_URL"
      ]
    }
  }
}
```

## API Endpoints

| Route | Method | Description |
|-------|--------|-------------|
| `/api/ping` | GET | Health check |
| `/api/protected` | GET | Auth test endpoint |
| `/api/admin/stats` | GET | Admin statistics |
| `/api/kv/:key` | GET | Get key-value entry |
| `/api/kv` | POST | Set key-value entry |
| `/api/chat` | POST | Send chat message |
| `/api/chat/stream` | POST | Stream chat response |
| `/api/conversation/:id` | GET | Get conversation history |

## Database Schema

- **conversation** - Chat conversations per user
- **message** - Messages within conversations
- **kvStore** - Per-user key-value storage (composite key: `key + nearAccountId`)
