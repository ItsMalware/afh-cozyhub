import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

type SpecialistType =
  | "engineering"
  | "notion_ops"
  | "content_ops"
  | "workflow_automation"
  | "research";

type SpecialistRecord = {
  type: SpecialistType;
  name: string;
  createdAt: string;
  triggers: string[];
  handledCount: number;
};

type DelegationEvent = {
  taskType: SpecialistType;
  count: number;
  lastSeenAt: string;
};

type DelegationStore = {
  specialists: SpecialistRecord[];
  repeats: Partial<Record<SpecialistType, DelegationEvent>>;
};

export type DelegationPlan = {
  primeAgent: "Prime";
  taskType: SpecialistType;
  specialist: {
    exists: boolean;
    name: string;
    createdNow: boolean;
  };
  execution: {
    mode: "specialist_team" | "specialist_single" | "sub_agent";
    team: string[];
    note: string;
  };
};

const DATA_DIR = join(process.cwd(), "data");
const STORE_FILE = join(DATA_DIR, "specialist-registry.json");
const REPEAT_THRESHOLD = 3;

const DEFAULT_SPECIALISTS: SpecialistRecord[] = [
  {
    type: "engineering",
    name: "Engineering Specialist",
    createdAt: new Date(0).toISOString(),
    triggers: ["bug", "fix", "frontend", "backend", "api", "typescript", "deploy"],
    handledCount: 0,
  },
];

const KEYWORDS: Record<SpecialistType, string[]> = {
  engineering: ["bug", "fix", "frontend", "backend", "api", "typescript", "deploy", "build"],
  notion_ops: ["notion", "database", "schema", "property", "field", "sync"],
  content_ops: ["content", "post", "newsletter", "social", "copy", "campaign"],
  workflow_automation: ["automation", "workflow", "pipeline", "agent", "integration", "trigger"],
  research: ["research", "analyze", "analysis", "compare", "brief", "investigate"],
};

const TEAM_BY_TYPE: Record<SpecialistType, string[]> = {
  engineering: ["Codex Dev Worker", "QA Service", "Reliability Support"],
  notion_ops: ["Schema Worker", "Sync Worker", "QA Service"],
  content_ops: ["Content Worker", "Editorial Service", "Performance Support"],
  workflow_automation: ["Antigravity Workflow Worker", "Integration Worker", "Recovery Service"],
  research: ["Research Worker", "Citation Service", "Synthesis Support"],
};

function isAntigravityDevTask(task: string): boolean {
  const text = task.toLowerCase();
  const hasAntigravity = /antigravity|workflow|automation|pipeline|integration/.test(text);
  const hasDev = /dev|code|build|fix|typescript|backend|frontend|api/.test(text);
  return hasAntigravity && hasDev;
}

function classifyTaskType(task: string): SpecialistType {
  const text = task.toLowerCase();
  const ranked = Object.entries(KEYWORDS)
    .map(([type, words]) => ({
      type: type as SpecialistType,
      score: words.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.score > 0 ? ranked[0].type : "workflow_automation";
}

function needsTeam(task: string): boolean {
  const text = task.toLowerCase();
  return (
    text.length > 120 ||
    / and | with | across | integrate | migration | rollout | end-to-end /.test(text)
  );
}

async function loadStore(): Promise<DelegationStore> {
  try {
    const raw = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<DelegationStore>;
    return {
      specialists:
        parsed.specialists && parsed.specialists.length > 0
          ? parsed.specialists
          : [...DEFAULT_SPECIALISTS],
      repeats: parsed.repeats ?? {},
    };
  } catch {
    return {
      specialists: [...DEFAULT_SPECIALISTS],
      repeats: {},
    };
  }
}

async function saveStore(store: DelegationStore): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
}

function nextSpecialistName(type: SpecialistType): string {
  if (type === "notion_ops") return "Notion Ops Specialist";
  if (type === "content_ops") return "Content Ops Specialist";
  if (type === "workflow_automation") return "Workflow Automation Specialist";
  if (type === "research") return "Research Specialist";
  return "Engineering Specialist";
}

export async function createDelegationPlan(task: string): Promise<DelegationPlan> {
  const store = await loadStore();
  const taskType = classifyTaskType(task);
  const existing = store.specialists.find((specialist) => specialist.type === taskType);
  const event = store.repeats[taskType] ?? {
    taskType,
    count: 0,
    lastSeenAt: new Date().toISOString(),
  };

  event.count += 1;
  event.lastSeenAt = new Date().toISOString();
  store.repeats[taskType] = event;

  let specialist = existing;
  let createdNow = false;

  if (!specialist && event.count >= REPEAT_THRESHOLD) {
    specialist = {
      type: taskType,
      name: nextSpecialistName(taskType),
      createdAt: new Date().toISOString(),
      triggers: KEYWORDS[taskType],
      handledCount: 0,
    };
    createdNow = true;
    store.specialists.push(specialist);
  }

  if (specialist) {
    specialist.handledCount += 1;
  }

  await saveStore(store);

  const teamRequired = needsTeam(task) || isAntigravityDevTask(task);
  const team = teamRequired
    ? isAntigravityDevTask(task)
      ? ["Dev Team Lead", "Codex Dev Worker", "Antigravity Workflow Worker", "QA Service"]
      : TEAM_BY_TYPE[taskType]
    : specialist
      ? [specialist.name]
      : ["General Sub-Agent"];

  const mode: DelegationPlan["execution"]["mode"] = teamRequired
    ? "specialist_team"
    : specialist
      ? "specialist_single"
      : "sub_agent";

  const note = specialist
    ? createdNow
      ? `Prime created a new specialist (${specialist.name}) after repeated ${taskType} tasks and delegated this task.`
      : `Prime delegated to existing specialist (${specialist.name}).`
    : `No specialist exists for ${taskType}; Prime created a sub-agent and logged this run.`;

  return {
    primeAgent: "Prime",
    taskType,
    specialist: {
      exists: Boolean(specialist),
      name: specialist?.name ?? "General Sub-Agent",
      createdNow,
    },
    execution: {
      mode,
      team,
      note,
    },
  };
}
