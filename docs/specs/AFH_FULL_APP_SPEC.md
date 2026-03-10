# AI Focus Hub (AFH) Full App Spec

## 1. Product Vision
AI Focus Hub is a founder execution system that turns a multi-company workload into a calm, day-owner workflow with agent support.
Primary goals:
- Reduce cognitive overload by showing only the right tasks for today.
- Enforce a weekly company-day schedule with Friday loose-ends.
- Use agents to capture, route, execute, and log work with truthful status.
- Keep one source of truth in Notion while leveraging NotebookLM for research and briefs.

## 2. Founder Profile + UX Constraints
This product is explicitly designed for ADHD/OCD/Autism-friendly operation:
- Low-clutter dashboard.
- Single-day focus, not full backlog exposure.
- Gentle nudges, clear next action, minimal decision friction.
- Cozy glass-morphism visual language with readable contrast.

## 3. Core User Outcomes
- Know exactly which company to focus on today.
- See only today's actionable tasks.
- Start/complete focus sessions quickly.
- Offload task routing and execution tracking to agent teams.
- Produce weekly content + operations cadence across all companies.

## 4. Company Portfolio Model
Current companies:
- IndigoINT
- Osmara Atelier
- Bytes' Atelier
- Yen Stays

Default weekday owner model (ET):
- Monday: Yen Stays
- Tuesday: IndigoINT
- Wednesday: Bytes' Atelier
- Thursday: Osmara Atelier
- Friday: Loose Ends + Weekly Planning + Etsy update batch
- Weekend: minimal/no work

Config source (env):
- FOCUS_WEEKDAY_COMPANIES
- FOCUS_LOOSE_END_DAYS
- SMS_TIMEZONE=America/New_York

## 5. Information Architecture
Screens:
- Dashboard
- Focus Timer
- Agent Teams
- News & Signals
- Notifications

### Dashboard
Must include:
- Date + sync state
- Today's Focus Queue (strict due-today only)
- Recommended next task
- Business balance cards (readable percentages)
- Behind-target highlights
- Minimal surface area (no full backlog noise)

### Focus Timer
- Start/stop/complete session
- Logs session minutes/hours to Notion
- Supports unpaid hours tracking (Hours_cmmd_hub)

### Agent Teams
- Prime orchestrator + specialist teams/sub-agents
- Live execution board with truthful states:
  - waiting
  - dispatched
  - completed
  - failed
- No fake completion without real connector acceptance

### News & Signals
- Threat intel + AI/agent updates
- Short summaries with expandable detail
- Save-to-Notion action path

## 6. Integrations
### Notion (source of operational truth)
Databases:
- Tasks: bf1abfa5-fb44-4d10-a753-8318ed46f276
- Businesses: 4367f36e-8d8a-472d-bbdb-e4082c656265
- Projects: e18ad6d6-549c-45b5-a8bb-6a46d13ef41e
- Sessions: 90fd462d-33a5-427d-bd23-5cd1a84763b8

Task template fields (required default coverage):
- Name (title)
- Status (prefer: This Week)
- Priority (app-origin defaults high unless explicitly lower)
- Task Type
- Queue Label (Founder To-Do / Agent Inbox / Agent Log / System Signal)
- Due Date
- Business (relation)
- Linked Project (relation)
- Hours_cmmd_hub

### NotebookLM
- Pre-session briefs (read-only)
- Research synthesis for trend analysis and planning
- Weekly insight generation for brand/intel workflows

### Google Workspace CLI
- Gmail/Drive/Docs/Sheets/Calendar/Tasks/Chat integration support
- Project-local auth config path (.gws)

## 7. Agent Orchestration Requirements
### Role Model
- Prime: orchestration + delegation planning
- Specialists: execution (codex/antigravity/domain specialists)
- Librarian: memory/indexing/synthesis
- IT Guard: monitoring + incident ticketing + safe autofix

### Run Lifecycle
1. Task created in Notion or app
2. Router selects connector/team
3. Connector webhook accepts run (2xx required for dispatched)
4. Work execution
5. Completion callback writes:
   - status done
   - work summary
   - Hours_cmmd_hub
6. Audit log entry created

### Truthfulness Rules
- If connector unavailable/unconfigured => waiting (not dispatched)
- No simulated completion unless explicitly enabled for local testing
- App UI must reflect actual run state

## 8. Scheduling + Planning Logic
- Weekday owner enforces one-company focus/day.
- Friday reserved for loose ends, planning, carryover cleanup, Etsy operations.
- Quarterly planning is collaborative between founder + Prime.
- Social/content cadence is pre-planned with sensible due windows (avoid dashboard overload).

## 9. Branding Day Mode (Timelaps-inspired)
Objective: add a dedicated branding analytics mode for brand-heavy days.

MVP widgets:
- Funnel Snapshot
- Moments Snapshot
- Channel Mix
- Weekly Action Queue
- AI insight card: what changed, why it matters, what to do next

v1 extensions:
- Per-company drilldowns
- Attributes/associations trend tracking
- Prediction panel (7-day directional forecast using 60-day context)

## 10. Mobile + Desktop Requirements
Targets:
- OnePlus Fold phone app experience
- MacBook app/web experience

Needs:
- Responsive layout (no full-width overflow blocks on mobile)
- Notification support (gentle reminders, wake nudges, burnout guardrails)
- Optional alarm-style wake reminder logic tied to monthly revenue goal

## 11. Notifications + Wellbeing Rules
- Burnout prevention reminder after prolonged continuous work.
- "Take a break" CTA after 2 hours sustained work.
- Day progress/status bar from green to red over day timeline.
- Gentle tone, not punitive.

## 12. Content/Outreach Operating Requirements
- Weekly content per company, mapped by platform.
- LinkedIn emphasis for IndigoINT + Bytes' Atelier.
- Osmara specific cadence includes weekly startup review video and IG continuity.
- Tasks should avoid becoming open-ended clutter; due-date discipline required.

## 13. Security + Reliability
- Secure coding baseline and review process required.
- Agent actions logged with auditability.
- Secrets never committed.
- Connector endpoints protected with optional shared secret.
- Error paths generate actionable tickets, not silent failures.

## 14. OSS vs Private Split
Private AFH:
- Notion live bi-sync
- NotebookLM integrations
- Proprietary agent orchestration

OSS AFH core:
- Reusable UI shell
- Public-safe abstractions
- No private keys/data coupling

## 15. Implementation Priorities (Current)
P0:
- Truthful agent dispatch + completion
- Task template consistency across all creators
- Dashboard focus-mode strictness
- Mobile layout fixes

P1:
- Branding Day Mode MVP
- Weekly threat intel public review + 60-day AI prediction
- IT Guard baseline

P2:
- Expanded cross-app integrations
- Advanced analytics and prediction quality tuning

## 16. Definition of Success
- Founder opens dashboard and sees only today's focus work.
- Agent state is reliable and actionable.
- Weekly planning + loose-ends flow is stable.
- Brand/intel outputs are generated on schedule without manual firefighting.
- Notion remains clean, structured, and queryable.
