import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type FunnelStageScores = {
  awareness: number;
  consideration: number;
  conversion: number;
  loyalty: number;
};

export type MomentsSnapshot = {
  strength: number;
  momentum: number;
  notes: string;
};

export type ChannelMix = Record<string, number>;

export type BrandingMetricSnapshot = {
  id: string;
  companyId: string;
  companyName: string;
  weekKey: string;
  capturedAt: string;
  funnel: FunnelStageScores;
  moments: MomentsSnapshot;
  channelMix: ChannelMix;
  sourceRefs: string[];
};

export type BrandingAiInsight = {
  id: string;
  companyId: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  summary: string;
  drivers: string[];
  recommendedActions: string[];
  confidence: number;
  assumptions: string[];
};

export type BrandingPrediction = {
  id: string;
  companyId: string;
  generatedAt: string;
  windowDays: 60;
  horizonDays: 7;
  direction: "up" | "down" | "flat";
  confidence: number;
  rationale: string;
};

type BrandingDayStore = {
  snapshots: BrandingMetricSnapshot[];
  insights: BrandingAiInsight[];
  predictions: BrandingPrediction[];
  updatedAt: string;
};

const DATA_DIR = join(process.cwd(), "data");
const STORE_FILE = join(DATA_DIR, "branding-day-store.json");

const EMPTY_STORE: BrandingDayStore = {
  snapshots: [],
  insights: [],
  predictions: [],
  updatedAt: new Date(0).toISOString(),
};

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function withDefaults(store: Partial<BrandingDayStore>): BrandingDayStore {
  return {
    snapshots: Array.isArray(store.snapshots) ? store.snapshots : [],
    insights: Array.isArray(store.insights) ? store.insights : [],
    predictions: Array.isArray(store.predictions) ? store.predictions : [],
    updatedAt: typeof store.updatedAt === "string" ? store.updatedAt : new Date().toISOString(),
  };
}

async function loadStore(): Promise<BrandingDayStore> {
  try {
    const raw = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<BrandingDayStore>;
    return withDefaults(parsed);
  } catch {
    return { ...EMPTY_STORE };
  }
}

async function saveStore(store: BrandingDayStore): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(
    STORE_FILE,
    JSON.stringify(
      {
        ...store,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
}

export function currentWeekKey(date = new Date()): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export async function upsertBrandingSnapshot(
  input: Omit<BrandingMetricSnapshot, "id" | "capturedAt">,
): Promise<BrandingMetricSnapshot> {
  const store = await loadStore();
  const snapshot: BrandingMetricSnapshot = {
    id: `${input.companyId}-${input.weekKey}`,
    capturedAt: new Date().toISOString(),
    companyId: input.companyId,
    companyName: input.companyName,
    weekKey: input.weekKey,
    funnel: {
      awareness: clampScore(input.funnel.awareness),
      consideration: clampScore(input.funnel.consideration),
      conversion: clampScore(input.funnel.conversion),
      loyalty: clampScore(input.funnel.loyalty),
    },
    moments: {
      strength: clampScore(input.moments.strength),
      momentum: clampScore(input.moments.momentum),
      notes: input.moments.notes.slice(0, 1500),
    },
    channelMix: Object.fromEntries(
      Object.entries(input.channelMix).map(([key, value]) => [key, clampScore(value)]),
    ),
    sourceRefs: input.sourceRefs.slice(0, 20),
  };

  const idx = store.snapshots.findIndex((item) => item.id === snapshot.id);
  if (idx >= 0) {
    store.snapshots[idx] = snapshot;
  } else {
    store.snapshots.unshift(snapshot);
  }

  await saveStore(store);
  return snapshot;
}

export async function addBrandingInsight(
  input: Omit<BrandingAiInsight, "id" | "generatedAt">,
): Promise<BrandingAiInsight> {
  const store = await loadStore();
  const insight: BrandingAiInsight = {
    id: `${input.companyId}-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    companyId: input.companyId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    summary: input.summary.slice(0, 3000),
    drivers: input.drivers.slice(0, 10),
    recommendedActions: input.recommendedActions.slice(0, 10),
    confidence: clampConfidence(input.confidence),
    assumptions: input.assumptions.slice(0, 10),
  };

  store.insights.unshift(insight);
  await saveStore(store);
  return insight;
}

export async function addBrandingPrediction(
  input: Omit<BrandingPrediction, "id" | "generatedAt" | "windowDays" | "horizonDays">,
): Promise<BrandingPrediction> {
  const store = await loadStore();
  const prediction: BrandingPrediction = {
    id: `${input.companyId}-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    companyId: input.companyId,
    windowDays: 60,
    horizonDays: 7,
    direction: input.direction,
    confidence: clampConfidence(input.confidence),
    rationale: input.rationale.slice(0, 2000),
  };

  store.predictions.unshift(prediction);
  await saveStore(store);
  return prediction;
}

export async function getBrandingSummary(companyId: string): Promise<{
  latestSnapshot: BrandingMetricSnapshot | null;
  latestInsight: BrandingAiInsight | null;
  latestPrediction: BrandingPrediction | null;
}> {
  const store = await loadStore();
  return {
    latestSnapshot: store.snapshots.find((item) => item.companyId === companyId) ?? null,
    latestInsight: store.insights.find((item) => item.companyId === companyId) ?? null,
    latestPrediction: store.predictions.find((item) => item.companyId === companyId) ?? null,
  };
}
