# Weekly Operator Runbook (AFH Brand DNA)

## Purpose

Run the weekly Brand DNA workflow end-to-end: scan company context, generate platform plan, sync to Notion, and review attention queue.

## Step 1: Scan Brand DNA

Use `Agents` tab:

1. Select company.
2. Add one or more website URLs (comma-separated).
3. Click `Scan Brand DNA`.

Expected result:

- Profile summary updates (voice, pillars, tone).
- New assets are captured into local brand operator store.

## Step 2: Generate Weekly Plan

Click `Generate Week Plan`.

Expected result:

- Weekly content requirements are generated per company based on platform minimum rules.
- Dashboard + Inbox coverage gaps update.

## Step 3: Sync Week To Notion

Click `Sync Week to Notion`.

Expected result:

- Content tasks are created in `Command_Tasks`.
- If `NOTION_DATABASE_CONTENT_ID` is configured, content rows are also created there.
- Legal/admin items missing due dates trigger critical follow-up task creation.

## Step 4: Review Attention Queue

Open `Inbox` tab and review:

- Due today
- Overdue
- Missing weekly commitments
- Legal/admin risk events

## API equivalents

- `POST /api/brand-dna/scan`
- `GET /api/brand-dna/:companyId`
- `POST /api/content-plan/generate-week`
- `POST /api/notion/sync-week`
- `GET /api/attention-queue`

## Troubleshooting

- Brand scan fails: verify website URL is public and reachable.
- Notion sync skipped: ensure `NOTION_TOKEN`, `NOTION_DATABASE_TASKS_ID`, and optional `NOTION_DATABASE_CONTENT_ID` are configured.
- Empty attention queue: run weekly generation first.
- Repeated alerts: check whether tasks are moving through status flow (`Idea -> Drafting -> Ready -> Scheduled -> Posted`).
