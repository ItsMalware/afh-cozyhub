import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { askNotebookLM } from "@/lib/notebooklm-mcp";
import {
  addBrandingInsight,
  addBrandingPrediction,
  BrandingAiInsight,
  BrandingPrediction,
  BrandingMetricSnapshot,
  currentWeekKey,
  getBrandingSummary,
  upsertBrandingSnapshot,
} from "@/lib/branding-day-store";
import { DashboardPayload, FocusTask } from "@/lib/types";

type CompanySummaryInput = {
  companyId: string;
  companyName: string;
  queue: FocusTask[];
};

type CompanySummaryResult = {
  companyId: string;
  companyName: string;
  source: string;
  insight: BrandingAiInsight;
  prediction: BrandingPrediction;
  snapshotUpdated: boolean;
};

type WeeklyRunEvent = {
  companyId: string;
  companyName: string;
  status: "ran" | "skipped";
  detail: string;
  source?: string;
};

type WeeklyRunResult = {
  triggered: boolean;
  reason: string;
  weekKey: string;
  events: WeeklyRunEvent[];
};

type PromptPackOutput = {
  summary?: unknown;
  drivers?: unknown;
  recommendedActions?: unknown;
  assumptions?: unknown;
  confidence?: unknown;
  prediction?: {
    direction?: unknown;
    confidence?: unknown;
    rationale?: unknown;
  };
  snapshot?: {
    funnel?: {
      awareness?: unknown;
      consideration?: unknown;
      conversion?: unknown;
      loyalty?: unknown;
    };
    moments?: {
      strength?: unknown;
      momentum?: unknown;
      notes?: unknown;
    };
    channelMix?: Record<string, unknown>;
    sourceRefs?: unknown;
  };
};

const DEFAULT_ACTIONS = [
  "Publish one primary platform post aligned to this company day.",
  "Advance one revenue-impacting task before low-priority cleanup work.",
  "Log blockers and next day handoff notes in Notion before session close.",
];

const DATA_DIR = join(process.cwd(), "data");
const WEEKLY_STATE_FILE = join(DATA_DIR, "branding-weekly-summary-state.json");

type WeeklyRunState = {
  weekByCompany: Record<string, string>;
  updatedAt: string;
};

const DEFAULT_WEEKLY_STATE: WeeklyRunState = {
  weekByCompany: {},
  updatedAt: new Date(0).toISOString(),
};

function toStringArray(value: unknown, max = 6): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, max);
}

function parseNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function normalizeDirection(value: unknown): "up" | "down" | "flat" {
  if (typeof value !== "string") {
    return "flat";
  }
  const normalized = value.toLowerCase().trim();
  if (normalized === "up" || normalized === "down" || normalized === "flat") {
    return normalized;
  }
  return "flat";
}

function parseNotebookMap(): Record<string, string> {
  const raw = process.env.NOTEBOOKLM_NOTEBOOK_MAP_JSON;
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.trim().length > 0) {
        result[key] = value.trim();
      }
    }
    return result;
  } catch {
    return {};
  }
}

function resolveNotebookUrl(companyId: string, companyName: string): string | undefined {
  const map = parseNotebookMap();
  return (
    map[companyId] ??
    map[companyName] ??
    map[companyName.toLowerCase()] ??
    process.env.NOTEBOOKLM_DEFAULT_NOTEBOOK_URL ??
    undefined
  );
}

function extractJson(text: string): PromptPackOutput | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const codeFence = trimmed.match(/```json\s*([\s\S]*?)```/i);
  const candidate = codeFence?.[1]?.trim() ?? trimmed;

  try {
    return JSON.parse(candidate) as PromptPackOutput;
  } catch {
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as PromptPackOutput;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function buildPrompt(input: {
  companyName: string;
  weekKey: string;
  periodStart: string;
  periodEnd: string;
  queue: FocusTask[];
  priorSnapshot: BrandingMetricSnapshot | null;
}) {
  const taskLines = input.queue
    .slice(0, 8)
    .map((task) => {
      const due = task.dueDate ? ` due=${task.dueDate.slice(0, 10)}` : "";
      return `- ${task.title} [${task.category}] status=${task.status}${due}`;
    })
    .join("\n");

  const priorSnapshotLine = input.priorSnapshot
    ? `Prior snapshot: funnel A/C/CV/L = ${input.priorSnapshot.funnel.awareness}/${input.priorSnapshot.funnel.consideration}/${input.priorSnapshot.funnel.conversion}/${input.priorSnapshot.funnel.loyalty}; moments strength=${input.priorSnapshot.moments.strength}, momentum=${input.priorSnapshot.moments.momentum}.`
    : "Prior snapshot: unavailable.";

  return [
    "You are generating a weekly branding summary for AFH.",
    "Return JSON only with this shape:",
    '{ "summary": string, "drivers": string[], "recommendedActions": string[], "assumptions": string[], "confidence": number, "prediction": { "direction": "up|down|flat", "confidence": number, "rationale": string }, "snapshot": { "funnel": { "awareness": number, "consideration": number, "conversion": number, "loyalty": number }, "moments": { "strength": number, "momentum": number, "notes": string }, "channelMix": { "Instagram": number, "TikTok": number, "YouTube": number, "LinkedIn": number, "Facebook": number, "Pinterest": number }, "sourceRefs": string[] } }',
    "Rules: confidence values are 0..1. Percentages are 0..100. recommendedActions max 5. drivers max 5.",
    `Company: ${input.companyName}`,
    `Week key: ${input.weekKey}`,
    `Period: ${input.periodStart} to ${input.periodEnd}`,
    priorSnapshotLine,
    "Current queue:",
    taskLines || "- No queued tasks available.",
    "Focus on clear actions that improve revenue and execution quality for next 7 days.",
  ].join("\n");
}

function fallbackOutput(input: {
  companyName: string;
  queue: FocusTask[];
  priorSnapshot: BrandingMetricSnapshot | null;
}): PromptPackOutput {
  return {
    summary: `${input.companyName} weekly branding summary generated from AFH fallback context.`,
    drivers: [
      "No NotebookLM response available; using queue and latest local snapshot.",
      input.queue.length > 0 ? "Active queued work detected for this company day." : "No active queue was detected.",
    ],
    recommendedActions: DEFAULT_ACTIONS,
    assumptions: ["NotebookLM source response unavailable during this run."],
    confidence: 0.45,
    prediction: {
      direction: "flat",
      confidence: 0.4,
      rationale:
        "Direction held flat because a notebook-sourced signal was unavailable for this run.",
    },
    snapshot: input.priorSnapshot
      ? {
          funnel: input.priorSnapshot.funnel,
          moments: input.priorSnapshot.moments,
          channelMix: input.priorSnapshot.channelMix,
          sourceRefs: input.priorSnapshot.sourceRefs,
        }
      : undefined,
  };
}

function toPeriodRange(): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - 7);
  const start = startDate.toISOString().slice(0, 10);
  return { start, end };
}

function getLocalWeekdayHourMinute(timeZone: string): {
  weekday: string;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return { weekday: weekday.toLowerCase(), hour, minute };
}

function parseIntWithFallback(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function loadWeeklyRunState(): Promise<WeeklyRunState> {
  try {
    const raw = await readFile(WEEKLY_STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<WeeklyRunState>;
    return {
      weekByCompany:
        parsed.weekByCompany && typeof parsed.weekByCompany === "object"
          ? (parsed.weekByCompany as Record<string, string>)
          : {},
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return { ...DEFAULT_WEEKLY_STATE };
  }
}

async function saveWeeklyRunState(state: WeeklyRunState): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(
    WEEKLY_STATE_FILE,
    JSON.stringify(
      {
        ...state,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
}

function shouldRunInWindow(timeZone: string): boolean {
  const cutoffHour = parseIntWithFallback(process.env.BRANDING_WEEKLY_RUN_HOUR, 21);
  const cutoffMinute = parseIntWithFallback(process.env.BRANDING_WEEKLY_RUN_MINUTE, 0);
  const nowLocal = getLocalWeekdayHourMinute(timeZone);
  const isMonday = nowLocal.weekday === "monday";
  if (!isMonday) {
    return false;
  }
  return nowLocal.hour > cutoffHour || (nowLocal.hour === cutoffHour && nowLocal.minute >= cutoffMinute);
}

async function getPromptOutput(input: {
  companyId: string;
  companyName: string;
  queue: FocusTask[];
  priorSnapshot: BrandingMetricSnapshot | null;
  weekKey: string;
  periodStart: string;
  periodEnd: string;
}): Promise<{ output: PromptPackOutput; source: string }> {
  const notebookUrl = resolveNotebookUrl(input.companyId, input.companyName);
  if (!notebookUrl || process.env.NOTEBOOKLM_USE_MCP !== "true") {
    return {
      output: fallbackOutput(input),
      source: "notebooklm-fallback",
    };
  }

  try {
    const raw = await askNotebookLM({
      notebookUrl,
      question: buildPrompt(input),
    });
    const parsed = extractJson(raw);
    if (!parsed) {
      return {
        output: fallbackOutput(input),
        source: "notebooklm-fallback",
      };
    }
    return { output: parsed, source: "notebooklm-mcp-cli" };
  } catch {
    return {
      output: fallbackOutput(input),
      source: "notebooklm-fallback",
    };
  }
}

export async function runBrandingWeeklySummaryForCompany(
  input: CompanySummaryInput,
): Promise<CompanySummaryResult> {
  const current = await getBrandingSummary(input.companyId);
  const period = toPeriodRange();
  const weekKey = currentWeekKey();

  const { output, source } = await getPromptOutput({
    companyId: input.companyId,
    companyName: input.companyName,
    queue: input.queue,
    priorSnapshot: current.latestSnapshot,
    weekKey,
    periodStart: period.start,
    periodEnd: period.end,
  });

  let snapshotUpdated = false;
  if (output.snapshot?.funnel && output.snapshot?.moments && output.snapshot?.channelMix) {
    await upsertBrandingSnapshot({
      companyId: input.companyId,
      companyName: input.companyName,
      weekKey,
      funnel: {
        awareness: parseNumber(output.snapshot.funnel.awareness, 0),
        consideration: parseNumber(output.snapshot.funnel.consideration, 0),
        conversion: parseNumber(output.snapshot.funnel.conversion, 0),
        loyalty: parseNumber(output.snapshot.funnel.loyalty, 0),
      },
      moments: {
        strength: parseNumber(output.snapshot.moments.strength, 0),
        momentum: parseNumber(output.snapshot.moments.momentum, 0),
        notes:
          typeof output.snapshot.moments.notes === "string"
            ? output.snapshot.moments.notes
            : "No moments notes returned.",
      },
      channelMix: Object.fromEntries(
        Object.entries(output.snapshot.channelMix).map(([key, value]) => [
          key,
          parseNumber(value, 0),
        ]),
      ),
      sourceRefs: toStringArray(output.snapshot.sourceRefs, 12),
    });
    snapshotUpdated = true;
  }

  const insight = await addBrandingInsight({
    companyId: input.companyId,
    periodStart: period.start,
    periodEnd: period.end,
    summary:
      typeof output.summary === "string" && output.summary.trim().length > 0
        ? output.summary
        : `${input.companyName}: weekly branding summary unavailable from source, fallback generated.`,
    drivers: toStringArray(output.drivers, 5),
    recommendedActions: (() => {
      const parsed = toStringArray(output.recommendedActions, 5);
      return parsed.length > 0 ? parsed : DEFAULT_ACTIONS;
    })(),
    assumptions: toStringArray(output.assumptions, 5),
    confidence: parseNumber(output.confidence, 0.5),
  });

  const prediction = await addBrandingPrediction({
    companyId: input.companyId,
    direction: normalizeDirection(output.prediction?.direction),
    confidence: parseNumber(output.prediction?.confidence, 0.45),
    rationale:
      typeof output.prediction?.rationale === "string" && output.prediction.rationale.trim()
        ? output.prediction.rationale
        : "Prediction rationale unavailable; generated from local fallback context.",
  });

  return {
    companyId: input.companyId,
    companyName: input.companyName,
    source,
    insight,
    prediction,
    snapshotUpdated,
  };
}

export async function runScheduledBrandingWeeklySummaries(
  dashboard: DashboardPayload,
  options?: { force?: boolean; runAll?: boolean; companyId?: string; timeZone?: string },
): Promise<WeeklyRunResult> {
  const timeZone = options?.timeZone ?? process.env.BRANDING_WEEKLY_TIMEZONE ?? "America/New_York";
  const forced = options?.force === true;
  const weekKey = currentWeekKey();

  if (!forced && !shouldRunInWindow(timeZone)) {
    return {
      triggered: false,
      reason: `Outside Monday night window (${timeZone})`,
      weekKey,
      events: [],
    };
  }

  const state = await loadWeeklyRunState();
  const targets = (() => {
    if (options?.runAll === true) {
      return dashboard.businesses;
    }
    if (options?.companyId) {
      return dashboard.businesses.filter((business) => business.id === options.companyId);
    }
    return dashboard.businesses.slice(0, 1);
  })();

  if (targets.length === 0) {
    return {
      triggered: false,
      reason: "No businesses available for weekly summary run",
      weekKey,
      events: [],
    };
  }

  const queueByCompany = new Map<string, FocusTask[]>();
  for (const task of dashboard.queue) {
    if (task.status === "DONE") {
      continue;
    }
    const existing = queueByCompany.get(task.businessId) ?? [];
    existing.push(task);
    queueByCompany.set(task.businessId, existing);
  }

  const events: WeeklyRunEvent[] = [];
  for (const business of targets) {
    const alreadyRanForWeek = state.weekByCompany[business.id] === weekKey;
    if (alreadyRanForWeek && !forced) {
      events.push({
        companyId: business.id,
        companyName: business.name,
        status: "skipped",
        detail: `Already ran for ${weekKey}`,
      });
      continue;
    }

    const queue = (queueByCompany.get(business.id) ?? []).slice(0, 10);
    const result = await runBrandingWeeklySummaryForCompany({
      companyId: business.id,
      companyName: business.name,
      queue,
    });
    state.weekByCompany[business.id] = weekKey;
    events.push({
      companyId: business.id,
      companyName: business.name,
      status: "ran",
      detail: `Generated insight ${result.insight.id} and prediction ${result.prediction.id}`,
      source: result.source,
    });
  }

  await saveWeeklyRunState(state);
  return {
    triggered: events.some((event) => event.status === "ran"),
    reason: forced ? "Forced run completed" : "Monday night window run completed",
    weekKey,
    events,
  };
}
