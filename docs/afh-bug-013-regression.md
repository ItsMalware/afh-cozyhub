# AFH-BUG-013 Regression Note

Date: 2026-03-07 (America/New_York)

## Scope Covered

- Prime chat now calls a real AI backend when `OPENAI_API_KEY` is configured.
- Chat API gracefully falls back to deterministic local replies if AI is unavailable.
- Special-agent descriptions in Agent Teams are now fully clickable action cards that trigger targeted prompts.

## Manual Verification

1. Add `OPENAI_API_KEY` to `.env.local` and restart dev server.
2. Open Agent Teams and send a free-form message in chat.
3. Confirm `/api/chat` returns `source: "openai"` and response is AI-generated.
4. Click each special-agent card (`Content`, `Ops`, `Research`, `Admin`).
5. Confirm each click posts a corresponding user message and receives a Prime response.
6. Remove `OPENAI_API_KEY` and retry one chat request.
7. Confirm response still succeeds with `source: "fallback"`.

## Files Changed

- `src/app/api/chat/route.ts`
- `src/app/page.tsx`
- `src/app/globals.css`
- `.env.example`
- `README.md`
