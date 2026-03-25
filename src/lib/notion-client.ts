// @ts-nocheck
import { Client } from "@notionhq/client";

import {
  CompleteSessionInput,
  DashboardPayload,
  FocusSession,
  FocusTask,
  NotionConfig,
  NotionDataService,
  PaletteColor,
  QueueStatus,
  UpsertTaskInput,
} from "@/lib/types";

type NotionPropertyValue = {
  type?: string;
  [key: string]: unknown;
};

type NotionPropertyMap = Record<string, NotionPropertyValue>;
type CreatePageProperties = NonNullable<
  Parameters<Client["pages"]["create"]>[0]["properties"]
>;
type UpdatePageProperties = NonNullable<
  Parameters<Client["pages"]["update"]>[0]["properties"]
>;
type RetrievePageResponse = Awaited<ReturnType<Client["pages"]["retrieve"]>>;

const COLORS: PaletteColor[] = ["pink", "sage", "teal", "sand"];
const METRICS_TIMEZONE = process.env.SMS_TIMEZONE ?? "America/New_York";
const HIDDEN_QUEUE_LABELS = new Set(["agent inbox", "agent log", "system signal"]);
const WEEKDAY_FOCUS_DAYS = ["Mon", "Tue", "Wed", "Thu"];
const WEEKDAY_OWNER_ORDER = (process.env.FOCUS_WEEKDAY_COMPANIES ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const LOOSE_END_DAYS = (process.env.FOCUS_LOOSE_END_DAYS ?? "Fri")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const SESSION_TASK_MAP = new Map<string, string>();
let LIVE_SESSION_CACHE: FocusSession | null = null;

function hasTimePrecision(isoLike: string | undefined): boolean {
  if (!isoLike) {
    return false;
  }
  return isoLike.includes("T");
}

function normalizeSessionStart(
  sessionStart: string | undefined,
  cacheStart: string | undefined,
): string {
  if (sessionStart && hasTimePrecision(sessionStart)) {
    return sessionStart;
  }
  if (cacheStart) {
    return cacheStart;
  }
  // Date-only values from Notion ("YYYY-MM-DD") lose start-of-session precision
  // and can make the live timer jump as if the session started at midnight.
  // Fallback to "now" when no precise timestamp exists.
  if (sessionStart && !hasTimePrecision(sessionStart)) {
    return new Date().toISOString();
  }
  return new Date().toISOString();
}

function asPropertyMap(value: unknown): NotionPropertyMap {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value as NotionPropertyMap;
}

function getPropType(value: NotionPropertyValue | undefined): string | undefined {
  return typeof value?.type === "string" ? value.type : undefined;
}

function getPlainTextArray(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      const plainText = (item as { plain_text?: unknown }).plain_text;
      return typeof plainText === "string" ? plainText : "";
    })
    .join("")
    .trim();
}

function relationFirstId(value: NotionPropertyValue | undefined): string | undefined {
  if (getPropType(value) !== "relation") {
    return undefined;
  }

  const relation = value?.relation;
  if (!Array.isArray(relation) || relation.length === 0) {
    return undefined;
  }

  const first = relation[0];
  if (!first || typeof first !== "object") {
    return undefined;
  }

  const id = (first as { id?: unknown }).id;
  return typeof id === "string" ? id : undefined;
}

function hasConfig(config: NotionConfig): boolean {
  return Boolean(
    config.token &&
    config.businessesDbId &&
    config.tasksDbId &&
    config.projectsDbId &&
    config.sessionsDbId,
  );
}

function titleFromProperties(properties: NotionPropertyMap): string {
  for (const value of Object.values(properties)) {
    if (getPropType(value) === "title") {
      const text = getPlainTextArray(value.title);
      if (text.length > 0) {
        return text;
      }
    }
  }

  for (const value of Object.values(properties)) {
    if (getPropType(value) === "rich_text") {
      const text = getPlainTextArray(value.rich_text);
      if (text.length > 0) {
        return text;
      }
    }
  }

  return "Untitled";
}

function pickNumber(properties: NotionPropertyMap, names: string[]): number {
  for (const name of names) {
    const parsed = parseNumericProperty(properties[name]);
    if (typeof parsed === "number" && Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function parseNumericProperty(value: NotionPropertyValue | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  if (getPropType(value) === "number" && typeof value.number === "number") {
    return value.number;
  }

  if (getPropType(value) === "formula") {
    const formula = value.formula as
      | { type?: unknown; number?: unknown; string?: unknown }
      | undefined;
    if (formula?.type === "number" && typeof formula.number === "number") {
      return formula.number;
    }
    if (formula?.type === "string" && typeof formula.string === "string") {
      const direct = Number(formula.string.trim());
      if (Number.isFinite(direct)) {
        return direct;
      }
    }
  }

  if (getPropType(value) === "rollup") {
    const rollup = value.rollup as
      | { type?: unknown; number?: unknown; array?: unknown[] }
      | undefined;

    if (rollup?.type === "number" && typeof rollup.number === "number") {
      return rollup.number;
    }

    if (rollup?.type === "array" && Array.isArray(rollup.array)) {
      const sum = rollup.array.reduce<number>((acc, item) => {
        if (!item || typeof item !== "object") {
          return acc;
        }

        const entry = item as { type?: unknown; number?: unknown };
        if (entry.type === "number" && typeof entry.number === "number") {
          return acc + entry.number;
        }
        return acc;
      }, 0);

      if (sum > 0) {
        return sum;
      }
    }
  }

  const text = getTextFromProperty(value);
  if (text) {
    const direct = Number(text.trim());
    if (Number.isFinite(direct)) {
      return direct;
    }
  }

  return undefined;
}

function getTextFromProperty(value: NotionPropertyValue | undefined): string {
  if (!value) {
    return "";
  }
  if (getPropType(value) === "rich_text") {
    return getPlainTextArray(value.rich_text);
  }
  if (getPropType(value) === "title") {
    return getPlainTextArray(value.title);
  }
  if (getPropType(value) === "formula") {
    const formula = value.formula as { type?: unknown; string?: unknown } | undefined;
    if (formula?.type === "string" && typeof formula.string === "string") {
      return formula.string.trim();
    }
  }
  return "";
}

function parseDurationTextToMinutes(
  input: string,
  defaultUnit: "minutes" | "hours",
): number | undefined {
  const normalized = input.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  const hhmm = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const hours = Number(hhmm[1]);
    const minutes = Number(hhmm[2]);
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      return hours * 60 + minutes;
    }
  }

  let totalMinutes = 0;
  let matched = false;

  const hoursRegex = /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b/g;
  const minutesRegex = /(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes)\b/g;

  for (const match of normalized.matchAll(hoursRegex)) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) {
      totalMinutes += value * 60;
      matched = true;
    }
  }

  for (const match of normalized.matchAll(minutesRegex)) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) {
      totalMinutes += value;
      matched = true;
    }
  }

  if (matched) {
    return Math.round(totalMinutes);
  }

  const direct = Number(normalized);
  if (Number.isFinite(direct)) {
    return Math.round(defaultUnit === "hours" ? direct * 60 : direct);
  }

  return undefined;
}

function parseDurationPropertyToMinutes(
  value: NotionPropertyValue | undefined,
  defaultUnit: "minutes" | "hours",
): number | undefined {
  const numeric = parseNumericProperty(value);
  if (typeof numeric === "number" && Number.isFinite(numeric)) {
    return Math.round(defaultUnit === "hours" ? numeric * 60 : numeric);
  }

  const text = getTextFromProperty(value);
  if (text) {
    return parseDurationTextToMinutes(text, defaultUnit);
  }

  return undefined;
}

function pickDurationMinutes(
  properties: NotionPropertyMap,
  minuteNames: string[],
  hourNames: string[],
): number {
  for (const name of minuteNames) {
    const parsed = parseDurationPropertyToMinutes(properties[name], "minutes");
    if (typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  for (const name of hourNames) {
    const parsed = parseDurationPropertyToMinutes(properties[name], "hours");
    if (typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 0;
}

function pickStatus(properties: NotionPropertyMap, names: string[]): string | undefined {
  for (const name of names) {
    const value = properties[name];
    if (getPropType(value) === "status") {
      const statusName = (value.status as { name?: unknown } | undefined)?.name;
      if (typeof statusName === "string" && statusName.length > 0) {
        return statusName;
      }
    }
    if (getPropType(value) === "select") {
      const selectName = (value.select as { name?: unknown } | undefined)?.name;
      if (typeof selectName === "string" && selectName.length > 0) {
        return selectName;
      }
    }
  }
  return undefined;
}

function pickRichText(properties: NotionPropertyMap, names: string[]): string {
  for (const name of names) {
    const value = properties[name];
    if (getPropType(value) === "rich_text") {
      const text = getPlainTextArray(value.rich_text);
      if (text) {
        return text;
      }
    }
  }
  return "";
}

function pickDate(properties: NotionPropertyMap, names: string[]): string | undefined {
  for (const name of names) {
    const value = properties[name];
    if (getPropType(value) === "date") {
      const start = (value.date as { start?: unknown } | undefined)?.start;
      if (typeof start === "string" && start.length > 0) {
        return start;
      }
    }
  }
  return undefined;
}

function dateKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: METRICS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function mapTaskQueueStatus(rawStatus?: string): QueueStatus {
  const normalized = (rawStatus ?? "").toLowerCase();
  if (normalized.includes("done") || normalized.includes("complete")) {
    return "DONE";
  }
  if (normalized.includes("next")) {
    return "NEXT";
  }
  if (normalized.includes("live") || normalized.includes("active")) {
    return "LIVE";
  }
  return "QUEUED";
}

function mapSessionStatus(rawStatus?: string): QueueStatus {
  const normalized = (rawStatus ?? "").toLowerCase();
  if (normalized.includes("done") || normalized.includes("complete")) {
    return "DONE";
  }
  if (
    normalized.includes("live") ||
    normalized.includes("progress") ||
    normalized.includes("active") ||
    normalized.includes("started") ||
    normalized.includes("working")
  ) {
    return "LIVE";
  }
  if (normalized.includes("next")) {
    return "NEXT";
  }
  return "QUEUED";
}

function applyNextSessionSelector(
  queue: FocusTask[],
  businesses: Array<{ id: string; behindMinutes: number; name: string }>,
  hasActiveSession: boolean,
): FocusTask[] {
  if (hasActiveSession) {
    return queue;
  }

  if (queue.some((task) => task.status === "NEXT")) {
    return queue;
  }

  const queuedTasks = queue.filter((task) => task.status === "QUEUED");
  if (queuedTasks.length === 0) {
    return queue;
  }

  const deficitByBusiness = new Map(
    businesses.map((business) => [business.id, Math.max(0, -business.behindMinutes)]),
  );
  const ownerBusinessId =
    !isWeekend() && !isLooseEndDay() ? getWeekdayOwnerBusinessId(businesses) : null;

  const candidateTasks =
    ownerBusinessId && queuedTasks.some((task) => task.businessId === ownerBusinessId)
      ? queuedTasks.filter((task) => task.businessId === ownerBusinessId)
      : queuedTasks;

  let selectedTaskId = candidateTasks[0]?.id;
  let bestScore = -1;

  for (const task of candidateTasks) {
    const businessDeficit = deficitByBusiness.get(task.businessId) ?? 0;
    const score = businessDeficit * 1_000 + Math.max(0, task.plannedMinutes);
    if (score > bestScore) {
      bestScore = score;
      selectedTaskId = task.id;
    }
  }

  if (!selectedTaskId) {
    return queue;
  }

  return queue.map((task) =>
    task.id === selectedTaskId ? { ...task, status: "NEXT" } : task,
  );
}

function isMetaTrackingTask(title: string): boolean {
  return /^\[AFH-[A-Z]+-\d+\]/i.test(title.trim());
}

function shouldHideTaskFromFocusQueue(title: string, queueLabel?: string): boolean {
  const normalizedLabel = (queueLabel ?? "").trim().toLowerCase();
  if (normalizedLabel && HIDDEN_QUEUE_LABELS.has(normalizedLabel)) {
    return true;
  }

  return (
    /^\[(agentlog|agentdailysummary)\]/i.test(title.trim()) ||
    title.toLowerCase().includes("[system]")
  );
}

function weekdayInTimezone(date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: METRICS_TIMEZONE,
    weekday: "short",
  }).format(date);
}

function getWeekdayOwnerBusinessId(
  businesses: Array<{ id: string; name: string }>,
  date = new Date(),
): string | null {
  const day = weekdayInTimezone(date);
  const dayIndex = WEEKDAY_FOCUS_DAYS.indexOf(day);
  if (dayIndex < 0 || businesses.length === 0) {
    return null;
  }

  if (WEEKDAY_OWNER_ORDER.length > 0) {
    const configuredName = WEEKDAY_OWNER_ORDER[dayIndex % WEEKDAY_OWNER_ORDER.length]?.toLowerCase();
    if (configuredName) {
      const matched = businesses.find((business) =>
        business.name.toLowerCase().includes(configuredName),
      );
      if (matched) {
        return matched.id;
      }
    }
  }

  const ordered = [...businesses].sort((a, b) => a.name.localeCompare(b.name));
  return ordered[dayIndex % ordered.length]?.id ?? null;
}

function isWeekend(date = new Date()): boolean {
  const day = weekdayInTimezone(date);
  return day === "Sat" || day === "Sun";
}

function isLooseEndDay(date = new Date()): boolean {
  const day = weekdayInTimezone(date);
  return LOOSE_END_DAYS.some((configured) => configured.toLowerCase() === day.toLowerCase());
}

function isFounderTask(task: FocusTask): boolean {
  const lbl = (task.queueLabel ?? "").toLowerCase();
  const title = (task.title ?? "").toLowerCase();
  const cat = (task.category ?? "").toLowerCase();
  return lbl.includes("founder") || title.includes("founder") || cat.includes("founder");
}

function filterQueueForDailyFocus(
  queue: FocusTask[],
  businesses: Array<{ id: string; name: string }>,
  activeSession: FocusSession | null,
): FocusTask[] {
  if (queue.length === 0) {
    return queue;
  }

  const todayKey = dateKey(new Date().toISOString());
  const ownerBusinessId = getWeekdayOwnerBusinessId(businesses);
  const liveTaskId = activeSession?.taskId;
  const nextTaskId = queue.find((task) => task.status === "NEXT")?.id;

  if (isWeekend() && !liveTaskId) {
    const weekendMinimal = queue.filter((task) => task.status === "NEXT").slice(0, 1);
    return weekendMinimal;
  }

  if (isLooseEndDay() && !liveTaskId) {
    const looseCandidates = queue
      .filter((task) => task.status !== "DONE")
      .filter((task) => {
        const category = task.category.toLowerCase();
        const isOps = /ops|admin|legal|cleanup|carryover/.test(category);
        const overdue =
          Boolean(task.dueDate) && task.dueDate ? dateKey(task.dueDate) < todayKey : false;
        return isOps || overdue;
      })
      .slice(0, 6);

    const looseMap = new Map(looseCandidates.map((task) => [task.id, task]));
    if (nextTaskId) {
      const nextTask = queue.find((task) => task.id === nextTaskId);
      if (nextTask) {
        looseMap.set(nextTask.id, nextTask);
      }
    }
    return [...looseMap.values()].slice(0, 8);
  }

  const dueToday = queue.filter(
    (task) => task.status !== "DONE" && task.dueDate && dateKey(task.dueDate) === todayKey,
  );

  let focused = dueToday;
  if (ownerBusinessId) {
    const ownerDueToday = dueToday.filter((task) => task.businessId === ownerBusinessId);
    if (ownerDueToday.length > 0) {
      focused = ownerDueToday;
    } else {
      focused = queue
        .filter((task) => task.status !== "DONE" && task.businessId === ownerBusinessId)
        .slice(0, 6);
    }
  }

  if (focused.length === 0) {
    const backup = queue.filter((task) => task.status !== "DONE").slice(0, 6);
    if (backup.length > 0) {
      focused = backup;
    } else {
      focused = dueToday.slice(0, 6);
    }
  }

  const founderTasks = queue
    .filter((task) => task.status !== "DONE" && isFounderTask(task))
    .slice(0, 3);

  if (founderTasks.length > 0) {
    focused = [...focused, ...founderTasks];
  }

  const deduped = new Map(focused.map((task) => [task.id, task]));
  if (liveTaskId) {
    const liveTask = queue.find((task) => task.id === liveTaskId);
    if (liveTask) {
      deduped.set(liveTask.id, liveTask);
    }
  }
  if (nextTaskId) {
    const nextTask = queue.find((task) => task.id === nextTaskId);
    if (nextTask) {
      deduped.set(nextTask.id, nextTask);
    }
  }

  return [...deduped.values()].slice(0, 8);
}

function safeOption(
  options: Array<{ name: string }> | undefined,
  preferred: string[],
): string | undefined {
  if (!options || options.length === 0) {
    return undefined;
  }

  for (const preferredName of preferred) {
    const found = options.find(
      (option) => option.name.toLowerCase() === preferredName.toLowerCase(),
    );
    if (found) {
      return found.name;
    }
  }

  return undefined;
}

function getFirstRelationIdFromPage(
  page: RetrievePageResponse,
  relationPropertyName: string,
): string | null {
  if (!("properties" in page)) {
    return null;
  }

  const properties = page.properties as Record<string, NotionPropertyValue>;
  const relationProp = properties[relationPropertyName];
  if (!relationProp || getPropType(relationProp) !== "relation") {
    return null;
  }

  const relation = relationProp.relation;
  if (!Array.isArray(relation) || relation.length === 0) {
    return null;
  }

  const first = relation[0] as { id?: unknown } | undefined;
  return typeof first?.id === "string" ? first.id : null;
}

class NotionBackedService implements NotionDataService {
  private notion: Client;

  constructor(private config: Required<NotionConfig>) {
    this.notion = new Client({ auth: config.token });
  }

  async getDashboardData(): Promise<DashboardPayload> {
    console.log("NOTION DATABASES KEYS:", Object.keys(this.notion.databases));
    const businessesResponse = await this.notion.dataSources.query({
      data_source_id: this.config.businessesDbId,
      page_size: 50,
    });

    const tasksResponse = await this.notion.dataSources.query({
      data_source_id: this.config.tasksDbId,
      page_size: 100,
    });

    const sessionsResponse = await this.notion.dataSources.query({
      data_source_id: this.config.sessionsDbId,
      page_size: 100,
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
    });

    let businesses = businessesResponse.results.map((row, index) => {
      const properties = asPropertyMap((row as { properties: unknown }).properties);
      const name = titleFromProperties(properties);
      const plannedMinutes = pickNumber(properties, [
        "Weekly Target (min)",
        "Weekly Target",
        "Planned Minutes",
        "Planned",
        "Target Minutes",
      ]);
      const focusedMinutes = pickNumber(properties, [
        "Minutes Logged",
        "Focused Minutes",
        "Minutes Done",
        "Actual Minutes",
      ]);

      return {
        id: row.id,
        name,
        color: COLORS[index % COLORS.length],
        plannedMinutes,
        focusedMinutes,
        behindMinutes: focusedMinutes - plannedMinutes,
      };
    });

    const businessById = new Map(businesses.map((business) => [business.id, business]));

    let queue: FocusTask[] = tasksResponse.results
      .map((row) => {
        const properties = asPropertyMap((row as { properties: unknown }).properties);
        const title = titleFromProperties(properties);
        if (isMetaTrackingTask(title)) {
          return null;
        }
        const queueLabel = pickStatus(properties, ["Queue Label", "Queue", "Queue Label_cmmd_hub"]);
        if (shouldHideTaskFromFocusQueue(title, queueLabel)) {
          return null;
        }
        const relationBusinessId = relationFirstId(properties.Business);
        const relatedBusiness = relationBusinessId
          ? businessById.get(relationBusinessId)
          : undefined;

        const businessName =
          relatedBusiness?.name ||
          pickRichText(properties, ["Business Name", "Business"]) ||
          "Unassigned Business";
        const plannedMinutes = pickDurationMinutes(
          properties,
          ["Planned Minutes", "Minutes", "Duration"],
          ["Hours_cmmd_hub", "Hours"],
        );

        return {
          id: row.id,
          title,
          businessId: relatedBusiness?.id ?? relationBusinessId ?? "unassigned",
          businessName,
          category:
            pickRichText(properties, ["Category", "Area", "Workstream"]) || "General",
          queueLabel,
          dueDate: pickDate(properties, ["Due Date", "Due", "Deadline"]),
          plannedMinutes,
          status: mapTaskQueueStatus(
            pickStatus(properties, ["Status", "Task Status", "Queue Status"]),
          ),
        };
      })
      .filter((task) => task !== null) as FocusTask[];

    const queueByTaskId = new Map(queue.map((task) => [task.id, task]));
    const todayKey = dateKey(new Date().toISOString());

    const derivedFocusedByBusiness = new Map<string, number>();
    let completedSessionsToday = 0;
    for (const row of sessionsResponse.results) {
      const properties = asPropertyMap((row as { properties: unknown }).properties);
      const status = mapSessionStatus(pickStatus(properties, ["Status", "Session Status"]));
      if (status !== "DONE") {
        continue;
      }

      const sessionDate =
        pickDate(properties, ["Date", "Started At"]) ??
        (row as { created_time?: string }).created_time;
      if (!sessionDate || dateKey(sessionDate) !== todayKey) {
        continue;
      }

      const taskId = relationFirstId(properties.Task);
      const task = taskId ? queueByTaskId.get(taskId) : undefined;
      const businessId =
        relationFirstId(properties.Business) ?? task?.businessId ?? "unassigned";

      const sessionMinutes =
        pickDurationMinutes(
          properties,
          ["Minutes", "Duration", "Planned Minutes"],
          ["Hours_cmmd_hub", "Hours"],
        ) || task?.plannedMinutes || 0;

      if (sessionMinutes <= 0) {
        continue;
      }
      completedSessionsToday += 1;

      derivedFocusedByBusiness.set(
        businessId,
        (derivedFocusedByBusiness.get(businessId) ?? 0) + sessionMinutes,
      );
    }

    const derivedPlannedByBusiness = new Map<string, number>();
    for (const task of queue) {
      if (task.status === "DONE" || task.plannedMinutes <= 0) {
        continue;
      }
      derivedPlannedByBusiness.set(
        task.businessId,
        (derivedPlannedByBusiness.get(task.businessId) ?? 0) + task.plannedMinutes,
      );
    }

    businesses = businesses.map((business) => {
      const fallbackPlanned = derivedPlannedByBusiness.get(business.id) ?? 0;
      const fallbackFocused = derivedFocusedByBusiness.get(business.id) ?? 0;
      const plannedMinutes = business.plannedMinutes > 0 ? business.plannedMinutes : fallbackPlanned;
      const focusedMinutes = business.focusedMinutes > 0 ? business.focusedMinutes : fallbackFocused;

      return {
        ...business,
        plannedMinutes,
        focusedMinutes,
        behindMinutes: focusedMinutes - plannedMinutes,
      };
    });

    const warmupMode =
      completedSessionsToday === 0 &&
      [...derivedFocusedByBusiness.values()].reduce((sum, value) => sum + value, 0) === 0;
    if (warmupMode) {
      businesses = businesses.map((business) => ({
        ...business,
        behindMinutes: 0,
      }));
    }

    const activeSessionRow = sessionsResponse.results.find((row) => {
      const properties = asPropertyMap((row as { properties: unknown }).properties);
      const status = pickStatus(properties, ["Status", "Session Status"]);
      return mapSessionStatus(status) === "LIVE";
    });

    let activeSession: FocusSession | null = null;
    if (activeSessionRow) {
      const properties = asPropertyMap(
        (activeSessionRow as { properties: unknown }).properties,
      );
      const cachedLiveForRow =
        LIVE_SESSION_CACHE?.id === activeSessionRow.id ? LIVE_SESSION_CACHE : null;

      const taskId = relationFirstId(properties.Task) ?? "";
      const sourceTask = queue.find((task) => task.id === taskId);
      const sessionStartedAt = pickDate(properties, ["Started At", "Date"]);

      activeSession = {
        id: activeSessionRow.id,
        notionPageId: activeSessionRow.id,
        taskId: sourceTask?.id ?? taskId ?? cachedLiveForRow?.taskId ?? "",
        taskTitle:
          sourceTask?.title ??
          cachedLiveForRow?.taskTitle ??
          titleFromProperties(properties),
        businessId: sourceTask?.businessId ?? cachedLiveForRow?.businessId ?? "unassigned",
        businessName:
          sourceTask?.businessName ??
          cachedLiveForRow?.businessName ??
          "Unassigned Business",
        plannedMinutes:
          sourceTask?.plannedMinutes ||
          cachedLiveForRow?.plannedMinutes ||
          pickDurationMinutes(
            properties,
            ["Planned Minutes", "Minutes", "Duration"],
            ["Hours_cmmd_hub", "Hours"],
          ),
        startedAt: normalizeSessionStart(
          sessionStartedAt ??
          (activeSessionRow as { created_time?: string }).created_time,
          cachedLiveForRow?.startedAt,
        ),
        status: "LIVE",
      };
    }

    if (!activeSession && LIVE_SESSION_CACHE?.status === "LIVE") {
      activeSession = LIVE_SESSION_CACHE;
    }

    queue = applyNextSessionSelector(queue, businesses, Boolean(activeSession));
    queue = filterQueueForDailyFocus(queue, businesses, activeSession);

    const behindTargets = [...businesses]
      .sort((a, b) => a.behindMinutes - b.behindMinutes)
      .filter((business) => business.behindMinutes < 0)
      .slice(0, 3)
      .map((business) => ({
        businessId: business.id,
        name: business.name,
        behindMinutes: business.behindMinutes,
      }));

    const totalPlannedMinutes = businesses.reduce(
      (sum, business) => sum + business.plannedMinutes,
      0,
    );
    const totalFocusedMinutes = businesses.reduce(
      (sum, business) => sum + business.focusedMinutes,
      0,
    );

    const dateLabel = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

    return {
      syncedAt: new Date().toISOString(),
      notebookBusinessName: activeSession?.businessName ?? businesses[0]?.name ?? "Business",
      dateLabel,
      totalBusinesses: businesses.length,
      totalPlannedMinutes,
      totalFocusedMinutes,
      businesses,
      queue,
      behindTargets,
      activeSession,
    };
  }

  async startSession(taskId: string): Promise<FocusSession> {
    const dashboard = await this.getDashboardData();

    if (dashboard.activeSession) {
      return dashboard.activeSession;
    }

    const task = dashboard.queue.find((row) => row.id === taskId);

    if (!task) {
      throw new Error("Task not found in Notion task database");
    }

    const sessionsDb = await this.notion.dataSources.retrieve({
      data_source_id: this.config.sessionsDbId,
    });
    const sessionProperties = sessionsDb.properties;

    const titleKey = Object.entries(sessionProperties).find(
      ([, value]) => value.type === "title",
    )?.[0];

    if (!titleKey) {
      throw new Error("Focus Sessions DB is missing a title property");
    }

    const nowIso = new Date().toISOString();

    const createProperties: Record<string, unknown> = {
      [titleKey]: {
        title: [
          {
            text: {
              content: `${task.businessName} · ${task.title}`,
            },
          },
        ],
      },
    };

    const statusEntry = Object.entries(sessionProperties).find(
      ([name, value]) =>
        value.type === "status" ||
        (value.type === "select" && ["status", "session status"].includes(name.toLowerCase())),
    );

    if (statusEntry) {
      const [name, value] = statusEntry;
      if (value.type === "status") {
        const option = safeOption(value.status.options, [
          "Live",
          "In Progress",
          "Started",
          "Planned",
          "Working",
        ]);
        if (option) {
          createProperties[name] = { status: { name: option } };
        }
      }
      if (value.type === "select") {
        const option = safeOption(value.select.options, [
          "Live",
          "In Progress",
          "Started",
          "Planned",
          "Working",
        ]);
        if (option) {
          createProperties[name] = { select: { name: option } };
        }
      }
    }

    const startedAtEntry = Object.entries(sessionProperties).find(
      ([name, value]) =>
        value.type === "date" &&
        (name.toLowerCase().includes("start") || name.toLowerCase() === "date"),
    );
    if (startedAtEntry) {
      createProperties[startedAtEntry[0]] = { date: { start: nowIso } };
    }

    const minutesEntry = Object.entries(sessionProperties).find(
      ([name, value]) => value.type === "number" && name.toLowerCase().includes("minute"),
    );
    if (minutesEntry && task.plannedMinutes > 0) {
      createProperties[minutesEntry[0]] = { number: task.plannedMinutes };
    }

    const taskRelationEntry = Object.entries(sessionProperties).find(
      ([name, value]) =>
        value.type === "relation" &&
        ["task", "linked task"].includes(name.toLowerCase()),
    );
    if (taskRelationEntry) {
      createProperties[taskRelationEntry[0]] = { relation: [{ id: task.id }] };
    }

    const created = await this.notion.pages.create({
      parent: { data_source_id: this.config.sessionsDbId },
      properties: createProperties as CreatePageProperties,
    });

    SESSION_TASK_MAP.set(created.id, task.id);

    await this.updateTaskStatus(task.id, "In Progress", "Live");

    const liveSession: FocusSession = {
      id: created.id,
      notionPageId: created.id,
      taskId: task.id,
      taskTitle: task.title,
      businessId: task.businessId,
      businessName: task.businessName,
      plannedMinutes: task.plannedMinutes,
      startedAt: nowIso,
      status: "LIVE",
    };

    LIVE_SESSION_CACHE = liveSession;
    return liveSession;
  }

  async completeSession(input: CompleteSessionInput): Promise<FocusSession> {
    const sessionsDb = await this.notion.dataSources.retrieve({
      data_source_id: this.config.sessionsDbId,
    });
    const nowIso = new Date().toISOString();
    const priorLiveSession =
      LIVE_SESSION_CACHE?.id === input.sessionId ? LIVE_SESSION_CACHE : null;

    const updates: Record<string, unknown> = {};
    const sessionPage = await this.notion.pages.retrieve({ page_id: input.sessionId });
    let relationTaskId: string | null = null;
    const startedAt = priorLiveSession?.startedAt
      ? new Date(priorLiveSession.startedAt)
      : null;
    const elapsedMinutes =
      startedAt && Number.isFinite(startedAt.getTime())
        ? Math.max(1, Math.round((Date.now() - startedAt.getTime()) / 60_000))
        : 0;
    const completedMinutes = Math.max(0, priorLiveSession?.plannedMinutes ?? elapsedMinutes);
    const completedHours =
      completedMinutes > 0 ? Number((completedMinutes / 60).toFixed(2)) : 0;

    for (const [name, value] of Object.entries(sessionsDb.properties)) {
      const normalizedName = name.toLowerCase();

      if (
        value.type === "relation" &&
        ["task", "linked task"].includes(normalizedName)
      ) {
        relationTaskId = getFirstRelationIdFromPage(sessionPage, name);
      }

      if (value.type === "status" || value.type === "select") {
        if (normalizedName.includes("status")) {
          if (value.type === "status") {
            const option = safeOption(value.status.options, ["Done", "Completed"]);
            if (option) {
              updates[name] = { status: { name: option } };
            }
          }
          if (value.type === "select") {
            const option = safeOption(value.select.options, ["Done", "Completed"]);
            if (option) {
              updates[name] = { select: { name: option } };
            }
          }
        }
      }

      if (value.type === "date" && normalizedName.includes("complete")) {
        updates[name] = { date: { start: new Date().toISOString() } };
      }

      if (value.type === "date" && normalizedName === "date") {
        updates[name] = { date: { start: nowIso } };
      }

      if (value.type === "number" && normalizedName.includes("minute")) {
        updates[name] = {
          number: completedMinutes,
        };
      }
      if (
        value.type === "number" &&
        (normalizedName.includes("hours_cmmd_hub") || normalizedName === "hours")
      ) {
        updates[name] = {
          number: completedHours,
        };
      }

      if (value.type === "rich_text" && normalizedName.includes("outcome")) {
        updates[name] = {
          rich_text: [{ type: "text", text: { content: input.outcomes } }],
        };
      }

      if (value.type === "rich_text" && normalizedName.includes("block")) {
        updates[name] = {
          rich_text: [{ type: "text", text: { content: input.blockers } }],
        };
      }

      if (value.type === "rich_text" && normalizedName.includes("follow")) {
        updates[name] = {
          rich_text: [{ type: "text", text: { content: input.followUps } }],
        };
      }
    }

    await this.notion.pages.update({
      page_id: input.sessionId,
      properties: updates as UpdatePageProperties,
    });

    const taskId = SESSION_TASK_MAP.get(input.sessionId) ?? relationTaskId ?? undefined;
    if (taskId) {
      await this.updateTaskStatus(taskId, "Done", "Completed");
      await this.addTaskLoggedHours(taskId, completedHours);
      SESSION_TASK_MAP.delete(input.sessionId);
    }

    LIVE_SESSION_CACHE = null;

    return {
      id: input.sessionId,
      notionPageId: input.sessionId,
      taskId: taskId ?? priorLiveSession?.taskId ?? "",
      taskTitle: priorLiveSession?.taskTitle ?? "Completed session",
      businessId: priorLiveSession?.businessId ?? "",
      businessName: priorLiveSession?.businessName ?? "",
      plannedMinutes: priorLiveSession?.plannedMinutes ?? 0,
      startedAt: priorLiveSession?.startedAt ?? nowIso,
      completedAt: nowIso,
      status: "DONE",
      outcomes: input.outcomes,
      blockers: input.blockers,
      followUps: input.followUps,
    };
  }

  async completeTask(taskId: string): Promise<void> {
    await this.updateTaskStatus(taskId, "Done", "Completed");
  }

  private async updateTaskStatus(
    taskId: string,
    primaryStatus: string,
    fallbackStatus: string,
  ): Promise<void> {
    try {
      const tasksDb = await this.notion.dataSources.retrieve({
        data_source_id: this.config.tasksDbId,
      });

      const statusEntry = Object.entries(tasksDb.properties).find(
        ([name, value]) =>
          value.type === "status" ||
          (value.type === "select" && ["status", "task status"].includes(name.toLowerCase())),
      );

      if (!statusEntry) {
        return;
      }

      const [name, value] = statusEntry;
      const properties: Record<string, unknown> = {};

      if (value.type === "status") {
        const option = safeOption(value.status.options, [primaryStatus, fallbackStatus]);
        if (!option) {
          return;
        }
        properties[name] = { status: { name: option } };
      }

      if (value.type === "select") {
        const option = safeOption(value.select.options, [primaryStatus, fallbackStatus]);
        if (!option) {
          return;
        }
        properties[name] = { select: { name: option } };
      }

      await this.notion.pages.update({
        page_id: taskId,
        properties: properties as UpdatePageProperties,
      });
    } catch {
      // Non-fatal: task schemas vary across workspaces.
    }
  }

  private async addTaskLoggedHours(taskId: string, hoursToAdd: number): Promise<void> {
    if (!Number.isFinite(hoursToAdd) || hoursToAdd <= 0) {
      return;
    }

    try {
      const page = await this.notion.pages.retrieve({ page_id: taskId });
      if (!("properties" in page)) {
        return;
      }

      const properties = page.properties as Record<string, NotionPropertyValue>;
      const hoursEntry = Object.entries(properties).find(
        ([name, value]) =>
          getPropType(value) === "number" &&
          (name.toLowerCase().includes("hours_cmmd_hub") || name.toLowerCase() === "hours"),
      );

      if (!hoursEntry) {
        return;
      }

      const [hoursPropName, hoursPropValue] = hoursEntry;
      const existing =
        getPropType(hoursPropValue) === "number" && typeof hoursPropValue.number === "number"
          ? hoursPropValue.number
          : 0;
      const next = Number((existing + hoursToAdd).toFixed(2));

      await this.notion.pages.update({
        page_id: taskId,
        properties: {
          [hoursPropName]: { number: next },
        } as UpdatePageProperties,
      });
    } catch {
      // Non-fatal: some task schemas may not expose a numeric hours field.
    }
  }

  async upsertTask(input: UpsertTaskInput): Promise<void> {
    const tasksDbId = this.config.tasksDbId;
    if (!tasksDbId) return;

    let existingPageId: string | undefined = input.taskId;
    
    if (!existingPageId && input.title) {
      const dbResponse = await this.notion.dataSources.query({
        data_source_id: tasksDbId,
        filter: {
          property: "Name",
          title: {
            equals: input.title,
          },
        },
      });
      if (dbResponse.results.length > 0) {
        existingPageId = dbResponse.results[0].id;
      }
    }

    const tasksDb = await this.notion.dataSources.retrieve({
      data_source_id: tasksDbId,
    });

    const properties: Record<string, unknown> = {};

    if (input.title) {
      properties["Name"] = { title: [{ type: "text", text: { content: input.title } }] };
    }

    if (input.businessId) {
      properties["Business"] = { relation: [{ id: input.businessId }] };
    }

    if (input.status) {
      const statusEntry = Object.entries(tasksDb.properties).find(
        ([name, value]) =>
          (value as any).type === "status" ||
          ((value as any).type === "select" && ["status", "task status"].includes(name.toLowerCase())),
      );

      if (statusEntry) {
        const [name, value] = statusEntry;
        if ((value as any).type === "status") {
          const option = safeOption((value as any).status.options, [input.status]);
          if (option) {
            properties[name] = { status: { name: option } };
          }
        } else if ((value as any).type === "select") {
          const option = safeOption((value as any).select.options, [input.status]);
          if (option) {
            properties[name] = { select: { name: option } };
          }
        }
      }
    }

    if (existingPageId) {
      await this.notion.pages.update({
        page_id: existingPageId,
        properties: properties as UpdatePageProperties,
      });
    } else {
      await this.notion.pages.create({
        parent: { data_source_id: tasksDbId } as any,
        properties: properties as CreatePageProperties,
      });
    }
  }
}

export function createNotionDataService(config: NotionConfig): NotionDataService {
  if (!hasConfig(config)) {
    throw new Error("Notion API not configured. Missing environment variables.");
  }

  const typedConfig: Required<NotionConfig> = {
    token: config.token!,
    businessesDbId: config.businessesDbId!,
    tasksDbId: config.tasksDbId!,
    projectsDbId: config.projectsDbId!,
    sessionsDbId: config.sessionsDbId!,
  };

  return new NotionBackedService(typedConfig);
}
