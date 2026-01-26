---
name: api
description: Review the API package for oRPC contracts, database schema, services, and every-plugin patterns. Use when user says /api or asks to review the API.
allowed-tools: Read, Grep, Glob
user-invocable: true
---

# API Package Review

Review the `api/` package for quality, consistency, and every-plugin best practices.

## Scope

```
api/
├── src/
│   ├── contract.ts         # oRPC route definitions
│   ├── index.ts            # Plugin definition (createPlugin)
│   ├── db/
│   │   ├── index.ts        # Database connection layer
│   │   ├── schema.ts       # Drizzle ORM schema
│   │   └── migrations/     # SQL migration files
│   └── services/
│       ├── index.ts        # Service exports
│       └── agent.ts        # NEAR AI integration
├── plugin.dev.ts           # Local dev configuration
├── drizzle.config.ts       # Drizzle config
└── package.json
```

## Review Checklist

### 1. Contract Definition
- [ ] All routes defined in `contract.ts`
- [ ] Input/output schemas use Zod
- [ ] Proper HTTP methods and paths
- [ ] OpenAPI metadata complete

### 2. Plugin Structure
- [ ] Uses `createPlugin()` from every-plugin
- [ ] Variables and secrets properly typed with Zod schemas
- [ ] Context schema defined (nearAccountId, role)
- [ ] Initialize returns `{ db, agentService }`
- [ ] Shutdown handler implemented

### 3. Database Schema
- [ ] Tables defined: `conversation`, `message`, `kvStore`
- [ ] Proper indexes for query performance
- [ ] Relations defined correctly with cascading deletes
- [ ] Per-user isolation via `nearAccountId`

### 4. Services
- [ ] AgentService integrates NEAR AI Cloud via OpenAI SDK
- [ ] Streaming chat implementation with async generators
- [ ] Conversation history management (context window)
- [ ] Graceful fallback when API key not configured

### 5. Router Handlers
- [ ] `requireAuth` middleware for protected routes
- [ ] `requireAdmin` middleware for admin routes
- [ ] Proper error handling with ORPCError
- [ ] Input validation via contract
- [ ] Date serialization to ISO strings

### 6. Configuration
- [ ] `plugin.dev.ts` matches production config
- [ ] Secrets: `API_DATABASE_URL`, `API_DATABASE_AUTH_TOKEN`, `NEAR_AI_API_KEY`, `NEAR_AI_BASE_URL`
- [ ] Variables: `NEAR_AI_MODEL`, `NEAR_AI_BASE_URL`

## Key Files to Check

1. `src/contract.ts` - API contract definitions
2. `src/index.ts` - Plugin implementation
3. `src/db/schema.ts` - Database tables
4. `src/db/index.ts` - Database connection
5. `src/services/agent.ts` - NEAR AI integration
6. `plugin.dev.ts` - Development configuration

## Output Format

Provide a structured review:

```
## API Package Review

### Summary
[Overall assessment]

### Issues Found
1. [File:line] - [Issue description]

### Recommendations
- [Improvement suggestions]

### Status: [PASS/NEEDS_WORK]
```
