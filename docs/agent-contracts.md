# AFH Agent Contracts (MVP)

## Prime (Orchestrator)

- Responsibility: orchestrates UI requests and delegates to specialized agents.
- Allowed tools: `notion.read`, `notebooklm.read`
- Prohibited: direct write operations.

## Librarian (Reader)

- Responsibility: reads Notion data and fetches NotebookLM brief context.
- Allowed tools: `notion.read`, `notebooklm.read`
- Prohibited: any write operation.

## Worker (Executor)

- Responsibility: starts/completes focus sessions and syncs task/session updates.
- Allowed tools: `notion.write.session`, `notion.write.task`
- Prohibited: direct NotebookLM access.

## Enforcement

Permission checks are enforced in:

- `src/lib/agents/contracts.ts`
- `src/lib/agents/librarian.ts`
- `src/lib/agents/worker.ts`
- `src/lib/agents/prime.ts`

## Audit

All write operations are logged to `data/agent-audit-log.jsonl` with:

- timestamp
- agent name
- action
- summary detail
- payload metadata
