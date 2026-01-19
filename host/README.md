# host

Server host for the application with authentication and Module Federation.

## Architecture

The host orchestrates two federation systems:

```
┌─────────────────────────────────────────────────────────┐
│                        host                             │
│                                                         │
│  ┌────────────────────────────────────────────────┐     │
│  │                  server.ts                     │     │
│  │  Hono.js + oRPC handlers                       │     │
│  └────────────────────────────────────────────────┘     │
│           ↑                         ↑                   │
│  ┌────────┴────────┐       ┌────────┴────────┐          │
│  │ bos.config.json │       │ bos.config.json │          │
│  │ UI Federation   │       │ API Plugins     │          │
│  └────────┬────────┘       └────────┬────────┘          │
│           ↓                         ↓                   │
│  ┌─────────────────┐       ┌─────────────────┐          │
│  │ Module Fed      │       │ every-plugin    │          │
│  │ runtime         │       │ runtime         │          │
│  └─────────────────┘       └─────────────────┘          │
│           ↓                         ↓                   │
│  ┌─────────────────┐       ┌─────────────────┐          │
│  │ React app       │       │ oRPC router     │          │
│  │ (SSR/CSR)       │       │ (merged)        │          │
│  └─────────────────┘       └─────────────────┘          │
└─────────────────────────────────────────────────────────┘
```

## Configuration

All runtime configuration is in `bos.config.json` at the project root:

```json
{
  "account": "agency.near",
  "app": {
    "host": {
      "title": "agent",
      "development": "http://localhost:3001",
      "production": "https://"
    },
    "ui": {
      "name": "ui",
      "development": "http://localhost:3002",
      "production": "https://",
      "exposes": {
        "App": "./App",
        "components": "./components",
        "providers": "./providers",
        "types": "./types"
      }
    },
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

**Router Composition** (`routers/index.ts`):

```typescript
return {
  ...baseRouter,           // /health, /status
  ...plugins.api.router,   // plugin routes
}
```

## Tech Stack

- **Server**: Hono.js + @hono/node-server
- **API**: oRPC (RPC + OpenAPI)
- **Auth**: Better-Auth + better-near-auth
- **Database**: SQLite (libsql) + Drizzle ORM
- **Build**: Rsbuild + Module Federation
- **Plugins**: every-plugin runtime

## Available Scripts

- `bun dev` - Start dev server (Host: 3001, UI: 3002, API: 3014)
- `bun build` - Build for production
- `bun preview` - Run production server
- `bun db:migrate` - Run migrations
- `bun db:studio` - Open Drizzle Studio

## API Routes

- `/api/auth/*` - Authentication endpoints (Better-Auth)
- `/api/rpc/*` - RPC endpoint (batching supported)
- `/api/*` - REST API (OpenAPI spec)
- `/health` - Health check

## Adding New Plugins

1. Add plugin to `bos.config.json`:
```json
{
  "app": {
    "new-plugin": {
      "name": "new-plugin",
      "development": "http://localhost:3015",
      "production": "https://cdn.example.com/plugin/remoteEntry.js",
      "variables": {},
      "secrets": []
    }
  }
}
```

2. Plugin router is automatically merged in `routers/index.ts`
