# AFH Branding NotebookLM Prompt Pack

## Purpose
Standard prompts for the AFH Branding Day weekly summary pipeline (`AFH-RESEARCH-021`).

## Primary Pipeline Prompt (Monday Night Run)
Use this prompt shape when generating weekly summary + 7-day prediction:

```text
You are generating a weekly branding summary for AFH.
Return JSON only with this shape:
{ "summary": string, "drivers": string[], "recommendedActions": string[], "assumptions": string[], "confidence": number, "prediction": { "direction": "up|down|flat", "confidence": number, "rationale": string }, "snapshot": { "funnel": { "awareness": number, "consideration": number, "conversion": number, "loyalty": number }, "moments": { "strength": number, "momentum": number, "notes": string }, "channelMix": { "Instagram": number, "TikTok": number, "YouTube": number, "LinkedIn": number, "Facebook": number, "Pinterest": number }, "sourceRefs": string[] } }
Rules: confidence values are 0..1. Percentages are 0..100. recommendedActions max 5. drivers max 5.
Company: {company_name}
Week key: {week_key}
Period: {period_start} to {period_end}
Prior snapshot: {prior_snapshot_or_unavailable}
Current queue:
{active_queue_items}
Focus on clear actions that improve revenue and execution quality for next 7 days.
```

## Strict Formatting Prompt (Recovery)
Use if NotebookLM returns non-JSON content:

```text
Reformat your previous answer to valid JSON only.
No markdown and no prose.
Use exactly the schema requested in the prior prompt.
```

## Quality Gate Prompt (Optional Manual QA)
Use after generation if confidence is below 0.5:

```text
Review this weekly summary for execution quality.
Return 3 concise improvements:
1) one stronger revenue action
2) one risk mitigation action
3) one clearer metric to monitor next week
Keep total under 90 words.
```

## Scheduling Note
- Intended run window: Monday nights (ET), ready by Tuesday morning.
- Endpoint: `POST /api/branding-day/weekly-summary/run`
- Auth headers supported:
  - `x-branding-token: <BRANDING_WEEKLY_JOB_TOKEN>`
  - `Authorization: Bearer <BRANDING_WEEKLY_JOB_TOKEN>`

## Automation Wiring (Implemented)
- Existing cron route `/api/reminders/run` now also executes the weekly branding scheduler.
- Current cron in `vercel.json`: hourly (`0 * * * *`).
- Weekly scheduler gate:
  - Runs only on Monday after configured cutoff (default 21:00 ET).
  - One-run-per-week-per-company guard persisted in `data/branding-weekly-summary-state.json`.
- Optional force payload for manual/testing:
  - `{"forceWeeklyBranding":true, "runAllBusinesses":true}`
