import { NextRequest, NextResponse } from "next/server";

import { completeRoutedRun } from "@/lib/agent-notes";

type ConnectorName = "codex" | "antigravity" | "prime";

function asConnector(value: string): ConnectorName | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "codex" || normalized === "antigravity" || normalized === "prime") {
    return normalized;
  }
  return null;
}

function expectedSecret(connector: ConnectorName): string {
  if (connector === "codex") {
    return process.env.CODEX_ROUTER_WEBHOOK_SECRET?.trim() ?? "";
  }
  if (connector === "antigravity") {
    return process.env.ANTIGRAVITY_ROUTER_WEBHOOK_SECRET?.trim() ?? "";
  }
  return process.env.PRIME_TEAM_ROUTER_WEBHOOK_SECRET?.trim() ?? "";
}

function estimateHours(brief: string): number {
  const words = brief.trim().split(/\s+/).filter(Boolean).length;
  if (words <= 10) return 0.5;
  if (words <= 30) return 1;
  if (words <= 60) return 2;
  return 3;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ connector: string }> },
) {
  const { connector: rawConnector } = await context.params;
  const connector = asConnector(rawConnector);
  if (!connector) {
    return NextResponse.json({ message: "Unknown connector" }, { status: 404 });
  }

  const configuredSecret = expectedSecret(connector);
  const providedSecret = request.headers.get("x-afh-webhook-secret")?.trim() ?? "";
  if (configuredSecret && providedSecret !== configuredSecret) {
    return NextResponse.json({ message: "Webhook secret mismatch" }, { status: 401 });
  }

  let payload: { runId?: unknown; brief?: unknown; notionTaskTitle?: unknown } = {};
  try {
    payload = (await request.json()) as { runId?: unknown; brief?: unknown; notionTaskTitle?: unknown };
  } catch {
    return NextResponse.json({ message: "Invalid JSON payload" }, { status: 400 });
  }

  const runId = typeof payload.runId === "string" ? payload.runId : "";
  const brief = typeof payload.brief === "string" ? payload.brief : "";
  const notionTaskTitle =
    typeof payload.notionTaskTitle === "string" ? payload.notionTaskTitle : "Untitled task";

  if (!runId) {
    return NextResponse.json({ message: "runId is required" }, { status: 400 });
  }

  const autoComplete = process.env.LOCAL_CONNECTOR_AUTO_COMPLETE === "true";
  if (!autoComplete) {
    return NextResponse.json(
      {
        accepted: true,
        connector,
        runId,
        mode: "queued",
        message:
          "Run accepted by local connector endpoint. Set LOCAL_CONNECTOR_AUTO_COMPLETE=true to auto-complete routed runs.",
      },
      { status: 202 },
    );
  }

  try {
    const hoursCmmdHub = estimateHours(brief);
    const completedRun = await completeRoutedRun({
      runId,
      hoursCmmdHub,
      workSummary: [
        `Local ${connector} connector executed task.`,
        `Task: ${notionTaskTitle}`,
        brief ? `Brief: ${brief}` : "",
        "Result: Accepted via internal webhook and marked complete.",
      ]
        .filter(Boolean)
        .join("\n"),
    });

    return NextResponse.json(
      {
        accepted: true,
        connector,
        runId,
        mode: "auto_completed",
        status: completedRun.status,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connector completion error";
    return NextResponse.json(
      {
        accepted: true,
        connector,
        runId,
        mode: "accepted_but_not_completed",
        error: message,
      },
      { status: 202 },
    );
  }
}
