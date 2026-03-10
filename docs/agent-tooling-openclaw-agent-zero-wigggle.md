# Agent Tooling Fit: OpenClaw + Agent-Zero + Wigggle UI

Date: 2026-03-08
Project: AI Focus Hub (AFH)

## What we can reuse now

### OpenClaw (high-value patterns, selective reuse)
- Reuse pattern: gateway-based routing (sessions/channels/webhooks) to route inbound work to the right agent workspace.
- Reuse pattern: skills governance (bundled/managed/workspace skill model) for safe enable/disable of specialist skills.
- Reuse pattern: channel integrations architecture if AFH later needs Slack/Discord/Teams inbox routing.
- Recommendation: do **not** embed full OpenClaw runtime into AFH MVP; use architecture patterns and optional sidecar deployment only.

### Agent-Zero (high-value for sub-agent hierarchy)
- Reuse pattern: superior/subordinate execution model (Prime -> specialists -> workers).
- Reuse pattern: persistent memory + per-project isolation to avoid context bleed across businesses.
- Reuse pattern: agent communication/reportback loops for traceability.
- Recommendation: port orchestration ideas into AFH internals before considering full framework embedding.

### Wigggle UI (high-value for front-end speed)
- Reuse model: copy/paste widgets and adapt to AFH design tokens.
- Good fit for: kawaii/cozy cards, tab shells, subtle motion blocks, clean dashboard primitives.
- Recommendation: treat as widget source library, not runtime dependency on their full app.

## Installed in local workspace

### Repos cloned for local reference
- `tools/agent-lab/openclaw`
- `tools/agent-lab/agent-zero`
- `tools/agent-lab/ui`

### AFH packages added for widget adoption
- `lucide-react`
- `class-variance-authority`
- `clsx`
- `tailwind-merge`
- `motion`

## Practical integration roadmap

1. Keep AFH as primary app runtime.
2. Upgrade current delegation logic to explicit hierarchy:
- Prime (orchestrator)
- Specialist teams (engineering, notion_ops, content_ops, automation, research)
- Worker roles (execution + reporting)
3. Add "agent capability registry" with skill gating and per-business memory scopes.
4. Add UI "Agent Workboard" panel showing active agents, assigned tasks, and latest status.
5. Import selected Wigggle components into `src/components` and skin to AFH cozy glass theme.

## User action required

- None required for the installs above.
- Optional next step: if you want a full OpenClaw sidecar or full Agent-Zero runtime, we should create dedicated infra tickets first (Docker, security boundaries, secrets policy).
