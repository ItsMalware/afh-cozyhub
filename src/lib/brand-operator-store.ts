import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type BrandProfile = {
  companyId: string;
  companyName: string;
  websites: string[];
  brandVoice: string;
  tone: string[];
  pillars: string[];
  audience: string;
  valueProps: string[];
  visualDirection: string[];
  summary: string;
  scannedAt: string;
};

export type BrandAsset = {
  id: string;
  companyId: string;
  sourceUrl: string;
  assetUrl: string;
  alt: string;
  capturedAt: string;
};

export type WeeklyContentRequirement = {
  id: string;
  weekKey: string;
  companyId: string;
  companyName: string;
  platform: string;
  status: "Idea" | "Drafting" | "Ready" | "Scheduled" | "Posted";
  headline: string;
  angle: string;
  dueDate: string;
  notionTaskPageId?: string;
  notionContentPageId?: string;
  syncedAt?: string;
};

export type AttentionEvent = {
  id: string;
  type:
    | "due_today"
    | "overdue"
    | "missing_weekly_commitments"
    | "legal_admin_risk";
  severity: "low" | "medium" | "high" | "critical";
  companyId?: string;
  companyName?: string;
  title: string;
  detail: string;
  action: string;
  createdAt: string;
};

export type BrandOperatorState = {
  brandProfiles: Record<string, BrandProfile>;
  brandAssets: BrandAsset[];
  weeklyContentRequirements: WeeklyContentRequirement[];
  attentionEvents: AttentionEvent[];
};

const DATA_DIR = join(process.cwd(), "data");
const STORE_FILE = join(DATA_DIR, "brand-operator.json");

const DEFAULT_STATE: BrandOperatorState = {
  brandProfiles: {},
  brandAssets: [],
  weeklyContentRequirements: [],
  attentionEvents: [],
};

export async function loadBrandOperatorState(): Promise<BrandOperatorState> {
  try {
    const raw = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<BrandOperatorState>;
    return {
      brandProfiles: parsed.brandProfiles ?? {},
      brandAssets: parsed.brandAssets ?? [],
      weeklyContentRequirements: parsed.weeklyContentRequirements ?? [],
      attentionEvents: parsed.attentionEvents ?? [],
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export async function saveBrandOperatorState(state: BrandOperatorState): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STORE_FILE, JSON.stringify(state, null, 2), "utf8");
}
