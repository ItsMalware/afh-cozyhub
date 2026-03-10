# AFH-BUILD-010 Day 1 Usability Log

Date: 2026-03-07 (America/New_York)

## Baseline

- Businesses: 4
- Queue items: 44
- Planned minutes: 1200
- Focused minutes: 0
- Top behind business: Osmara Atelier (-300m)

## Execution

- Completed 2 full focus cycles (start + complete)
- Sessions executed:
  - IndigoINT - indioINT content
  - Yen Stays - Yen Stays Q1 wrap

## System Behavior Observed

- Minutes-gap recommender selected a NEXT task from real deficits.
- Reminder sweep endpoint returned expected skip/sent decision payloads.
- Session write + completion sync succeeded end-to-end.

## Bugs Found + Fixed During Day 1

- Bug: dashboard KPI baseline showed 0 planned minutes due schema mismatch.
  - Fix: schema-aware numeric parsing and fallback aggregation in Notion mapper.
- Bug: complete-session API response returned placeholder title/business.
  - Fix: return prior live-session context in completion payload.

## Post-Run Snapshot

- Planned minutes: 1200
- Focused minutes: 240
- Active session: none

## Friction Notes

- Some tasks still carry 0 planned minutes due source data quality in Notion task records.
- Action for Day 2: normalize planned-minute data entry conventions for all active queue tasks.
