// @ts-nocheck
import { Client } from "@notionhq/client";

import {
  AttentionEvent,
  BrandAsset,
  BrandProfile,
  WeeklyContentRequirement,
  loadBrandOperatorState,
  saveBrandOperatorState,
} from "@/lib/brand-operator-store";
import { createNotionDataService } from "@/lib/notion-client";

type CompanyRef = {
  id: string;
  name: string;
};

type PlatformRule = {
  platform: string;
  weeklyMin: number;
};

const CONTENT_STATUS: WeeklyContentRequirement["status"][] = [
  "Idea",
  "Drafting",
  "Ready",
  "Scheduled",
  "Posted",
];

const PLATFORM_RULES: Record<string, PlatformRule[]> = {
  "osmara atelier": [
    { platform: "Instagram", weeklyMin: 3 },
    { platform: "Pinterest", weeklyMin: 2 },
    { platform: "Newsletter", weeklyMin: 1 },
  ],
  "bytes' atelier": [
    { platform: "Instagram", weeklyMin: 2 },
    { platform: "Blog", weeklyMin: 1 },
    { platform: "LinkedIn", weeklyMin: 1 },
  ],
  "indigoint": [
    { platform: "LinkedIn", weeklyMin: 3 },
    { platform: "X", weeklyMin: 2 },
    { platform: "Newsletter", weeklyMin: 1 },
  ],
  "yên stays": [
    { platform: "Instagram", weeklyMin: 3 },
    { platform: "TikTok", weeklyMin: 2 },
    { platform: "Google Business", weeklyMin: 1 },
  ],
  default: [
    { platform: "Instagram", weeklyMin: 2 },
    { platform: "LinkedIn", weeklyMin: 1 },
  ],
};

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "your",
  "you",
  "are",
  "our",
  "about",
  "into",
  "their",
  "will",
  "have",
  "has",
  "was",
  "were",
  "but",
  "not",
  "they",
  "them",
  "been",
  "more",
  "can",
  "all",
  "out",
  "what",
  "when",
  "where",
  "who",
  "how",
  "why",
  "its",
  "via",
  "per",
  "new",
  "home",
  "page",
]);

function getNotionService() {
  return createNotionDataService({
    token: process.env.NOTION_TOKEN,
    businessesDbId: process.env.NOTION_DATABASE_BUSINESSES_ID,
    tasksDbId: process.env.NOTION_DATABASE_TASKS_ID,
    projectsDbId: process.env.NOTION_DATABASE_PROJECTS_ID,
    sessionsDbId: process.env.NOTION_DATABASE_SESSIONS_ID,
  });
}

function weekKey(date = new Date()): string {
  const year = date.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const diffDays = Math.floor((date.getTime() - jan1.getTime()) / 86_400_000);
  const week = Math.floor((diffDays + jan1.getUTCDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function startOfNextWorkWeek(base = new Date()): Date {
  const next = new Date(base);
  next.setHours(9, 0, 0, 0);
  const day = next.getDay(); // 0=Sun ... 6=Sat
  const daysUntilNextMonday = ((8 - day) % 7) || 7;
  next.setDate(next.getDate() + daysUntilNextMonday);
  return next;
}

function addBusinessDays(base: Date, businessDayOffset: number): Date {
  const date = new Date(base);
  let remaining = Math.max(0, businessDayOffset);
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }
  return date;
}

function normalizeCompanyName(name: string): string {
  return name.trim().toLowerCase();
}

async function getCompanies(): Promise<CompanyRef[]> {
  const dashboard = await getNotionService().getDashboardData();
  return dashboard.businesses.map((business) => ({ id: business.id, name: business.name }));
}

function parseDateKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.SMS_TIMEZONE ?? "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlMatchOne(html: string, pattern: RegExp): string {
  const match = html.match(pattern);
  return match?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}

function htmlMatchMany(html: string, pattern: RegExp): string[] {
  const results: string[] = [];
  let match: RegExpExecArray | null = null;
  const regex = new RegExp(pattern.source, pattern.flags);

  while ((match = regex.exec(html)) !== null) {
    const value = match[1]?.replace(/\s+/g, " ").trim();
    if (value) {
      results.push(value);
    }
  }

  return results;
}

function topKeywords(text: string, limit = 8): string[] {
  const freq = new Map<string, number>();
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word));

  for (const word of words) {
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function deriveTone(text: string): string[] {
  const source = text.toLowerCase();
  const tones = new Set<string>();

  if (/luxury|atelier|crafted|signature|exclusive/.test(source)) {
    tones.add("refined");
  }
  if (/security|analysis|threat|enterprise|compliance/.test(source)) {
    tones.add("authoritative");
  }
  if (/community|care|support|help|welcome/.test(source)) {
    tones.add("warm");
  }
  if (/innovat|future|next|build|create/.test(source)) {
    tones.add("forward-looking");
  }
  if (tones.size === 0) {
    tones.add("clear");
    tones.add("practical");
  }

  return [...tones];
}

function deriveVoice(text: string): string {
  const source = text.toLowerCase();
  if (/luxury|atelier|signature|exclusive/.test(source)) {
    return "Premium and sensory";
  }
  if (/security|threat|enterprise|compliance/.test(source)) {
    return "Technical and trustworthy";
  }
  if (/travel|stay|hospitality|guest/.test(source)) {
    return "Experiential and welcoming";
  }
  return "Clear and confidence-building";
}

function buildAudience(keywords: string[]): string {
  if (keywords.length === 0) {
    return "Prospective customers evaluating fit and trust.";
  }
  return `Audience interests include ${keywords.slice(0, 3).join(", ")}.`;
}

function getRulesForCompany(companyName: string): PlatformRule[] {
  return (
    PLATFORM_RULES[normalizeCompanyName(companyName)] ??
    PLATFORM_RULES.default
  );
}

async function fetchPage(url: string): Promise<{
  url: string;
  title: string;
  description: string;
  headings: string[];
  text: string;
  images: Array<{ assetUrl: string; alt: string }>;
}> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "AFH-BrandDNA-Scanner/1.0",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }

  const html = await response.text();
  const title = htmlMatchOne(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = htmlMatchOne(
    html,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  );
  const headings = [
    ...htmlMatchMany(html, /<h1[^>]*>([\s\S]*?)<\/h1>/gi),
    ...htmlMatchMany(html, /<h2[^>]*>([\s\S]*?)<\/h2>/gi),
  ].slice(0, 10);

  const images = htmlMatchMany(html, /<img[^>]+src=["']([^"']+)["'][^>]*>/gi)
    .slice(0, 12)
    .map((src) => {
      let assetUrl = src;
      try {
        assetUrl = new URL(src, url).toString();
      } catch {
        assetUrl = src;
      }
      return {
        assetUrl,
        alt: "",
      };
    });

  return {
    url,
    title,
    description,
    headings,
    text: stripHtmlToText(html).slice(0, 18_000),
    images,
  };
}

function buildBrandProfile(input: {
  companyId: string;
  companyName: string;
  urls: string[];
  pages: Array<{
    url: string;
    title: string;
    description: string;
    headings: string[];
    text: string;
    images: Array<{ assetUrl: string; alt: string }>;
  }>;
}): { profile: BrandProfile; assets: BrandAsset[] } {
  const joinedText = input.pages
    .flatMap((page) => [page.title, page.description, ...page.headings, page.text])
    .join(" ");

  const keywords = topKeywords(joinedText, 10);
  const tone = deriveTone(joinedText);
  const summary = input.pages
    .map((page) => page.description || page.headings[0] || page.title)
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");

  const profile: BrandProfile = {
    companyId: input.companyId,
    companyName: input.companyName,
    websites: input.urls,
    brandVoice: deriveVoice(joinedText),
    tone,
    pillars: keywords.slice(0, 4),
    audience: buildAudience(keywords),
    valueProps: keywords.slice(0, 4).map((keyword) => `Lead with ${keyword} outcomes.`),
    visualDirection: keywords.slice(0, 3).map((keyword) => `${keyword} motif`),
    summary: summary || `${input.companyName} profile extracted from public website content.`,
    scannedAt: new Date().toISOString(),
  };

  const assets: BrandAsset[] = input.pages
    .flatMap((page) =>
      page.images.map((image) => ({
        id: crypto.randomUUID(),
        companyId: input.companyId,
        sourceUrl: page.url,
        assetUrl: image.assetUrl,
        alt: image.alt,
        capturedAt: new Date().toISOString(),
      })),
    )
    .slice(0, 24);

  return { profile, assets };
}

export async function scanBrandDNA(input: {
  companyId: string;
  companyName?: string;
  urls: string[];
}): Promise<{ profile: BrandProfile; assetsAdded: number }> {
  if (!input.companyId) {
    throw new Error("companyId is required");
  }
  if (!Array.isArray(input.urls) || input.urls.length === 0) {
    throw new Error("urls[] is required");
  }

  const companies = await getCompanies();
  const company = companies.find((item) => item.id === input.companyId);
  const companyName = input.companyName || company?.name || "Company";

  const urls = [...new Set(input.urls.map((url) => url.trim()).filter(Boolean))].slice(0, 5);
  const pageResults = await Promise.all(
    urls.map(async (url) => {
      try {
        return await fetchPage(url);
      } catch {
        return null;
      }
    }),
  );
  const pages = pageResults.filter((page): page is NonNullable<typeof page> => Boolean(page));

  if (pages.length === 0) {
    throw new Error("No pages could be fetched from provided URLs");
  }

  const { profile, assets } = buildBrandProfile({
    companyId: input.companyId,
    companyName,
    urls,
    pages,
  });

  const state = await loadBrandOperatorState();
  state.brandProfiles[input.companyId] = profile;

  const existing = new Set(state.brandAssets.map((asset) => `${asset.companyId}|${asset.assetUrl}`));
  let assetsAdded = 0;
  for (const asset of assets) {
    const key = `${asset.companyId}|${asset.assetUrl}`;
    if (existing.has(key)) {
      continue;
    }
    state.brandAssets.push(asset);
    existing.add(key);
    assetsAdded += 1;
  }

  await saveBrandOperatorState(state);
  return { profile, assetsAdded };
}

export async function getBrandProfile(companyId: string): Promise<BrandProfile | null> {
  const state = await loadBrandOperatorState();
  return state.brandProfiles[companyId] ?? null;
}

export async function generateWeeklyContentPlan(input?: {
  companyIds?: string[];
}): Promise<{
  week: string;
  generated: number;
  byCompany: Array<{ companyId: string; companyName: string; count: number }>;
}> {
  const companies = await getCompanies();
  const targetIds = new Set((input?.companyIds ?? companies.map((company) => company.id)).filter(Boolean));
  const nextWeekStart = startOfNextWorkWeek();
  const currentWeek = weekKey(nextWeekStart);

  const state = await loadBrandOperatorState();

  state.weeklyContentRequirements = state.weeklyContentRequirements.filter(
    (item) => !(item.weekKey === currentWeek && targetIds.has(item.companyId)),
  );

  const byCompany: Array<{ companyId: string; companyName: string; count: number }> = [];
  let generated = 0;

  for (const company of companies) {
    if (!targetIds.has(company.id)) {
      continue;
    }

    const profile = state.brandProfiles[company.id];
    const rules = getRulesForCompany(company.name);
    let offset = 0;
    let companyCount = 0;

    for (const rule of rules) {
      for (let index = 0; index < rule.weeklyMin; index += 1) {
        // Keep pre-planned social/content work in next week's Mon-Fri window.
        const due = addBusinessDays(nextWeekStart, offset % 5);
        offset += 1;

        const pillar = profile?.pillars[index % Math.max(1, profile?.pillars.length ?? 1)] ?? "brand story";
        const tone = profile?.tone[0] ?? "clear";

        const requirement: WeeklyContentRequirement = {
          id: crypto.randomUUID(),
          weekKey: currentWeek,
          companyId: company.id,
          companyName: company.name,
          platform: rule.platform,
          status: "Idea",
          headline: `${company.name}: ${pillar} spotlight`,
          angle: `${tone} angle focused on ${pillar} value for this week.`,
          dueDate: due.toISOString(),
        };

        state.weeklyContentRequirements.push(requirement);
        generated += 1;
        companyCount += 1;
      }
    }

    byCompany.push({
      companyId: company.id,
      companyName: company.name,
      count: companyCount,
    });
  }

  await saveBrandOperatorState(state);
  return { week: currentWeek, generated, byCompany };
}

function findTitleProperty(properties: Record<string, { type: string }>): string | null {
  return Object.entries(properties).find(([, value]) => value.type === "title")?.[0] ?? null;
}

function findProperty(
  properties: Record<string, { type: string }>,
  opts: {
    type: string;
    nameIncludes?: string[];
  },
): string | null {
  for (const [name, value] of Object.entries(properties)) {
    if (value.type !== opts.type) {
      continue;
    }
    if (!opts.nameIncludes || opts.nameIncludes.some((term) => name.toLowerCase().includes(term))) {
      return name;
    }
  }
  return null;
}

function pickOption(
  property: { type: string; [key: string]: unknown } | undefined,
  preferred: string[],
): string | null {
  if (!property || (property.type !== "select" && property.type !== "status")) {
    return null;
  }
  const options =
    property.type === "select"
      ? ((property.select as { options?: Array<{ name?: string }> } | undefined)?.options ?? [])
      : ((property.status as { options?: Array<{ name?: string }> } | undefined)?.options ?? []);
  const names = options
    .map((option) => (typeof option?.name === "string" ? option.name : ""))
    .filter(Boolean);

  for (const candidate of preferred) {
    const match = names.find((name) => name.toLowerCase() === candidate.toLowerCase());
    if (match) {
      return match;
    }
  }
  return names[0] ?? null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function createNotionTask(
  notion: Client,
  tasksDbId: string,
  schema: Record<string, { type: string; [key: string]: unknown }>,
  item: WeeklyContentRequirement,
): Promise<string | null> {
  const titleKey = findTitleProperty(schema);
  if (!titleKey) {
    return null;
  }

  const properties: Record<string, unknown> = {
    [titleKey]: {
      title: [{ text: { content: `[${item.platform}] ${item.headline}` } }],
    },
  };

  const businessRel = findProperty(schema, { type: "relation", nameIncludes: ["business"] });
  if (businessRel && item.companyId && isUuid(item.companyId)) {
    properties[businessRel] = { relation: [{ id: item.companyId }] };
  }

  const dueDate = findProperty(schema, { type: "date", nameIncludes: ["due"] });
  if (dueDate) {
    properties[dueDate] = { date: { start: item.dueDate } };
  }

  const statusProp = findProperty(schema, { type: "status", nameIncludes: ["status"] });
  if (statusProp) {
    const statusName = pickOption(schema[statusProp], ["This Week", "Backlog", "Waiting"]);
    if (statusName) {
      properties[statusProp] = { status: { name: statusName } };
    }
  }

  const statusSelect = findProperty(schema, { type: "select", nameIncludes: ["status"] });
  if (statusSelect && !statusProp) {
    const statusName = pickOption(schema[statusSelect], ["This Week", "Backlog", "Waiting"]);
    if (statusName) {
      properties[statusSelect] = { select: { name: statusName } };
    }
  }

  const taskType = findProperty(schema, { type: "select", nameIncludes: ["task type", "type"] });
  if (taskType) {
    const taskTypeName = pickOption(schema[taskType], ["Content", "Marketing", "Ops", "General"]);
    if (taskTypeName) {
      properties[taskType] = { select: { name: taskTypeName } };
    }
  }
  const queueLabel = findProperty(schema, { type: "select", nameIncludes: ["queue label", "queue", "label"] });
  if (queueLabel) {
    const queueName = pickOption(schema[queueLabel], ["Founder To-Do", "Agent Inbox"]);
    if (queueName) {
      properties[queueLabel] = { select: { name: queueName } };
    }
  }

  const priority = findProperty(schema, { type: "select", nameIncludes: ["priority"] });
  if (priority) {
    const priorityName = pickOption(schema[priority], ["High", "Normal", "Medium", "Low"]);
    if (priorityName) {
      properties[priority] = { select: { name: priorityName } };
    }
  }

  const richText = findProperty(schema, { type: "rich_text" });
  if (richText) {
    properties[richText] = {
      rich_text: [{ type: "text", text: { content: item.angle } }],
    };
  }

  const created = await notion.pages.create({
    parent: { data_source_id: tasksDbId },
    properties: properties as NonNullable<Parameters<Client["pages"]["create"]>[0]["properties"]>,
  });

  return created.id;
}

async function createNotionContentRow(
  notion: Client,
  contentDbId: string,
  schema: Record<string, { type: string; [key: string]: unknown }>,
  item: WeeklyContentRequirement,
): Promise<string | null> {
  const titleKey = findTitleProperty(schema);
  if (!titleKey) {
    return null;
  }

  const properties: Record<string, unknown> = {
    [titleKey]: {
      title: [{ text: { content: item.headline } }],
    },
  };

  const businessRel = findProperty(schema, { type: "relation", nameIncludes: ["business"] });
  if (businessRel && item.companyId && isUuid(item.companyId)) {
    properties[businessRel] = { relation: [{ id: item.companyId }] };
  }

  const statusProp = findProperty(schema, { type: "status", nameIncludes: ["status"] });
  if (statusProp) {
    properties[statusProp] = { status: { name: "Idea" } };
  }

  const statusSelect = findProperty(schema, { type: "select", nameIncludes: ["status"] });
  if (statusSelect && !statusProp) {
    properties[statusSelect] = { select: { name: "Idea" } };
  }

  const created = await notion.pages.create({
    parent: { data_source_id: contentDbId },
    properties: properties as NonNullable<Parameters<Client["pages"]["create"]>[0]["properties"]>,
  });

  return created.id;
}

function hasLegalAdminKeywords(text: string): boolean {
  return /legal|admin|license|ein|tax|compliance|contract|policy/i.test(text);
}

export async function syncWeeklyPlanToNotion(): Promise<{
  syncedTasks: number;
  syncedContentRows: number;
  followUpTasksCreated: number;
  skipped: string[];
}> {
  const skipped: string[] = [];
  const token = process.env.NOTION_TOKEN;
  const tasksDbId = process.env.NOTION_DATABASE_TASKS_ID;
  const contentDbId = process.env.NOTION_DATABASE_CONTENT_ID;

  if (!token || !tasksDbId) {
    return {
      syncedTasks: 0,
      syncedContentRows: 0,
      followUpTasksCreated: 0,
      skipped: ["Notion task sync skipped: missing NOTION_TOKEN or NOTION_DATABASE_TASKS_ID"],
    };
  }

  const state = await loadBrandOperatorState();
  const currentWeek = weekKey(new Date());
  const pending = state.weeklyContentRequirements.filter(
    (item) => item.weekKey === currentWeek && !item.notionTaskPageId,
  );

  const notion = new Client({ auth: token });
  const tasksSchema = (
    await notion.dataSources.retrieve({ data_source_id: tasksDbId })
  ).properties as Record<string, { type: string; [key: string]: unknown }>;

  let contentSchema: Record<string, { type: string; [key: string]: unknown }> | null = null;
  if (contentDbId) {
    try {
      contentSchema = (
        await notion.dataSources.retrieve({ data_source_id: contentDbId })
      ).properties as Record<string, { type: string; [key: string]: unknown }>;
    } catch {
      skipped.push("Content Management sync skipped: invalid NOTION_DATABASE_CONTENT_ID");
    }
  } else {
    skipped.push("Content Management sync skipped: NOTION_DATABASE_CONTENT_ID is not set");
  }

  let syncedTasks = 0;
  let syncedContentRows = 0;

  for (const item of pending) {
    const taskPageId = await createNotionTask(notion, tasksDbId, tasksSchema, item);
    if (taskPageId) {
      item.notionTaskPageId = taskPageId;
      syncedTasks += 1;
    }

    if (contentDbId && contentSchema) {
      const contentPageId = await createNotionContentRow(
        notion,
        contentDbId,
        contentSchema,
        item,
      );
      if (contentPageId) {
        item.notionContentPageId = contentPageId;
        syncedContentRows += 1;
      }
    }

    item.syncedAt = new Date().toISOString();
  }

  // Legal/admin guardrail: for missing due dates, create explicit critical follow-up tasks.
  let followUpTasksCreated = 0;
  const taskRows = await notion.dataSources.query({
    data_source_id: tasksDbId,
    page_size: 200,
  });
  for (const row of taskRows.results) {
    if (!("properties" in row)) {
      continue;
    }
    const properties = row.properties as Record<string, unknown>;
    const title = Object.values(properties).find((value) => {
      return (
        value &&
        typeof value === "object" &&
        (value as { type?: string }).type === "title"
      );
    }) as { title?: Array<{ plain_text?: string }> } | undefined;
    const titleText = title?.title?.map((item) => item.plain_text ?? "").join("") ?? "";

    const taskType = properties["Task Type"] as
      | { select?: { name?: string } }
      | undefined;
    const looksLegal =
      hasLegalAdminKeywords(titleText) ||
      hasLegalAdminKeywords(taskType?.select?.name ?? "");
    if (!looksLegal) {
      continue;
    }

    const dueDate =
      (properties["Due Date"] as { date?: { start?: string } } | undefined)?.date?.start;
    if (dueDate) {
      continue;
    }

    const followUpTitle = `Set due date: ${titleText || "Legal/Admin task"}`;
    const exists = state.weeklyContentRequirements.some(
      (item) => item.headline.toLowerCase() === followUpTitle.toLowerCase(),
    );
    if (exists) {
      continue;
    }

    const followUp: WeeklyContentRequirement = {
      id: crypto.randomUUID(),
      weekKey: currentWeek,
      companyId: "",
      companyName: "Operations",
      platform: "Ops",
      status: "Idea",
      headline: followUpTitle,
      angle: "Critical follow-up: assign due date and owner for legal/admin risk item.",
      dueDate: new Date().toISOString(),
    };

    const followUpPageId = await createNotionTask(notion, tasksDbId, tasksSchema, followUp);
    if (followUpPageId) {
      followUp.notionTaskPageId = followUpPageId;
      followUp.syncedAt = new Date().toISOString();
      state.weeklyContentRequirements.push(followUp);
      followUpTasksCreated += 1;
    }
  }

  await saveBrandOperatorState(state);

  return {
    syncedTasks,
    syncedContentRows,
    followUpTasksCreated,
    skipped,
  };
}

function buildAttentionEvent(partial: Omit<AttentionEvent, "id" | "createdAt">): AttentionEvent {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

export async function getAttentionQueue(): Promise<{
  week: string;
  events: AttentionEvent[];
}> {
  const state = await loadBrandOperatorState();
  const companies = await getCompanies();
  const currentWeek = weekKey(new Date());

  const events: AttentionEvent[] = [];

  for (const company of companies) {
    const required = getRulesForCompany(company.name).reduce(
      (sum, rule) => sum + rule.weeklyMin,
      0,
    );
    const planned = state.weeklyContentRequirements.filter(
      (item) => item.weekKey === currentWeek && item.companyId === company.id,
    ).length;

    if (planned < required) {
      events.push(
        buildAttentionEvent({
          type: "missing_weekly_commitments",
          severity: "high",
          companyId: company.id,
          companyName: company.name,
          title: `${company.name}: weekly coverage gap`,
          detail: `${planned}/${required} required content items planned for ${currentWeek}.`,
          action: "Run weekly generator and sync to Notion.",
        }),
      );
    }
  }

  const token = process.env.NOTION_TOKEN;
  const tasksDbId = process.env.NOTION_DATABASE_TASKS_ID;
  if (token && tasksDbId) {
    const notion = new Client({ auth: token });
    const tasks = await notion.dataSources.query({
      data_source_id: tasksDbId,
      page_size: 200,
    });

    const todayKey = parseDateKey(new Date().toISOString());
    const todayDate = new Date();
    const thirtyDaysLater = new Date(todayDate.getTime() + 30 * 86_400_000);

    for (const row of tasks.results) {
      if (!("properties" in row)) {
        continue;
      }
      const properties = row.properties as Record<string, unknown>;
      const titleProp = Object.values(properties).find((value) => {
        return (
          value &&
          typeof value === "object" &&
          (value as { type?: string }).type === "title"
        );
      }) as { title?: Array<{ plain_text?: string }> } | undefined;
      const title = titleProp?.title?.map((item) => item.plain_text ?? "").join("") || "Task";

      const statusName =
        (properties["Status"] as { select?: { name?: string }; status?: { name?: string } })
          ?.select?.name ??
        (properties["Status"] as { select?: { name?: string }; status?: { name?: string } })
          ?.status?.name ??
        "";
      const isDone = /done|complete|posted/i.test(statusName);
      if (isDone) {
        continue;
      }

      const dueDate =
        (properties["Due Date"] as { date?: { start?: string } } | undefined)?.date?.start ?? "";

      if (dueDate) {
        const dueKey = parseDateKey(dueDate);
        if (dueKey === todayKey) {
          events.push(
            buildAttentionEvent({
              type: "due_today",
              severity: "medium",
              title: `Due today: ${title}`,
              detail: `Task due on ${dueDate.slice(0, 10)}.`,
              action: "Schedule immediate completion block.",
            }),
          );
        } else if (dueKey < todayKey) {
          events.push(
            buildAttentionEvent({
              type: "overdue",
              severity: "high",
              title: `Overdue: ${title}`,
              detail: `Task due on ${dueDate.slice(0, 10)} and still open.`,
              action: "Reprioritize and complete or re-date with owner note.",
            }),
          );
        }
      }

      const taskType =
        (properties["Task Type"] as { select?: { name?: string } } | undefined)?.select?.name ??
        "";
      const legalAdmin = hasLegalAdminKeywords(`${taskType} ${title}`);
      if (!legalAdmin) {
        continue;
      }

      if (!dueDate) {
        events.push(
          buildAttentionEvent({
            type: "legal_admin_risk",
            severity: "critical",
            title: `Legal/Admin risk: missing due date`,
            detail: `${title} has no due date.`,
            action: "Assign due date and owner today.",
          }),
        );
        continue;
      }

      const due = new Date(dueDate);
      if (due <= thirtyDaysLater && due >= todayDate) {
        events.push(
          buildAttentionEvent({
            type: "legal_admin_risk",
            severity: "high",
            title: `Legal/Admin due within 30 days`,
            detail: `${title} due on ${dueDate.slice(0, 10)}.`,
            action: "Confirm readiness and escalation path this week.",
          }),
        );
      }
    }
  }

  events.sort((a, b) => {
    const rank = { critical: 0, high: 1, medium: 2, low: 3 };
    return rank[a.severity] - rank[b.severity];
  });

  state.attentionEvents = events;
  await saveBrandOperatorState(state);

  return { week: currentWeek, events };
}

export async function getWeeklyCoverageSummary(): Promise<{
  week: string;
  coverage: Array<{
    companyId: string;
    companyName: string;
    required: number;
    planned: number;
    gap: number;
  }>;
}> {
  const companies = await getCompanies();
  const state = await loadBrandOperatorState();
  const currentWeek = weekKey(new Date());

  const coverage = companies.map((company) => {
    const required = getRulesForCompany(company.name).reduce(
      (sum, rule) => sum + rule.weeklyMin,
      0,
    );
    const planned = state.weeklyContentRequirements.filter(
      (item) => item.weekKey === currentWeek && item.companyId === company.id,
    ).length;
    return {
      companyId: company.id,
      companyName: company.name,
      required,
      planned,
      gap: Math.max(0, required - planned),
    };
  });

  return { week: currentWeek, coverage };
}

export function getContentStatuses() {
  return CONTENT_STATUS;
}
