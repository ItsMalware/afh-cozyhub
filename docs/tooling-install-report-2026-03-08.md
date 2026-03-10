# AFH Tooling Install Report (2026-03-08)

## Installed

### LangExtract
- Type: Python package
- Env: `.venv-langextract`
- Install command used: `.venv-langextract/bin/pip install langextract`
- Verification: importable package with dependencies resolved.

### Plate
- Type: React rich editor package
- Package: `@udecode/plate`
- Install command used: `npm install @udecode/plate`
- Verification: package added to `package.json` and lockfile.

### WebMCP demo
- Type: reference repo (MCP wiring patterns)
- Path: `tools/agent-lab/webmcp-demo`
- Install method: `git clone --depth=1`

### Sandbox Agent
- Type: reference repo (isolated execution patterns)
- Path: `tools/agent-lab/sandbox-agent`
- Install method: `git clone --depth=1`

## Existing related tooling
- ReMe bridge: `tools/reme/reme_bridge.py`
- OpenClaw reference: `tools/agent-lab/openclaw`
- Agent-Zero reference: `tools/agent-lab/agent-zero`
- Wigggle UI reference: `tools/agent-lab/ui`

## Recommended next integration tasks
1. Add `langextract` adapter endpoint for concise CVE/news extraction to fixed fields (`impact`, `severity`, `action`, `due`).
2. Add Plate-based editor panel for Agent Notes drafting and task refinement.
3. Port WebMCP demo patterns into AFH tool adapter layer (`src/lib/agents/*`) with explicit capability registry.
4. Design a sandbox execution boundary (from sandbox-agent concepts) before enabling autonomous code actions in production.

## Prerequisites for deeper use
- LangExtract model/provider keys as needed by your chosen backend.
- Security policy for sandbox execution (allowed commands, filesystem boundaries, secret handling).
