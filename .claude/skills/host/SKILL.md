---
name: host
description: Review the Host package for server setup, Module Federation runtime, authentication, and bos.config.json configuration. Use when user says /host or asks to review the host.
allowed-tools: Read, Grep, Glob
user-invocable: true
---

# Host Package Review

Review the `host/` package for quality, consistency, and Module Federation best practices.

## Scope

```
host/
├── server.ts                   # Entry point
├── bootstrap.ts                # Remote host loader
├── src/
│   ├── program.ts              # Main server program
│   ├── ui.tsx                  # UI rendering
│   ├── types.ts                # Type definitions
│   ├── db/
│   │   └── schema/
│   │       └── auth.ts         # Auth schema
│   ├── layers/
│   │   └── index.ts            # Effect layers composition
│   ├── lib/
│   │   └── schemas.ts          # Shared schemas
│   ├── services/
│   │   ├── auth.ts             # Better-Auth setup
│   │   ├── config.ts           # Runtime config loader (bos.config.json)
│   │   ├── context.ts          # Request context
│   │   ├── database.ts         # Database connection
│   │   ├── errors.ts           # Error types
│   │   ├── federation.server.ts  # UI module loading
│   │   ├── plugins.ts          # API plugin loading
│   │   └── router.ts           # Router creation
│   └── utils/
│       └── logger.ts           # Logging utility
├── migrations/                 # Drizzle migrations
├── drizzle.config.ts           # Drizzle config
├── rsbuild.config.ts           # Build configuration
└── package.json
bos.config.json                 # Central runtime configuration (root level)
```

## Review Checklist

### 1. Server Setup
- [ ] Hono.js configured correctly in `src/program.ts`
- [ ] CORS configured with `CORS_ORIGIN` or config URLs
- [ ] Health endpoint at `/health`
- [ ] Error handling middleware

### 2. Configuration Loading
- [ ] `src/services/config.ts` parses `bos.config.json` correctly
- [ ] Environment-based URL switching (dev/prod)
- [ ] Secret loading from environment variables
- [ ] Variables vs secrets distinction

### 3. Plugin Runtime
- [ ] `src/services/plugins.ts` uses every-plugin runtime
- [ ] Secrets extracted from environment
- [ ] Plugin URL resolved from config
- [ ] Error handling for plugin load failures

### 4. Authentication
- [ ] `src/services/auth.ts` uses Better-Auth
- [ ] NEAR Protocol auth via better-near-auth
- [ ] Session management
- [ ] Auth routes at `/api/auth/*`

### 5. Module Federation
- [ ] `src/services/federation.server.ts` loads UI remote
- [ ] SSR rendering via `loadRouterModule`
- [ ] Fallback behavior when module not loaded

### 6. bos.config.json
- [ ] All apps configured (host, ui, api)
- [ ] Development and production URLs
- [ ] API variables include NEAR_AI_MODEL
- [ ] API secrets include all required keys
- [ ] Host secrets include auth secrets

### 7. Effect-TS Architecture
- [ ] Services use Effect Service pattern
- [ ] Layers composed in `src/layers/index.ts`
- [ ] Proper error handling with ConfigError, etc.

## Key Files to Check

1. `server.ts` - Entry point
2. `src/program.ts` - Main server logic
3. `src/services/config.ts` - Configuration loader
4. `src/services/auth.ts` - Authentication setup
5. `src/services/plugins.ts` - Plugin loading
6. `src/services/federation.server.ts` - UI module loading
7. `src/services/router.ts` - Route creation
8. `src/layers/index.ts` - Layer composition
9. `../bos.config.json` - Central config

## Output Format

Provide a structured review:

```
## Host Package Review

### Summary
[Overall assessment]

### Issues Found
1. [File:line] - [Issue description]

### Recommendations
- [Improvement suggestions]

### Status: [PASS/NEEDS_WORK]
```
