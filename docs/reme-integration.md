# ReMe Integration (AFH)

## Installed location
- Python venv: `.venv-reme`
- Bridge CLI: `tools/reme/reme_bridge.py`
- ReMe config: `tools/reme/config.yaml`

## Commands
- `npm run reme:status`
- `npm run reme:add -- --text "memory text" --task afh`
- `npm run reme:retrieve -- --query "memory text" --task afh`
- `npm run reme:serve`

## Required env vars
ReMe retrieval requires LLM + embedding config. Set at least:
- `LLM_API_KEY` (or `OPENAI_API_KEY`)
- `EMBEDDING_API_KEY` (or `OPENAI_API_KEY`)

Optional:
- `LLM_BASE_URL`
- `EMBEDDING_BASE_URL`

## Notes
- Target scope must be exactly one of: `--user`, `--task`, or `--tool`.
- Without valid API keys/config, `status` works, but `add/retrieve` may fail with `'default'` from ReMe runtime.
