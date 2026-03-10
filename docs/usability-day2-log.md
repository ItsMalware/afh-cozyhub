# AFH-BUILD-010 Day 2 Usability Log

Date: 2026-03-07 (America/New_York)

## Execution

- Ran 2 additional end-to-end start/complete session cycles through live API routes.
- Performed 1 focused validation cycle after mapper fixes against a queued task with planned minutes > 0.

## Bugs Found + Fixed During Day 2

- Bug: task queue status mapping treated `In progress`/`Working` task statuses as `LIVE`, which could incorrectly imply an active session.
  - Fix: split status mapping into task-status and session-status mappers; only session statuses map `progress/started/working` to `LIVE`.

- Bug: completed session rows in current Notion schema were missing `Date` and `Minutes`, so focused-minute aggregation frequently remained zero for new runs.
  - Fix: schema-aware writes now set `Date` and `Minutes` on session start/complete, with fallback support for generic date/number field names.

- Bug: planned duration parsing missed common Notion formats (formula string/rich text and duration strings).
  - Fix: added duration normalization (`1.5h`, `90m`, `1:30`, numeric text) and stronger numeric extraction across formula/rich_text/title inputs.

- Bug: AFH meta tracking tickets could appear in focus queue and be auto-marked `Done` after session completion.
  - Fix: exclude `[AFH-*-###]` meta tracking rows from executable focus queue; reset `AFH-BUILD-010` status back to `In progress`.

## Validation Evidence

- Build checks: `npm run lint` and `npm run build` passed.
- API smoke checks: `/api/dashboard`, `/api/focus/start`, `/api/focus/complete` returned `200` on validation runs.
- Notion session verification: latest session row now persists `Minutes=90` and `Date=<timestamp>` (previous rows had null for both fields).

## Friction Notes

- Historical session rows created before Day 2 fixes still contain null `Minutes`/`Date` values and are not backfilled.
- Open queue still includes many non-focus tasks with zero planned minutes due source-data conventions.

## Proposed Day 3 Focus

- Add a safe backfill utility for historical session rows missing `Minutes`/`Date`.
- Add optional task-duration defaults for content/ops tasks with empty effort fields.
