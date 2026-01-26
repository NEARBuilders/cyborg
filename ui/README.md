# ui

Remote frontend module with TanStack Router and SSR support.

## Module Federation

Exposed as remote module for host consumption via `remoteEntry.js`:

| Export | Path | Description |
|--------|------|-------------|
| `./Router` | `router.tsx` | TanStack Router instance (client) |
| `./Hydrate` | `hydrate.tsx` | Client hydration entry |
| `./components` | `components/index.ts` | Reusable UI components |
| `./providers` | `providers/index.tsx` | Context providers |
| `./hooks` | `hooks/index.ts` | React hooks |
| `./types` | `types/index.ts` | TypeScript types |

**SSR Build** also exposes:
- `./Router` → `router.server.tsx` (server-side rendering)

**Shared dependencies** (singleton):

- `react`, `react-dom`
- `@tanstack/react-query`, `@tanstack/react-router`
- `@hot-labs/near-connect`, `near-kit`

## Route Protection

File-based routing with auth guards via TanStack Router:

- `_authenticated.tsx` - Requires login, redirects to `/login`
- `_authenticated/_admin.tsx` - Requires admin role

## Directory Structure

```
ui/
├── src/
│   ├── router.tsx          # Client router
│   ├── router.server.tsx   # Server router (SSR)
│   ├── hydrate.tsx         # Client hydration entry
│   ├── components/
│   │   ├── index.ts        # Public component exports
│   │   ├── chat/           # Chat feature components
│   │   ├── kv/             # Key-value editor
│   │   └── ui/             # shadcn/ui primitives
│   ├── hooks/              # React hooks
│   ├── lib/                # Utilities (auth-client, utils)
│   ├── providers/          # Context providers
│   ├── routes/             # TanStack file-based routes
│   ├── types/              # TypeScript types
│   └── utils/              # API client (oRPC, streaming)
├── rsbuild.config.ts       # Build configuration
└── package.json
```

## Tech Stack

- **Framework**: React 19
- **Routing**: TanStack Router (file-based)
- **Data**: TanStack Query + oRPC client
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Build**: Rsbuild + Module Federation
- **Auth**: better-auth client

## Available Scripts

- `bun dev` - Start dev server (port 3002)
- `bun build` - Build for production (client + server)
- `bun build:client` - Build client bundle only
- `bun build:server` - Build SSR bundle only
- `bun typecheck` - Type checking

## Configuration

**bos.config.json**:

```json
{
  "app": {
    "ui": {
      "name": "ui",
      "development": "http://localhost:3002",
      "production": "https://cdn.example.com/ui",
      "ssr": "https://cdn.example.com/ui-ssr",
      "exposes": {
        "App": "./App",
        "components": "./components",
        "providers": "./providers",
        "types": "./types"
      }
    }
  }
}
```

## Component Conventions

- All component files use **kebab-case** naming: `chat-input.tsx`, `user-nav.tsx`
- UI primitives in `components/ui/` (shadcn/ui)
- Feature components in `components/<feature>/`
- Export public components via `components/index.ts`
