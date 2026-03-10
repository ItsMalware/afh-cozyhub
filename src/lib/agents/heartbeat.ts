import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { writeReplayArtifact } from "@/lib/agents/replay";

type DeterministicAlert = {
  code: string;
  severity: "low" | "medium" | "high";
  detail: string;
};

const DATA_DIR = join(process.cwd(), "data");
const RUNS_FILE = join(DATA_DIR, "sub-agent-runs.json");
const HEARTBEAT_LOG = join(DATA_DIR, "agent-heartbeat-runs.jsonl");

async function loadRuns(): Promise<{
  runs: Array<{ createdAt: string }>;
  retryQueue: Array<{ runId: string; error?: string }>;
}> {
  try {
    const raw = await readFile(RUNS_FILE, "utf8");
    const parsed = JSON.parse(raw) as {
      runs?: Array<{ createdAt: string }>;
      retryQueue?: Array<{ runId: string; error?: string }>;
    };
    return {
      runs: parsed.runs ?? [],
      retryQueue: parsed.retryQueue ?? [],
    };
  } catch {
    return { runs: [], retryQueue: [] };
  }
}

function runDeterministicChecks(input: {
  runs: Array<{ createdAt: string }>;
  retryQueue: Array<{ runId: string; error?: string }>;
}): DeterministicAlert[] {
  const alerts: DeterministicAlert[] = [];

  if (input.retryQueue.length > 0) {
    alerts.push({
      code: "RETRY_QUEUE_BACKLOG",
      severity: input.retryQueue.length > 3 ? "high" : "medium",
      detail: `${input.retryQueue.length} routed runs are pending retry`,
    });
  }

  const latestRun = input.runs[0];
  if (latestRun) {
    const ageHours =
      (Date.now() - new Date(latestRun.createdAt).getTime()) / (1000 * 60 * 60);
    if (ageHours > 6) {
      alerts.push({
        code: "ROUTER_STALE",
        severity: "low",
        detail: `No new routed runs in ${Math.round(ageHours)}h`,
      });
    }
  }

  return alerts;
}

async function summarizeAlerts(alerts: DeterministicAlert[]): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const prompt = `Summarize these heartbeat alerts in <=80 words and propose next action:\n${JSON.stringify(
    alerts,
  )}`;

  if (geminiKey) {
    try {
      const model = process.env.GEMINI_CHAT_MODEL || "gemini-3.1-pro-preview";
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2 },
          }),
          signal: AbortSignal.timeout(20000),
        },
      );
      if (response.ok) {
        const payload = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text =
          payload.candidates?.[0]?.content?.parts
            ?.map((part) => part.text ?? "")
            .join("")
            .trim() ?? "";
        if (text) return text;
      }
    } catch {
      // Fall through to next provider.
    }
  }

  if (openaiKey) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
          temperature: 0.2,
          messages: [
            { role: "system", content: "Summarize operational alerts briefly." },
            { role: "user", content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (response.ok) {
        const payload = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const text = payload.choices?.[0]?.message?.content?.trim() ?? "";
        if (text) return text;
      }
    } catch {
      // Fall through to deterministic summary.
    }
  }

  return `Heartbeat detected ${alerts.length} alert(s): ${alerts
    .map((alert) => `${alert.code}(${alert.severity})`)
    .join(", ")}.`;
}

async function appendHeartbeatLog(entry: Record<string, unknown>): Promise<void> {
  const line = `${JSON.stringify(entry)}\n`;
  try {
    await import("node:fs/promises").then(({ mkdir, appendFile }) =>
      mkdir(DATA_DIR, { recursive: true }).then(() => appendFile(HEARTBEAT_LOG, line, "utf8")),
    );
  } catch {
    // Non-blocking for runtime flow.
  }
}

export async function runAgentHeartbeat(): Promise<{
  ranAt: string;
  deterministicAlerts: DeterministicAlert[];
  escalatedToLlm: boolean;
  summary: string;
  replayId: string;
}> {
  const ranAt = new Date().toISOString();
  const runs = await loadRuns();
  const deterministicAlerts = runDeterministicChecks(runs);
  const escalatedToLlm = deterministicAlerts.length > 0;
  const summary = escalatedToLlm
    ? await summarizeAlerts(deterministicAlerts)
    : "HEARTBEAT_OK";

  const replay = await writeReplayArtifact({
    kind: "heartbeat",
    input: {
      retryQueueLength: runs.retryQueue.length,
      runCount: runs.runs.length,
    },
    steps: [
      {
        at: ranAt,
        actor: "Heartbeat",
        action: "deterministic_checks",
        payload: {
          alertCount: deterministicAlerts.length,
        },
      },
      ...(escalatedToLlm
        ? [
            {
              at: new Date().toISOString(),
              actor: "Prime",
              action: "llm_escalation",
              detail: "Escalated due to deterministic alert",
            },
          ]
        : []),
    ],
    output: {
      summary,
      escalatedToLlm,
      alerts: deterministicAlerts,
    },
    metadata: {
      twoTierRouting: true,
    },
  });

  await appendHeartbeatLog({
    ranAt,
    deterministicAlerts,
    escalatedToLlm,
    summary,
    replayId: replay.replayId,
  });

  return {
    ranAt,
    deterministicAlerts,
    escalatedToLlm,
    summary,
    replayId: replay.replayId,
  };
}
