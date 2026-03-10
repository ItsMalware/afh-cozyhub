# Lint Debt Scope for v0.1

Date: 2026-03-10 (ET)

## Purpose
Temporary ESLint scope reduction to ship `v0.1.0` safely while preserving a clear cleanup target.

## Temporarily Scoped Rules
- `@typescript-eslint/ban-ts-comment`
- `@typescript-eslint/no-explicit-any`

## Scoped Files
- `src/app/api/chat/route.ts`
- `src/app/api/notion/schema/route.ts`
- `src/app/api/notion/task-assigned/route.ts`
- `src/lib/agent-notes.ts`
- `src/lib/agents/load-balancer.ts`
- `src/lib/agents/triage.ts`
- `src/lib/brand-operator.ts`
- `src/lib/news-signals.ts`
- `src/lib/notion-client.ts`

## Exit Criteria
1. Remove `@ts-nocheck` usage from the scoped files.
2. Replace `any` with explicit request/response and Notion payload types.
3. Remove temporary overrides from `eslint.config.mjs`.
4. Run `npm run lint -- src` with zero errors and zero warnings.
