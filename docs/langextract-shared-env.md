# LangExtract Shared-Key Wiring

Date: 2026-03-08

## What changed
- Added bridge script: `tools/langextract/langextract_bridge.py`
- Added npm scripts:
  - `npm run langextract:status`
  - `npm run langextract:extract -- --text "..."`

## Key reuse behavior
The bridge auto-loads AFH app env files and reuses existing app keys:
1. `.env.local`
2. `.env`

Provider/model selection order:
1. `LANGEXTRACT_API_KEY` + optional `LANGEXTRACT_MODEL_ID`
2. `GEMINI_API_KEY` + `GEMINI_CHAT_MODEL`
3. `OPENAI_API_KEY` + `OPENAI_CHAT_MODEL`

So if your app keys are already set, LangExtract uses the same credentials.

## Example commands
```bash
npm run langextract:status
npm run langextract:extract -- --text "CVE summary text here" --dry-run
npm run langextract:extract -- --text "CVE summary text here" --json-out data/langextract-last.json
```

## Output shape
The bridge normalizes extraction into concise fields for downstream tasking:
- `impact`
- `severity`
- `action`
- `due`

and also returns raw extraction rows for debugging.
