# Cloudflare Worker

This package contains the Cloudflare Worker that replaces the host + API packages for edge deployment.

## Setup

1. **Create D1 Database:**
   ```bash
   wrangler d1 create near-agent-db
   ```
   Then update `wrangler.toml` with the database_id from the output.

2. **Set Secrets:**
   ```bash
   wrangler secret put BETTER_AUTH_SECRET
   wrangler secret put NEAR_AI_API_KEY
   ```

3. **Run Migrations:**
   ```bash
   # Local development
   bun db:migrate:local

   # Production
   bun db:migrate
   ```

## Development

```bash
# From root
bun dev:worker

# Or from this directory
bun dev
```

The worker runs on http://localhost:8787 by default.

## Deployment

```bash
# Deploy worker
bun deploy

# Or from root
bun deploy:worker
```

## Architecture

```
worker/
├── src/
│   ├── index.ts          # Hono app entry point
│   ├── auth.ts           # Better-Auth with D1 adapter
│   ├── types.ts          # Environment bindings types
│   ├── db/
│   │   ├── index.ts      # Drizzle D1 client
│   │   └── schema.ts     # Database schema
│   ├── services/
│   │   ├── agent.ts      # NEAR AI chat service
│   │   ├── near.ts       # NEAR blockchain service
│   │   ├── builders.ts   # NEARBlocks API proxy
│   │   └── index.ts      # Service exports
│   └── routes/
│       └── api.ts        # API route handlers
├── migrations/
│   └── 0000_init.sql     # Initial D1 migration
├── wrangler.toml         # Cloudflare config
├── drizzle.config.ts     # Drizzle config for D1
└── package.json
```

## Environment Variables

Set in `wrangler.toml` `[vars]`:
- `NEAR_AI_MODEL` - AI model to use
- `NEAR_AI_BASE_URL` - NEAR AI API base URL
- `NEAR_RPC_URL` - NEAR RPC endpoint
- `NEAR_LEGION_CONTRACT` - NFT contract for ranks
- `NEAR_INITIATE_CONTRACT` - SBT contract for onboarding
- `NEAR_ACCOUNT` - Your NEAR account

## Secrets

Set via `wrangler secret put`:
- `BETTER_AUTH_SECRET` - Auth session signing secret
- `NEAR_AI_API_KEY` - NEAR AI API key
