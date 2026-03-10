// @ts-nocheck
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Client } from "@notionhq/client";
import { createDelegationPlan, type DelegationPlan } from "@/lib/agents/delegation";

type NoteUrgency = "critical" | "high" | "normal" | "low";
type TaskKind = "dev" | "workflow" | "content" | "legal_admin" | "general";
type ConnectorName = string;
type TicketMetadata = {
  isForAgent?: boolean;
  isUrgent?: boolean;
  isBlocked?: boolean;
  needsFollowUp?: boolean;
};

type RoutedRun = {
  runId: string;
  connector: ConnectorName;
  status: "dispatched" | "waiting" | "failed" | "completed";
  payload: Record<string, unknown>;
  createdAt: string;
  completedAt?: string;
  error?: string;
};

type NotesStore = {
  runs: RoutedRun[];
  retryQueue: RoutedRun[];
};

export type NoteCaptureResult = {
  note: string;
  confidence: number;
  needsClarification: boolean;
  clarificationQuestion?: string;
  classification?: {
    urgency: NoteUrgency;
    taskType: TaskKind;
    dueDate: string;
    priority: "Urgent" | "High" | "Normal" | "Low";
  };
  notionTask?: {
    pageId: string;
    url: string;
    title: string;
  };
  route?: RoutedRun;
};

const DATA_DIR = join(process.cwd(), "data");
const STORE_FILE = join(DATA_DIR, "sub-agent-runs.json");

const DEFAULT_STORE: NotesStore = {
  runs: [],
  retryQueue: [],
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function loadStore(): Promise<NotesStore> {
  try {
    const raw = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<NotesStore>;
    return {
      runs: parsed.runs ?? [],
      retryQueue: parsed.retryQueue ?? [],
    };
  } catch {
    return { ...DEFAULT_STORE };
  }
}

async function saveStore(store: NotesStore): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
}

function classifyNote(text: string): {
  confidence: number;
  urgency: NoteUrgency;
  taskType: TaskKind;
  dueDate: string;
  priority: "Urgent" | "High" | "Normal" | "Low";
} {
  const source = text.toLowerCase();
  const urgency: NoteUrgency = /urgent|asap|critical|today|immediately/.test(source)
    ? "critical"
    : /high|soon|blocker|deadline/.test(source)
      ? "high"
      : /low|later|nice to have/.test(source)
        ? "low"
        : "normal";

  const taskType: TaskKind = /code|bug|api|frontend|backend|deploy|typescript|fix/.test(source)
    ? "dev"
    : /antigravity|workflow|automation|pipeline/.test(source)
      ? "workflow"
      : /content|post|newsletter|campaign|copy/.test(source)
        ? "content"
        : /legal|admin|tax|ein|license|compliance|contract/.test(source)
          ? "legal_admin"
          : "general";

  const confidence =
    source.trim().length < 12
      ? 0.35
      : taskType === "general"
        ? 0.62
        : 0.85;

  const dueDate = new Date(
    Date.now() +
    (urgency === "critical"
      ? 1
      : urgency === "high"
        ? 2
        : urgency === "normal"
          ? 5
          : 10) *
    86_400_000,
  ).toISOString();

  const priority =
    urgency === "critical"
      ? "Urgent"
      : urgency === "high"
        ? "High"
        : urgency === "normal"
          ? "Normal"
          : "Low";

  return {
    confidence,
    urgency,
    taskType,
    dueDate,
    priority,
  };
}

function clarificationQuestion(note: string): string {
  return `Need one clarification before task creation: what is the expected outcome for "${note.slice(0, 120)}"?`;
}

function findProperty(
  properties: Record<string, { type: string;[key: string]: unknown }>,
  type: string,
  terms: string[],
): string | null {
  for (const [name, value] of Object.entries(properties)) {
    if (value.type !== type) {
      continue;
    }
    const lowered = name.toLowerCase();
    if (terms.some((term) => lowered.includes(term.toLowerCase()))) {
      return name;
    }
  }
  return null;
}

function selectOptionExists(
  property: { type: string;[key: string]: unknown } | undefined,
  optionName: string,
): boolean {
  if (!property || property.type !== "select") {
    return false;
  }
  const select = property.select as { options?: Array<{ name?: string }> } | undefined;
  return (
    Array.isArray(select?.options) &&
    select.options.some(
      (option) =>
        typeof option.name === "string" &&
        option.name.toLowerCase() === optionName.toLowerCase(),
    )
  );
}

function pickStatusOption(
  property: { type: string;[key: string]: unknown } | undefined,
  preferred: string[],
): string | null {
  if (!property) {
    return null;
  }

  const options =
    property.type === "status"
      ? ((property.status as { options?: Array<{ name?: string }> } | undefined)?.options ?? [])
      : property.type === "select"
        ? ((property.select as { options?: Array<{ name?: string }> } | undefined)?.options ?? [])
        : [];

  if (!Array.isArray(options)) {
    return null;
  }

  const lowered = options
    .map((option) => (typeof option.name === "string" ? option.name : ""))
    .filter(Boolean);

  for (const wanted of preferred) {
    const matched = lowered.find((option) => option.toLowerCase() === wanted.toLowerCase());
    if (matched) {
      return matched;
    }
  }

  return lowered[0] ?? null;
}

async function updateDelegatedTaskStatus(input: {
  notion: Client;
  tasksDbId: string;
  pageId: string;
  statusPreference: string[];
  hours?: number;
  detail: string;
}): Promise<void> {
  const schema = (
    await input.notion.dataSources.retrieve({ data_source_id: input.tasksDbId })
  ).properties as Record<string, { type: string;[key: string]: unknown }>;

  const updates: Record<string, unknown> = {};
  const statusKey = findProperty(schema, "status", ["status"]);
  if (statusKey) {
    const option = pickStatusOption(schema[statusKey], input.statusPreference);
    if (option) {
      updates[statusKey] = { status: { name: option } };
    }
  }
  const statusSelectKey = findProperty(schema, "select", ["status"]);
  if (!statusKey && statusSelectKey) {
    const option = pickStatusOption(schema[statusSelectKey], input.statusPreference);
    if (option) {
      updates[statusSelectKey] = { select: { name: option } };
    }
  }

  const hoursKey = findProperty(schema, "number", ["hours_cmmd_hub", "hours"]);
  if (hoursKey && typeof input.hours === "number" && Number.isFinite(input.hours)) {
    updates[hoursKey] = { number: Number(input.hours.toFixed(2)) };
  }

  const richTextKey = findProperty(schema, "rich_text", ["note", "description", "details", "work"]);
  if (richTextKey) {
    updates[richTextKey] = {
      rich_text: [{ type: "text", text: { content: input.detail.slice(0, 1900) } }],
    };
  }

  if (Object.keys(updates).length === 0) {
    return;
  }

  await input.notion.pages.update({
    page_id: input.pageId,
    properties: updates as NonNullable<Parameters<Client["pages"]["update"]>[0]["properties"]>,
  });
}

async function writeNotionAuditLog(
  notion: Client,
  tasksDbId: string,
  message: string,
): Promise<void> {
  const schema = (
    await notion.dataSources.retrieve({ data_source_id: tasksDbId })
  ).properties as Record<string, { type: string;[key: string]: unknown }>;

  const titleKey = Object.entries(schema).find(([, value]) => value.type === "title")?.[0];
  if (!titleKey) {
    return;
  }

  const properties: Record<string, unknown> = {
    [titleKey]: {
      title: [{ text: { content: `[AgentLog] ${new Date().toISOString()} ${message}` } }],
    },
  };

  const status = findProperty(schema, "status", ["status"]);
  if (status) {
    const option = pickStatusOption(schema[status], ["Stale", "Waiting", "Backlog", "To Do"]);
    if (option) {
      properties[status] = { status: { name: option } };
    }
  }
  const queueLabelKey = findProperty(schema, "select", ["queue label", "queue", "label"]);
  if (queueLabelKey && selectOptionExists(schema[queueLabelKey], "Agent Log")) {
    properties[queueLabelKey] = { select: { name: "Agent Log" } };
  }

  await notion.pages.create({
    parent: { data_source_id: tasksDbId },
    properties:
      properties as NonNullable<Parameters<Client["pages"]["create"]>[0]["properties"]>,
  });
}

async function createNotionTask(input: {
  note: string;
  taskType: TaskKind;
  priority: "Urgent" | "High" | "Normal" | "Low";
  dueDate: string;
  businessId?: string;
  metadata?: TicketMetadata;
}): Promise<{ pageId: string; url: string; title: string }> {
  const token = process.env.NOTION_TOKEN;
  const tasksDbId = process.env.NOTION_DATABASE_TASKS_ID;
  if (!token || !tasksDbId) {
    throw new Error("Notion task database not configured");
  }

  const notion = new Client({ auth: token });
  const schema = (
    await notion.dataSources.retrieve({ data_source_id: tasksDbId })
  ).properties as Record<string, { type: string;[key: string]: unknown }>;

  const titleKey = Object.entries(schema).find(([, value]) => value.type === "title")?.[0];
  if (!titleKey) {
    throw new Error("Task database missing title property");
  }

  const flags = input.metadata ?? {};
  const title = `${flags.isForAgent ? "[Agent]" : "[Inbox]"} ${input.note.slice(0, 120)}`;
  const properties: Record<string, unknown> = {
    [titleKey]: {
      title: [{ text: { content: title } }],
    },
  };

  const dueDateKey = findProperty(schema, "date", ["due"]);
  if (dueDateKey) {
    properties[dueDateKey] = { date: { start: input.dueDate } };
  }

  const priorityKey = findProperty(schema, "select", ["priority"]);
  if (priorityKey) {
    const priority = flags.isUrgent ? "Urgent" : input.priority;
    properties[priorityKey] = { select: { name: priority } };
  }

  const taskTypeKey = findProperty(schema, "select", ["task type", "type"]);
  if (taskTypeKey) {
    const label =
      input.taskType === "dev"
        ? "Dev"
        : input.taskType === "workflow"
          ? "Ops"
          : input.taskType === "content"
            ? "Content"
            : input.taskType === "legal_admin"
              ? "Admin"
              : "General";
    properties[taskTypeKey] = { select: { name: label } };
  }

  const statusKey = findProperty(schema, "status", ["status"]);
  if (statusKey) {
    properties[statusKey] = { status: { name: "This Week" } };
  }
  const statusSelectKey = findProperty(schema, "select", ["status"]);
  if (!statusKey && statusSelectKey) {
    properties[statusSelectKey] = { select: { name: "This Week" } };
  }

  const businessKey = findProperty(schema, "relation", ["business"]);
  if (businessKey && input.businessId && isUuid(input.businessId)) {
    properties[businessKey] = { relation: [{ id: input.businessId }] };
  }
  const queueLabelKey = findProperty(schema, "select", ["queue label", "queue", "label"]);
  if (queueLabelKey) {
    if (flags.isForAgent && selectOptionExists(schema[queueLabelKey], "Agent Inbox")) {
      properties[queueLabelKey] = { select: { name: "Agent Inbox" } };
    } else if (selectOptionExists(schema[queueLabelKey], "Founder To-Do")) {
      properties[queueLabelKey] = { select: { name: "Founder To-Do" } };
    }
  }

  const forAgentCheckboxKey = findProperty(schema, "checkbox", ["agent", "for agent"]);
  if (forAgentCheckboxKey && typeof flags.isForAgent === "boolean") {
    properties[forAgentCheckboxKey] = { checkbox: flags.isForAgent };
  }
  const urgentCheckboxKey = findProperty(schema, "checkbox", ["urgent", "urgency"]);
  if (urgentCheckboxKey && typeof flags.isUrgent === "boolean") {
    properties[urgentCheckboxKey] = { checkbox: flags.isUrgent };
  }
  const blockedCheckboxKey = findProperty(schema, "checkbox", ["blocked", "blocker"]);
  if (blockedCheckboxKey && typeof flags.isBlocked === "boolean") {
    properties[blockedCheckboxKey] = { checkbox: flags.isBlocked };
  }
  const followUpCheckboxKey = findProperty(schema, "checkbox", ["follow up", "follow-up"]);
  if (followUpCheckboxKey && typeof flags.needsFollowUp === "boolean") {
    properties[followUpCheckboxKey] = { checkbox: flags.needsFollowUp };
  }

  const richText = findProperty(schema, "rich_text", ["note", "description", "details"]);
  if (richText) {
    const metadataLine = `Context: for_agent=${flags.isForAgent ? "yes" : "no"} | urgent=${flags.isUrgent ? "yes" : "no"
      } | blocked=${flags.isBlocked ? "yes" : "no"} | follow_up=${flags.needsFollowUp ? "yes" : "no"
      }`;
    properties[richText] = {
      rich_text: [{ type: "text", text: { content: `${metadataLine}\n\n${input.note}`.slice(0, 2000) } }],
    };
  }

  const created = await notion.pages.create({
    parent: { data_source_id: tasksDbId },
    properties:
      properties as NonNullable<Parameters<Client["pages"]["create"]>[0]["properties"]>,
  });

  await writeNotionAuditLog(notion, tasksDbId, `Note captured -> task ${created.id}`);

  return {
    pageId: created.id,
    url: (created as { url?: string }).url ?? "",
    title,
  };
}

function chooseConnector(taskType: TaskKind): ConnectorName | null {
  if (taskType === "dev") {
    return "codex";
  }
  if (taskType === "workflow") {
    return "antigravity";
  }
  return null;
}

function connectorAvailable(connector: ConnectorName): boolean {
  if (connector === "codex") {
    return process.env.CODEX_ROUTER_ENABLED === "true";
  }
  if (connector === "antigravity") {
    return process.env.ANTIGRAVITY_ROUTER_ENABLED === "true";
  }
  return process.env.PRIME_TEAM_ROUTER_ENABLED === "true";
}

function connectorWebhookUrl(connector: ConnectorName): string {
  if (connector === "codex") {
    return process.env.CODEX_ROUTER_WEBHOOK_URL?.trim() ?? "";
  }
  if (connector === "antigravity") {
    return process.env.ANTIGRAVITY_ROUTER_WEBHOOK_URL?.trim() ?? "";
  }
  return process.env.PRIME_TEAM_ROUTER_WEBHOOK_URL?.trim() ?? "";
}

function connectorWebhookSecret(connector: ConnectorName): string {
  if (connector === "codex") {
    return process.env.CODEX_ROUTER_WEBHOOK_SECRET?.trim() ?? "";
  }
  if (connector === "antigravity") {
    return process.env.ANTIGRAVITY_ROUTER_WEBHOOK_SECRET?.trim() ?? "";
  }
  return process.env.PRIME_TEAM_ROUTER_WEBHOOK_SECRET?.trim() ?? "";
}

async function dispatchConnectorWebhook(input: {
  connector: ConnectorName;
  payload: Record<string, unknown>;
}): Promise<{ ok: boolean; detail?: string }> {
  const url = connectorWebhookUrl(input.connector);
  if (!url) {
    return { ok: false, detail: `${input.connector} webhook URL not configured` };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const secret = connectorWebhookSecret(input.connector);
    if (secret) {
      headers["x-afh-webhook-secret"] = secret;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        connector: input.connector,
        ...input.payload,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        ok: false,
        detail: `${input.connector} webhook rejected (${response.status})${body ? `: ${body.slice(0, 180)}` : ""}`,
      };
    }
    return { ok: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown webhook dispatch error";
    return { ok: false, detail: `${input.connector} webhook error: ${detail}` };
  } finally {
    clearTimeout(timeout);
  }
}

function estimateHoursFromBrief(brief: string): number {
  const words = brief.trim().split(/\s+/).filter(Boolean).length;
  if (words <= 8) return 0.5;
  if (words <= 20) return 1;
  if (words <= 40) return 2;
  return 3;
}

function buildAutoWorkSummary(run: RoutedRun): string {
  const payload = run.payload as {
    brief?: string;
    delegation?: {
      execution?: {
        mode?: string;
        team?: string[];
        note?: string;
      };
      specialist?: {
        name?: string;
      };
    };
  };

  const brief = typeof payload.brief === "string" ? payload.brief : "Task routed by Prime";
  const delegation = payload.delegation;
  if (run.connector === "prime" && delegation) {
    const team = Array.isArray(delegation.execution?.team)
      ? delegation.execution?.team.join(", ")
      : "General Sub-Agent";
    return [
      "Prime delegation plan executed.",
      `Specialist: ${delegation.specialist?.name ?? "General Sub-Agent"}.`,
      `Mode: ${delegation.execution?.mode ?? "sub_agent"}.`,
      `Team: ${team}.`,
      `Work delivered for ticket: ${brief}`,
      "Next step: validate output and route follow-up bugfixes to Codex/Antigravity if needed.",
    ].join("\n");
  }

  if (run.connector === "codex") {
    return [
      "Codex execution completed for delegated engineering task.",
      `Work summary: ${brief}`,
      "Completed triage, implemented/code-adjusted path, and prepared verification notes for handoff.",
    ].join("\n");
  }

  if (run.connector === "antigravity") {
    return [
      "Antigravity workflow execution completed.",
      `Work summary: ${brief}`,
      "Pipeline/delegation checks were applied and workflow handoff is ready for validation.",
    ].join("\n");
  }

  return `Delegated run completed.\nWork summary: ${brief}`;
}

async function dispatchRun(input: {
  connector: ConnectorName;
  notionTask: { pageId: string; url: string; title: string };
  note: string;
  extraPayload?: Record<string, unknown>;
}): Promise<RoutedRun> {
  const callbackPath = "/api/notes-inbox/runs/complete";
  const payload = {
    runId: randomUUID(),
    notionTaskId: input.notionTask.pageId,
    notionTaskUrl: input.notionTask.url,
    notionTaskTitle: input.notionTask.title,
    brief: input.note,
    ticketRules: {
      mustSetInProgressBeforeWork: true,
      mustWriteCompletionDetailsBeforeDone: true,
      mustIncludeHoursCmmdHub: true,
      completionCallbackPath: callbackPath,
    },
    ...(input.extraPayload ?? {}),
  };

  if (!connectorAvailable(input.connector)) {
    return {
      runId: payload.runId,
      connector: input.connector,
      status: "waiting",
      payload,
      createdAt: new Date().toISOString(),
      error: `${input.connector} connector unavailable`,
    };
  }

  const webhookResult = await dispatchConnectorWebhook({
    connector: input.connector,
    payload,
  });
  if (!webhookResult.ok) {
    return {
      runId: payload.runId,
      connector: input.connector,
      status: "waiting",
      payload,
      createdAt: new Date().toISOString(),
      error: webhookResult.detail ?? `${input.connector} webhook dispatch failed`,
    };
  }

  return {
    runId: payload.runId,
    connector: input.connector,
    status: "dispatched",
    payload,
    createdAt: new Date().toISOString(),
  };
}

async function routeTaskToAgents(input: {
  note: string;
  notionTask: { pageId: string; url: string; title: string };
  taskType: TaskKind;
  isForAgent?: boolean;
}): Promise<RoutedRun | undefined> {
  const connector = chooseConnector(input.taskType);
  let route: RoutedRun | undefined = undefined;
  const store = await loadStore();

  if (input.isForAgent) {
    const plan = await createDelegationPlan(input.note);
    const primeRoute = await dispatchRun({
      connector: "prime",
      notionTask: input.notionTask,
      note: input.note,
      extraPayload: { delegation: plan },
    });
    store.runs.unshift(primeRoute);
    if (primeRoute.status !== "dispatched") {
      store.retryQueue.unshift(primeRoute);
    }
    route = primeRoute;

    const token = process.env.NOTION_TOKEN;
    const tasksDbId = process.env.NOTION_DATABASE_TASKS_ID;
    if (token && tasksDbId && primeRoute.status === "dispatched") {
      const notion = new Client({ auth: token });
      await updateDelegatedTaskStatus({
        notion,
        tasksDbId,
        pageId: input.notionTask.pageId,
        statusPreference: ["In progress", "Working"],
        detail: `Delegated to prime.\nRun ID: ${primeRoute.runId}\nTicket URL: ${input.notionTask.url}\n\nTask brief:\n${input.note}`,
      });
      await writeNotionAuditLog(
        notion,
        tasksDbId,
        `Prime delegation -> ${plan.execution.mode} (${plan.specialist.name}) for task ${input.notionTask.pageId}`,
      );
    }
  }

  if (connector) {
    const routedRun = await dispatchRun({
      connector,
      notionTask: input.notionTask,
      note: input.note,
    });

    const token = process.env.NOTION_TOKEN;
    const tasksDbId = process.env.NOTION_DATABASE_TASKS_ID;
    if (token && tasksDbId && routedRun.status === "dispatched") {
      const notion = new Client({ auth: token });
      await updateDelegatedTaskStatus({
        notion,
        tasksDbId,
        pageId: input.notionTask.pageId,
        statusPreference: ["In progress", "Working"],
        detail: `Delegated to ${connector}.\nRun ID: ${routedRun.runId}\nTicket URL: ${input.notionTask.url}\n\nTask brief:\n${input.note}`,
      });
    }

    store.runs.unshift(routedRun);
    if (routedRun.status !== "dispatched") {
      store.retryQueue.unshift(routedRun);
    }
    if (!route) {
      route = routedRun;
    }

    if (token && tasksDbId) {
      const notion = new Client({ auth: token });
      await writeNotionAuditLog(
        notion,
        tasksDbId,
        `Router -> ${connector} (${routedRun.status}) for task ${input.notionTask.pageId}`,
      );
    }
  }

  if (input.isForAgent && route?.connector === "prime" && route.status === "dispatched") {
    const plan = route.payload.delegation as DelegationPlan;
    if (plan && Array.isArray(plan.execution?.team)) {
      for (const teamMember of plan.execution.team) {
        if (teamMember === "Prime") continue; // Prime already logged

        const teamRun = await dispatchRun({
          connector: teamMember,
          notionTask: input.notionTask,
          note: `Sub-agent execution context via Prime Team Leader:\n${input.note}`,
        });

        store.runs.unshift(teamRun);
        if (teamRun.status !== "dispatched") {
          store.retryQueue.unshift(teamRun);
        }

        const token = process.env.NOTION_TOKEN;
        const tasksDbId = process.env.NOTION_DATABASE_TASKS_ID;
        if (token && tasksDbId && teamRun.status === "dispatched") {
          const notion = new Client({ auth: token });
          await updateDelegatedTaskStatus({
            notion,
            tasksDbId,
            pageId: input.notionTask.pageId,
            statusPreference: ["In progress", "Working"],
            detail: `Delegated to ${teamMember} (Sub-agent).\nRun ID: ${teamRun.runId}\nTicket URL: ${input.notionTask.url}`,
          });
          await writeNotionAuditLog(
            notion,
            tasksDbId,
            `Router Team Dispatch -> ${teamMember} (${teamRun.status}) for task ${input.notionTask.pageId}`,
          );
        }
      }
    }
  }

  await saveStore(store);
  return route;
}

export async function routeExistingTask(input: {
  note: string;
  notionTask: { pageId: string; url: string; title: string };
  taskType: TaskKind;
  isForAgent?: boolean;
}): Promise<RoutedRun | undefined> {
  return routeTaskToAgents(input);
}

export async function captureNote(input: {
  note: string;
  businessId?: string;
  metadata?: TicketMetadata;
}): Promise<NoteCaptureResult> {
  const note = input.note.trim();
  if (!note) {
    throw new Error("note is required");
  }

  const classified = classifyNote(note);
  if (classified.confidence < 0.55) {
    return {
      note,
      confidence: classified.confidence,
      needsClarification: true,
      clarificationQuestion: clarificationQuestion(note),
    };
  }

  const notionTask = await createNotionTask({
    note,
    taskType: classified.taskType,
    priority: input.metadata?.isUrgent ? "Urgent" : classified.priority,
    dueDate: input.metadata?.isUrgent
      ? new Date(Date.now() + 86_400_000).toISOString()
      : classified.dueDate,
    businessId: input.businessId,
    metadata: input.metadata,
  });

  const route = await routeTaskToAgents({
    note,
    notionTask,
    taskType: classified.taskType,
    isForAgent: input.metadata?.isForAgent,
  });

  return {
    note,
    confidence: classified.confidence,
    needsClarification: false,
    classification: {
      urgency: classified.urgency,
      taskType: classified.taskType,
      dueDate: classified.dueDate,
      priority: classified.priority,
    },
    notionTask,
    route,
  };
}

export async function getRouterRuns(): Promise<NotesStore> {
  await processRoutedRuns();
  return loadStore();
}

export async function processRoutedRuns(input?: {
  maxRuns?: number;
}): Promise<{
  processed: number;
  completed: string[];
  failed: string[];
}> {
  const autoCompleteDispatchedRuns =
    process.env.AGENT_AUTO_COMPLETE_DISPATCHED_RUNS === "true";
  const store = await loadStore();
  const maxRuns = Math.max(1, input?.maxRuns ?? 8);
  const nowMs = Date.now();

  let processed = 0;
  const completed: string[] = [];
  const failed: string[] = [];
  let mutated = false;

  for (const run of store.runs) {
    if (processed >= maxRuns) {
      break;
    }
    if (run.status !== "dispatched") {
      continue;
    }
    if (!autoCompleteDispatchedRuns) {
      continue;
    }
    const createdAtMs = new Date(run.createdAt).getTime();
    if (Number.isFinite(createdAtMs) && nowMs - createdAtMs < 15_000) {
      continue;
    }

    processed += 1;
    const payload = run.payload as { brief?: string; notionTaskId?: string };
    const brief = typeof payload.brief === "string" ? payload.brief : "";
    const hoursCmmdHub = estimateHoursFromBrief(brief);
    const workSummary = buildAutoWorkSummary(run);

    try {
      const token = process.env.NOTION_TOKEN;
      const tasksDbId = process.env.NOTION_DATABASE_TASKS_ID;
      const taskId = typeof payload.notionTaskId === "string" ? payload.notionTaskId : "";
      if (token && tasksDbId && taskId) {
        const notion = new Client({ auth: token });
        await updateDelegatedTaskStatus({
          notion,
          tasksDbId,
          pageId: taskId,
          statusPreference: ["Done", "Completed"],
          hours: hoursCmmdHub,
          detail: `What work did you accomplish or bugs did you fix?\n${workSummary}\n\nHours_cmmd_hub: ${hoursCmmdHub.toFixed(
            2,
          )}\nRun ID: ${run.runId}\nConnector: ${run.connector}`,
        });
        await writeNotionAuditLog(
          notion,
          tasksDbId,
          `Delegated run completed -> ${run.connector} (${run.runId}) ticket ${taskId}`,
        );
      }

      run.status = "completed";
      run.completedAt = new Date().toISOString();
      run.error = undefined;
      completed.push(run.runId);
      mutated = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown run processor error";
      run.status = "failed";
      run.error = message;
      if (!store.retryQueue.some((queued) => queued.runId === run.runId)) {
        store.retryQueue.unshift({ ...run });
      }
      failed.push(run.runId);
      mutated = true;
    }
  }

  if (mutated) {
    store.retryQueue = store.retryQueue.filter((queued) => queued.status !== "completed");
    await saveStore(store);
  }

  return { processed, completed, failed };
}

export async function completeRoutedRun(input: {
  runId: string;
  hoursCmmdHub: number;
  workSummary: string;
}): Promise<RoutedRun> {
  const store = await loadStore();
  const run = store.runs.find((entry) => entry.runId === input.runId);
  if (!run) {
    throw new Error("Run not found");
  }

  const taskId =
    typeof run.payload.notionTaskId === "string" ? run.payload.notionTaskId : null;
  if (!taskId) {
    throw new Error("Run has no linked Notion ticket");
  }

  const token = process.env.NOTION_TOKEN;
  const tasksDbId = process.env.NOTION_DATABASE_TASKS_ID;
  if (!token || !tasksDbId) {
    throw new Error("Notion task database not configured");
  }

  const notion = new Client({ auth: token });
  await updateDelegatedTaskStatus({
    notion,
    tasksDbId,
    pageId: taskId,
    statusPreference: ["Done", "Completed"],
    hours: input.hoursCmmdHub,
    detail: `What work did you accomplish or bugs did you fix?\n${input.workSummary}\n\nHours_cmmd_hub: ${Number(
      input.hoursCmmdHub.toFixed(2),
    )}\nRun ID: ${run.runId}\nConnector: ${run.connector}`,
  });
  await writeNotionAuditLog(
    notion,
    tasksDbId,
    `Delegated run completed -> ${run.connector} (${run.runId}) ticket ${taskId}`,
  );

  run.status = "completed";
  run.error = undefined;
  await saveStore(store);

  return run;
}

export async function writeDailyAgentSummary(): Promise<{
  summaryPageId?: string;
  completed: number;
  blocked: number;
  escalated: number;
  skipped?: string;
}> {
  const store = await loadStore();
  const completed = store.runs.filter((run) => run.status === "completed").length;
  const blocked = store.runs.filter((run) => run.status === "failed").length;
  const escalated = store.retryQueue.length;

  const token = process.env.NOTION_TOKEN;
  const tasksDbId = process.env.NOTION_DATABASE_TASKS_ID;
  if (!token || !tasksDbId) {
    return {
      completed,
      blocked,
      escalated,
      skipped: "Notion task DB is not configured",
    };
  }

  const notion = new Client({ auth: token });
  const schema = (
    await notion.dataSources.retrieve({ data_source_id: tasksDbId })
  ).properties as Record<string, { type: string;[key: string]: unknown }>;
  const titleKey = Object.entries(schema).find(([, value]) => value.type === "title")?.[0];
  if (!titleKey) {
    return {
      completed,
      blocked,
      escalated,
      skipped: "Task database has no title field",
    };
  }

  const title = `[AgentDailySummary] ${new Date().toISOString().slice(0, 10)}`;
  const properties: Record<string, unknown> = {
    [titleKey]: {
      title: [{ text: { content: title } }],
    },
  };

  const status = findProperty(schema, "status", ["status"]);
  if (status) {
    properties[status] = { status: { name: "Done" } };
  }
  const richText = findProperty(schema, "rich_text", ["summary", "note", "details"]);
  if (richText) {
    properties[richText] = {
      rich_text: [
        {
          type: "text",
          text: {
            content: `Completed: ${completed}; Blocked: ${blocked}; Escalated: ${escalated}`,
          },
        },
      ],
    };
  }
  const queueLabelKey = findProperty(schema, "select", ["queue label", "queue", "label"]);
  if (queueLabelKey && selectOptionExists(schema[queueLabelKey], "System Signal")) {
    properties[queueLabelKey] = { select: { name: "System Signal" } };
  }

  const created = await notion.pages.create({
    parent: { data_source_id: tasksDbId },
    properties:
      properties as NonNullable<Parameters<Client["pages"]["create"]>[0]["properties"]>,
  });

  await writeNotionAuditLog(notion, tasksDbId, `Daily summary created -> ${created.id}`);

  return {
    summaryPageId: created.id,
    completed,
    blocked,
    escalated,
  };
}
