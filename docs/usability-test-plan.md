# AFH-BUILD-010: 7-Day Usability Test Plan

## Goal

Validate whether AI Focus Hub improves daily execution quality, reduces context-switching, and produces actionable closeout data for v1 scope lock.

## Test Window

- Duration: 7 consecutive days
- Timezone: America/New_York
- Daily usage target: at least 2 focus sessions/day

## Daily Protocol

1. Open dashboard and start the recommended focus block.
2. Complete at least two sessions with outcomes, blockers, and follow-ups.
3. Trigger reminder sweep endpoint at least twice:
   - Midday check
   - End-of-day check
4. Capture friction events in the log template below.

## Metrics To Track

- Session completion rate: completed sessions / started sessions
- Average planned vs actual focus minutes
- Recommendation relevance (subjective score 1-5)
- Reminder usefulness (subjective score 1-5)
- Number of manual corrections needed in Notion data
- Errors observed in API/UI flows

## Friction Log Template (per day)

- Date:
- Sessions started:
- Sessions completed:
- Top blocker:
- UI friction points:
- Data sync issues:
- Reminder quality notes:
- Proposed fix:
- Severity (Critical/High/Medium/Low):

## Gap Consolidation Rules (Day 7)

1. Group findings into:
   - Reliability
   - UX/Workflow
   - Data quality
   - Automation/reminders
2. Mark each finding with severity and estimated implementation effort.
3. Keep v1 scope lock to:
   - Critical issues
   - High impact / low-medium effort issues
4. Move all non-critical items to post-v1 backlog.

## Deliverables At End Of Test

- Consolidated gap report with ranked list
- v1 scope lock checklist
- Recommended immediate fixes for next sprint
