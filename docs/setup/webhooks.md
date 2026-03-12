# Agent Webhooks & Router Setup

CozyHub is built on an agent framework that allows delegating tasks directly from the main "Inbox" to external agent executors. There are three built-in router endpoints that AI Focus Hub supports delegating to:

1. **Codex (`CODEX_ROUTER`)**: Your engineering/developer agent.
2. **Antigravity (`ANTIGRAVITY_ROUTER`)**: Your ops/workflow agent.
3. **Prime Team (`PRIME_TEAM_ROUTER`)**: Fallback generalized sub-agents directed by Prime.

You can configure these routes to fire physical webhooks to your own local listeners (e.g., using ngrok on your machine) or to remote servers where your agents live.

## 1. Enabling the Routers

To enable a router, update your `.env.local`:
```env
CODEX_ROUTER_ENABLED=true
CODEX_ROUTER_WEBHOOK_URL=https://your-ngrok-url.app/webhook/codex
CODEX_ROUTER_WEBHOOK_SECRET=your_super_secret_string
```
Repeat for `ANTIGRAVITY_` and `PRIME_TEAM_` respectively.

## 2. The Webhook Payload

When the Hub routes a task, it fires an HTTP `POST` request to your `_WEBHOOK_URL` containing an `x-afh-webhook-secret` header (if configured). 

The JSON payload structure your receiving server will get looks like this:

```json
{
  "connector": "codex",
  "runId": "4a1d48c9-02c3-4c91-...",
  "notionTaskId": "ab3c82...",
  "notionTaskUrl": "https://notion.so/...",
  "notionTaskTitle": "[Inbox] Write the new onboarding endpoint",
  "brief": "Write the new onboarding endpoint to support user signups",
  "ticketRules": {
    "mustSetInProgressBeforeWork": true,
    "mustWriteCompletionDetailsBeforeDone": true,
    "mustIncludeHoursCmmdHub": true,
    "completionCallbackPath": "/api/notes-inbox/runs/complete"
  }
}
```

*Note: For the Prime integration, the payload might also include a `delegation` object containing instructions from the Prime Agent orchestrator.*

## 3. Responding to the Webhook

Your receiving server MUST immediately respond with a `2xx` HTTP status code (e.g., `200 OK` or `202 Accepted`). Failure to do so within 12 seconds will cause the Hub to mark the run as `failed` and retry it.

## 4. Local Simulator

If you do NOT have a live external agent but want to simulate tasks automatically routing and "completing", you can route requests back to the CozyHub backend itself.

1. Set `LOCAL_CONNECTOR_AUTO_COMPLETE=true`
2. Set `CODEX_ROUTER_WEBHOOK_URL=http://localhost:3000/api/agents/connectors/codex`
3. Set the `CODEX_ROUTER_WEBHOOK_SECRET` variable matching what the local route expects.

When enabled, any task classified as "engineering/dev" will automatically be sent to the local endpoint, which will mark it as complete in Notion on behalf of the simulated agent!
