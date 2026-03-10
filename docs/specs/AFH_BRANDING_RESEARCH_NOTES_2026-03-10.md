# AFH Branding Research Notes (NotebookLM)
Date: 2026-03-10 ET
Ticket: AFH-RESEARCH-018

## What was done
- Ran 5 NotebookLM research prompts against notebook:
  - https://notebooklm.google.com/notebook/123d7e8b-cc3c-4985-a387-c3399911e863
- Topics queried:
  - MVP feature set
  - v1/v2 phased rollout
  - minimal data model
  - low-clutter UX flow
  - risk assessment

## Key finding
NotebookLM reported missing direct AFH/Branding-Day context for multiple prompts.
This means the notebook currently lacks the full AFH product spec and explicit Timelaps comparison context.

## Usable outputs from this pass
1. MVP direction (usable as draft):
- Funnel snapshot
- Moments snapshot
- Channel mix
- Weekly action queue
- AI summary card (what changed / why / next actions)

2. Data model draft entities:
- Branding campaign
- Campaign performance snapshots
- AI rolling prediction entity with 60-day window

3. UX direction:
- Stepwise, low-clutter sequence
- Action-focused sections with minimal cognitive load

## Gaps / blocker
- Notebook cannot produce reliable AFH-specific v1/v2 prioritization until AFH spec is ingested.
- Risk model returned incomplete due to missing AFH source context.

## Next required action (must do before next research pass)
Upload this source into the NotebookLM notebook:
- /Users/yaz_malware_honeypot/Library/CloudStorage/GoogleDrive-yison@cyberamira.co/My Drive/Intel_llc/99_Working/ai_focus_hub/app/docs/specs/AFH_FULL_APP_SPEC.md

## Next prompt pack (ready to run after source upload)
1) "Using AFH_FULL_APP_SPEC.md + existing notebook sources, create a Timelaps-inspired AFH Branding Day Mode MVP with exactly 5 features and rank by impact vs effort."
2) "Create a 6-week build plan with week-by-week milestones, dependencies, and acceptance tests."
3) "Design risk register for AFH branding mode: security, data quality, hallucination risk, and dashboard overload risk."
4) "Produce a Notion-ready implementation checklist with AFH-RESEARCH subtask mapping."

## Recommendation
Do one more NotebookLM pass immediately after ingesting AFH_FULL_APP_SPEC.md, then freeze MVP scope and start AFH-RESEARCH-019/020/021 execution.
