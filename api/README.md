# api

[every-plugin](https://github.com/near-everything/every-plugin) based API.

## Plugin Architecture

Built with **every-plugin** framework (Rspack + Module Federation):

```
┌─────────────────────────────────────────────────────────┐
│                    createPlugin()                       │
├─────────────────────────────────────────────────────────┤
│  variables: {  ... }                │
│  secrets: { ... }  │
│  contract: oRPC route definitions                       │
│  initialize(): Effect → services                        │
│  createRouter(): handlers using services                │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   Host Integration                      │
├─────────────────────────────────────────────────────────┤
│  bos.config.json → plugin URL + secrets                 │
│  runtime.ts → createPluginRuntime().usePlugin()         │
│  routers/index.ts → merge plugin.router into AppRouter  │
└─────────────────────────────────────────────────────────┘
```

**Plugin Structure:**

- `contract.ts` - oRPC contract definition (routes, schemas)
- `index.ts` - Plugin initialization + router handlers
- `db/schema.ts` - Database schema (conversations, messages, KV store)
- `services/` - Business logic (agent service for AI chat)
- `db/migrations/` - Database migrations

**Extending with more plugins:**

Each domain can be its own plugin with independent:

- Contract definition
- Initialization logic  
- Router handlers
- Database schema

## Tech Stack

- **Framework**: every-plugin + oRPC
- **Effects**: Effect-TS for service composition
- **Database**: SQLite (libsql) + Drizzle ORM

## Available Scripts

- `bun dev` - Start dev server
- `bun build` - Build plugin
- `bun test` - Run tests
- `bun db:push` - Push schema to database
- `bun db:studio` - Open Drizzle Studio

## Configuration

**Root config** (`bos.config.json`):

```json
{
  "app": {
    "api": {
      "name": "api",
      "development": "http://localhost:3014",
      "production": "https://",
      "variables": {
        "NEAR_AI_MODEL": "deepseek-ai/DeepSeek-V3.1"
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
