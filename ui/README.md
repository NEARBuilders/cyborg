# ui

Frontend application for NEAR AI chat with streaming responses and KV store demo.

## Tech Stack

- **Framework**: React 19
- **Routing**: TanStack Router (file-based)
- **Data**: TanStack Query + oRPC client
- **Styling**: Tailwind CSS v4
- **Build**: Rsbuild + Module Federation
- **Auth**: better-auth client

## Module Federation

Exposed as remote module for host consumption via `remoteEntry.js`:

| Export | Path | Description |
|--------|------|-------------|
| `./App` | `bootstrap.tsx` | Main app component |
| `./Router` | `router.tsx` | TanStack Router instance |
| `./components` | `components/index.ts` | Reusable UI components |
| `./providers` | `providers/index.tsx` | Context providers |
| `./types` | `types/index.ts` | TypeScript types |

**Shared dependencies** (singleton):

- `react`, `react-dom`
- `@tanstack/react-query`, `@tanstack/react-router`

**Configuration** (`bos.config.json`):

```json
{
  "app": {
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
    }
  }
}
```

## Available Scripts

- `bun dev` - Start dev server (port 3002)
- `bun build` - Build for production
- `bun preview` - Preview production build
- `bun typecheck` - Type checking

## Project Structure

- `src/routes/` - File-based routes (TanStack Router)
  - `/` - Chat interface (canonical)
  - `/chat` - Redirect alias to `/`
  - `/dashboard` - Admin dashboard (role-gated)
- `src/components/` - UI components (shadcn/ui)
  - `chat/` - Chat UI components
  - `kv/` - Key-value store demo
- `src/utils/` - API client (oRPC)
- `src/lib/` - Auth client (Better-Auth + NEAR)
