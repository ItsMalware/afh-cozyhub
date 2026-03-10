# AFH Branding Mode Research - Final Recommendation Pack
Date: 2026-03-10 (ET)
Source: NotebookLM second pass after AFH spec ingestion
Notebook: https://notebooklm.google.com/notebook/123d7e8b-cc3c-4985-a387-c3399911e863

## 1) Recommended MVP (ranked by impact vs effort)
1. Weekly Action Queue (Impact 8 / Effort 3)
- Why: strongest alignment with single-day focus and anti-overload rules.
- Data: Notion Tasks filtered by due date/status/queue label.
- KPI: daily queue completion/dispatch rate.

2. AI Insight Card: what changed / why it matters / next actions (Impact 9 / Effort 7)
- Why: reduces decision friction for branding days.
- Data: NotebookLM synthesis + 60-day rolling context.
- KPI: % sessions starting from card recommendation.

3. Funnel Snapshot (Impact 7 / Effort 5)
- Why: fast conversion signal without deep drilldowns.
- Data: campaign performance snapshots.
- KPI: week-over-week conversion movement.

4. Channel Mix (Impact 6 / Effort 4)
- Why: ensures platform cadence by company.
- Data: weekly content by platform/company.
- KPI: planned-vs-posted coverage.

5. Moments Snapshot (Impact 6 / Effort 6)
- Why: captures qualitative brand shifts.
- Data: qualitative notes + weekly insights.
- KPI: actionability score from weekly review.

## 2) 6-Week Build Sequence
- Week 1: finalize data model + Notion field contracts.
- Week 2: backend orchestration + NotebookLM synthesis pipeline.
- Week 3: low-clutter branding mode shell + first widgets.
- Week 4: complete all 5 MVP widgets + AI insight card.
- Week 5: per-company drilldowns + 60-day prediction panel.
- Week 6: risk hardening, QA, acceptance tests, go-live.

## 3) Risk Register (priority)
- Security: secrets handling + endpoint protection + audit logs.
- Data quality: truthful run states and no fake dispatch/completions.
- Hallucination risk: grounded NotebookLM summaries + bounded prediction context.
- Dashboard overload: strict due-today visibility and minimal UI.

## 4) Subtask Mapping (execution)
- AFH-RESEARCH-019: data model + storage + widget contracts.
- AFH-RESEARCH-020: UI implementation for 5 MVP widgets.
- AFH-RESEARCH-021: prompt pack + weekly insight/prediction pipeline + risk controls.

## 5) Recommended immediate decisions
- Approve the 5-feature MVP set as final scope.
- Keep AI insight card in MVP despite higher effort (highest value).
- Defer advanced moments matrix drilldowns until after week 4.
- Gate prediction output behind confidence + assumptions block.
