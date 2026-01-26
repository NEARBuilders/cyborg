---
name: ui
description: Review the UI package for React components, TanStack Router routes, styling, and frontend best practices. Use when user says /ui or asks to review the UI.
allowed-tools: Read, Grep, Glob
user-invocable: true
---

# UI Package Review

Review the `ui/` package for quality, consistency, and best practices.

## Scope

```
ui/
├── src/
│   ├── router.tsx              # Client router
│   ├── router.server.tsx       # Server router (SSR)
│   ├── hydrate.tsx             # Client hydration entry
│   ├── components/
│   │   ├── index.ts            # Public component exports
│   │   ├── chat/               # Chat feature components
│   │   │   ├── chat-input.tsx
│   │   │   ├── chat-message.tsx
│   │   │   └── chat-page.tsx
│   │   ├── kv/                 # Key-value editor
│   │   │   └── kv-editor.tsx
│   │   └── ui/                 # shadcn/ui primitives
│   ├── hooks/
│   │   ├── index.ts
│   │   └── use-client.ts
│   ├── lib/
│   │   ├── auth-client.ts      # better-auth client
│   │   ├── auth-utils.ts       # Auth utilities
│   │   ├── session.ts          # Session management
│   │   └── utils.ts            # General utilities (cn)
│   ├── providers/
│   │   └── index.tsx           # Context providers
│   ├── routes/                 # TanStack file-based routes
│   │   ├── __root.tsx
│   │   ├── _layout.tsx
│   │   └── _layout/
│   │       ├── _authenticated.tsx
│   │       ├── login.tsx
│   │       └── _authenticated/
│   ├── types/
│   │   └── index.ts
│   ├── utils/
│   │   ├── orpc.ts             # oRPC client setup
│   │   └── stream.ts           # Streaming utilities
│   └── integrations/
│       └── tanstack-query/
│           └── devtools.tsx
├── rsbuild.config.ts           # Build configuration
└── package.json
```

## Review Checklist

### 1. Component Quality
- [ ] Components use semantic Tailwind classes (`bg-background`, not `bg-blue-600`)
- [ ] Props are properly typed with TypeScript
- [ ] No unused imports or variables
- [ ] Proper error boundaries and loading states
- [ ] Files follow **kebab-case** naming convention

### 2. Route Structure
- [ ] Routes follow TanStack Router conventions
- [ ] Protected routes use `_authenticated` layout
- [ ] Admin routes use `_authenticated/_admin` layout
- [ ] Route components are properly exported

### 3. API Integration
- [ ] Uses oRPC client from `utils/orpc.ts`
- [ ] TanStack Query for data fetching
- [ ] Streaming via `utils/stream.ts`
- [ ] Proper error handling with toast notifications

### 4. Styling
- [ ] Semantic color tokens (not hardcoded colors)
- [ ] Responsive design patterns
- [ ] shadcn/ui components used consistently
- [ ] Tailwind CSS v4 conventions

### 5. Module Federation
- [ ] Exports defined in `rsbuild.config.ts`
- [ ] Shared dependencies configured correctly
- [ ] SSR build separate from client build

### 6. Performance
- [ ] Proper use of `useMemo` and `useCallback`
- [ ] No unnecessary re-renders
- [ ] Lazy loading for heavy components

## Key Files to Check

1. `src/router.tsx` - Client router setup
2. `src/router.server.tsx` - SSR router
3. `src/components/index.ts` - Public exports
4. `src/components/chat/chat-page.tsx` - Chat feature
5. `src/utils/orpc.ts` - API client setup
6. `src/utils/stream.ts` - Streaming utilities
7. `src/lib/auth-client.ts` - Auth client
8. `src/routes/_layout/_authenticated.tsx` - Auth guard
9. `rsbuild.config.ts` - Build configuration

## Output Format

Provide a structured review:

```
## UI Package Review

### Summary
[Overall assessment]

### Issues Found
1. [File:line] - [Issue description]

### Recommendations
- [Improvement suggestions]

### Status: [PASS/NEEDS_WORK]
```
