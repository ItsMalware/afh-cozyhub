// @ts-nocheck
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Client } from "@notionhq/client";

type NewsCategory = "threat" | "ai" | "agents";

export type NewsSignalItem = {
  id: string;
  category: NewsCategory;
  source: string;
  title: string;
  url: string;
  summary: string;
  fullSummary: string;
  isTruncated: boolean;
  whyItMatters: string;
  publishedAt: string;
  relevanceScore: number;
};

type NewsCache = {
  lastUpdated: string;
  items: NewsSignalItem[];
  health: SourceHealth[];
};

export type SourceHealth = {
  source: string;
  status: "ok" | "error";
  latencyMs: number;
  message?: string;
  lastChecked: string;
};

const DATA_DIR = join(process.cwd(), "data");
const CACHE_FILE = join(DATA_DIR, "news-signals-cache.json");
const pollMinutesRaw = Number(process.env.NEWS_SIGNALS_POLL_MINUTES ?? "20");
const POLL_WINDOW_MS =
  (Number.isFinite(pollMinutesRaw) ? Math.max(5, Math.min(120, pollMinutesRaw)) : 20) *
  60 *
  1000;
const SUMMARY_CHAR_LIMIT = 800;
const SUMMARY_BULLET_LIMIT = 6;
const FULL_SUMMARY_CHAR_LIMIT = 4000;

type ConfigurableSource = {
  category: NewsCategory;
  source: string;
  url: string;
  type?: "rss" | "json";
  parser?: "cisa-kev" | "nvd" | "ransomwatch";
};

const BASE_SOURCES: ConfigurableSource[] = [
  {
    category: "threat",
    source: "CISA Advisories",
    url: "https://www.cisa.gov/cybersecurity-advisories/all.xml",
  },
  {
    category: "threat",
    source: "The DFIR Report",
    url: "https://thedfirreport.com/feed/",
  },
  {
    category: "threat",
    source: "Dark Web Informer",
    url: "https://darkwebinformer.com/rss/",
  },
  {
    category: "threat",
    source: "BleepingComputer",
    url: "https://www.bleepingcomputer.com/feed/",
  },
  {
    category: "threat",
    source: "The Hacker News",
    url: "https://feeds.feedburner.com/TheHackersNews",
  },
  {
    category: "threat",
    source: "Cisco Talos",
    url: "https://blog.talosintelligence.com/rss/",
  },
  {
    category: "threat",
    source: "Kaspersky Securelist",
    url: "https://securelist.com/feed/",
  },
  {
    category: "threat",
    source: "Kaspersky Securelist",
    url: "https://securelist.com/feed/",
  },
  {
    category: "threat",
    source: "Unit 42",
    url: "https://unit42.paloaltonetworks.com/feed/",
  },
  {
    category: "threat",
    source: "CISA KEV Catalog",
    url: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
    type: "json",
    parser: "cisa-kev",
  },
  {
    category: "threat",
    source: "Ransomwatch",
    url: "https://raw.githubusercontent.com/joshhighet/ransomwatch/main/posts.json",
    type: "json",
    parser: "ransomwatch",
  },
  {
    category: "threat",
    source: "NIST NVD Latest",
    url: "https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage=10",
    type: "json",
    parser: "nvd",
  },
  {
    category: "ai",
    source: "OpenAI News",
    url: "https://openai.com/news/rss.xml",
  },
  {
    category: "ai",
    source: "Google AI Blog",
    url: "https://blog.google/technology/ai/rss/",
  },
  {
    category: "ai",
    source: "Hugging Face Blog",
    url: "https://huggingface.co/blog/feed.xml",
  },
  {
    category: "ai",
    source: "Microsoft Azure AI Blog",
    url: "https://azure.microsoft.com/en-us/blog/tag/ai/feed/",
  },
  {
    category: "ai",
    source: "NVIDIA AI Blog",
    url: "https://blogs.nvidia.com/blog/category/ai/feed/",
  },
  {
    category: "ai",
    source: "Meta Engineering AI",
    url: "https://engineering.fb.com/tag/artificial-intelligence/feed/",
  },
  {
    category: "agents",
    source: "Model Context Protocol",
    url: "https://modelcontextprotocol.io/feed.xml",
  },
];

function buildSubstackSources(): ConfigurableSource[] {
  const raw = process.env.NEWS_SIGNALS_SUBSTACK_FEEDS_JSON?.trim();
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as
      | string[]
      | Array<{ url: string; source?: string; category?: NewsCategory }>;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => {
        if (typeof entry === "string") {
          const baseUrl = entry.trim();
          if (!baseUrl) return null;
          const normalized = baseUrl.endsWith("/feed")
            ? baseUrl
            : `${baseUrl.replace(/\/+$/, "")}/feed`;
          return {
            category: "agents" as NewsCategory,
            source: "Substack",
            url: normalized,
          };
        }

        const baseUrl = entry?.url?.trim();
        if (!baseUrl) return null;
        const normalized = baseUrl.endsWith("/feed")
          ? baseUrl
          : `${baseUrl.replace(/\/+$/, "")}/feed`;
        return {
          category: entry.category ?? "agents",
          source: entry.source?.trim() || "Substack",
          url: normalized,
        };
      })
      .filter((item): item is ConfigurableSource => Boolean(item));
  } catch {
    return [];
  }
}

function getSources(): ConfigurableSource[] {
  return [...BASE_SOURCES, ...buildSubstackSources()];
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function extractText(xmlChunk: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const matched = xmlChunk.match(regex)?.[1] ?? "";
  return matched
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtmlLikeMarkup(value: string): string {
  return value
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

function normalizeSummary(value: string): string {
  return stripHtmlLikeMarkup(decodeHtmlEntities(value))
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

function clampText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  const clamped = value.slice(0, maxChars);
  const lastBoundary = clamped.search(/[.!?][^.!?]*$/);
  if (lastBoundary > Math.floor(maxChars * 0.6)) {
    return clamped.slice(0, lastBoundary + 1).trim();
  }
  return `${clamped.trimEnd()}...`;
}

function buildSummaryPreview(value: string): { preview: string; isTruncated: boolean } {
  const normalized = normalizeSummary(value);
  if (!normalized) {
    return { preview: "Summary unavailable from source feed.", isTruncated: false };
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const bullets: string[] = [];
  let charBudget = 0;
  for (const sentence of sentences) {
    const line = `• ${sentence}`;
    const projected = charBudget + line.length + (bullets.length > 0 ? 1 : 0);
    if (projected > SUMMARY_CHAR_LIMIT || bullets.length >= SUMMARY_BULLET_LIMIT) {
      break;
    }
    bullets.push(line);
    charBudget = projected;
  }

  if (bullets.length > 0) {
    const preview = bullets.join("\n");
    return { preview, isTruncated: preview.length < normalized.length };
  }

  const preview = clampText(normalized, SUMMARY_CHAR_LIMIT);
  return { preview, isTruncated: preview.length < normalized.length };
}

function parseRssItems(xml: string): Array<{
  title: string;
  link: string;
  summary: string;
  publishedAt: string;
}> {
  const chunks = [
    ...xml.matchAll(/<item[\s\S]*?<\/item>/gi),
    ...xml.matchAll(/<entry[\s\S]*?<\/entry>/gi),
  ].map((match) => match[0]);

  return chunks
    .map((chunk) => {
      const title = extractText(chunk, "title");
      const summary =
        extractText(chunk, "description") ||
        extractText(chunk, "summary") ||
        extractText(chunk, "content");

      const link =
        extractText(chunk, "link") ||
        chunk.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] ||
        "";

      const publishedAt =
        extractText(chunk, "pubDate") ||
        extractText(chunk, "updated") ||
        extractText(chunk, "published") ||
        new Date().toISOString();

      return {
        title,
        link,
        summary,
        publishedAt,
      };
    })
    .filter((item) => item.title && item.link);
}

function scoreSignal(item: {
  category: NewsCategory;
  title: string;
  summary: string;
  publishedAt: string;
}): number {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  const categoryBoost =
    item.category === "threat" ? 30 : item.category === "ai" ? 20 : 15;

  const keywordBoost =
    [
      "critical",
      "cve",
      "ransomware",
      "zero-day",
      "release",
      "launch",
      "api",
      "agent",
      "mcp",
      "framework",
      "security",
    ].reduce((sum, keyword) => sum + (text.includes(keyword) ? 5 : 0), 0);

  const hoursOld = Math.max(
    0,
    (Date.now() - new Date(item.publishedAt).getTime()) / (1000 * 60 * 60),
  );
  const freshness = Math.max(0, 30 - Math.round(hoursOld));

  return categoryBoost + keywordBoost + freshness;
}

function whyItMatters(item: {
  category: NewsCategory;
  title: string;
  summary: string;
}): string {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  const titleSnippet = item.title.replace(/\s+/g, " ").trim();

  const hasAny = (keywords: string[]): boolean =>
    keywords.some((keyword) => text.includes(keyword));

  if (item.category === "threat") {
    if (hasAny(["cve", "vulnerability", "zero-day", "exploit"])) {
      return `Potential exploit path identified in "${titleSnippet}". Prioritize patch posture and exposure checks for affected services.`;
    }
    if (hasAny(["ransomware", "data leak", "breach", "stolen", "leaked"])) {
      return `Possible impact to data integrity or availability from "${titleSnippet}". Validate backups, access controls, and incident playbooks now.`;
    }
    if (hasAny(["phishing", "malspam", "social engineering", "credential"])) {
      return `User-targeted attack patterns are highlighted in "${titleSnippet}". Reinforce identity defenses and user alerting to reduce successful compromise.`;
    }
    return `Security posture may need review based on "${titleSnippet}". Check controls, detection coverage, and response readiness.`;
  }

  if (item.category === "ai") {
    if (hasAny(["release", "launch", "ga", "preview", "model"])) {
      return `New AI capability signal in "${titleSnippet}" may change feature scope, tooling choices, or delivery timeline this sprint.`;
    }
    if (hasAny(["pricing", "cost", "token", "billing"])) {
      return `Cost or pricing signal from "${titleSnippet}" may affect margin assumptions. Re-check budget guardrails and usage strategy.`;
    }
    if (hasAny(["policy", "safety", "compliance", "governance"])) {
      return `Governance-related AI update in "${titleSnippet}" may require policy and workflow adjustments before rollout.`;
    }
    return `AI platform movement in "${titleSnippet}" may influence roadmap priorities and integration sequencing this week.`;
  }

  if (hasAny(["mcp", "protocol", "sdk", "framework", "agent"])) {
    return `Agent-stack update in "${titleSnippet}" may affect orchestration compatibility, tool contracts, or team automation design.`;
  }
  if (hasAny(["benchmark", "evaluation", "latency", "reliability"])) {
    return `Execution-quality signal in "${titleSnippet}" may change how we tune reliability, speed, and cost for agent workflows.`;
  }
  return `Ecosystem shift from "${titleSnippet}" may require updates to agent architecture, integrations, or operating playbooks.`;
}

function fallbackItems(): NewsSignalItem[] {
  const now = new Date().toISOString();
  return [
    {
      id: randomUUID(),
      category: "threat",
      source: "Fallback Threat Feed",
      title: "Threat feed temporarily unavailable",
      url: "https://www.cisa.gov/news-events/cybersecurity-advisories",
      summary: "Upstream source did not respond; using fallback pointer.",
      fullSummary: "Upstream source did not respond; using fallback pointer.",
      isTruncated: false,
      whyItMatters:
        "Maintain visibility and run a manual review until automated feed resumes.",
      publishedAt: now,
      relevanceScore: 10,
    },
    {
      id: randomUUID(),
      category: "ai",
      source: "Fallback AI Feed",
      title: "AI updates feed temporarily unavailable",
      url: "https://openai.com/news/",
      summary: "Upstream source did not respond; using fallback pointer.",
      fullSummary: "Upstream source did not respond; using fallback pointer.",
      isTruncated: false,
      whyItMatters:
        "AI platform updates can affect roadmap and integration assumptions.",
      publishedAt: now,
      relevanceScore: 10,
    },
    {
      id: randomUUID(),
      category: "agents",
      source: "Fallback Agents Feed",
      title: "Agent ecosystem feed temporarily unavailable",
      url: "https://modelcontextprotocol.io/",
      summary: "Upstream source did not respond; using fallback pointer.",
      fullSummary: "Upstream source did not respond; using fallback pointer.",
      isTruncated: false,
      whyItMatters: "Agent framework changes may affect orchestration and tooling compatibility.",
      publishedAt: now,
      relevanceScore: 10,
    },
  ];
}

async function loadCache(): Promise<NewsCache | null> {
  try {
    const raw = await readFile(CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw) as NewsCache;
    return parsed;
  } catch {
    return null;
  }
}

async function saveCache(cache: NewsCache): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
}

async function fetchSource(source: ConfigurableSource): Promise<NewsSignalItem[]> {
  let retries = 0;
  const maxRetries = 2;
  let response: Response | null = null;
  let lastError: Error | null = null;

  while (retries <= maxRetries) {
    try {
      response = await fetch(source.url, {
        method: "GET",
        headers: { "User-Agent": "AFH-NewsSignals/1.0" },
        signal: AbortSignal.timeout(12_000),
      });
      if (response.ok) break;
      throw new Error(`Status ${response.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      retries++;
      if (retries <= maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, retries - 1)));
      }
    }
  }

  if (!response || !response.ok) {
    throw lastError || new Error(`Source fetch failed (${source.source})`);
  }

  const text = await response.text();

  let rawItems: Array<{
    title: string;
    link: string;
    summary: string;
    publishedAt: string;
  }> = [];

  if (source.type === "json") {
    try {
      const json = JSON.parse(text);
      if (source.parser === "cisa-kev") {
        rawItems = (json.vulnerabilities || []).slice(0, 10).map((v: any) => ({
          title: `CVE-${v.cveID}: ${v.vulnerabilityName}`,
          link: `https://nvd.nist.gov/vuln/detail/${v.cveID}`,
          summary: v.shortDescription,
          publishedAt: v.dateAdded || new Date().toISOString(),
        }));
      } else if (source.parser === "ransomwatch") {
        rawItems = (Array.isArray(json) ? json : []).slice(0, 10).map((p: any) => ({
          title: `Ransomwatch: ${p.group_name} listed ${p.post_title}`,
          link: "https://ransomwatch.telemetry.sh",
          summary: `Group ${p.group_name} published a new entry.`,
          publishedAt: p.discovered || new Date().toISOString(),
        }));
      } else if (source.parser === "nvd") {
        rawItems = (json.vulnerabilities || []).slice(0, 10).map((wrapper: any) => {
          const v = wrapper.cve;
          return {
            title: v.id,
            link: `https://nvd.nist.gov/vuln/detail/${v.id}`,
            summary: v.descriptions?.[0]?.value || "No description provided.",
            publishedAt: v.published || new Date().toISOString(),
          };
        });
      }
    } catch (e) {
      throw new Error(`JSON parse failed for ${source.source}`);
    }
  } else {
    rawItems = parseRssItems(text).slice(0, 10);
  }

  return rawItems.map((item) => {
    const fullSummary = clampText(
      normalizeSummary(item.summary || item.title),
      FULL_SUMMARY_CHAR_LIMIT,
    );
    const summaryView = buildSummaryPreview(fullSummary);
    const score = scoreSignal({
      category: source.category,
      title: item.title,
      summary: fullSummary,
      publishedAt: item.publishedAt,
    });
    return {
      id: randomUUID(),
      category: source.category,
      source: source.source,
      title: item.title,
      url: item.link,
      summary: summaryView.preview,
      fullSummary,
      isTruncated: summaryView.isTruncated,
      whyItMatters: whyItMatters({
        category: source.category,
        title: item.title,
        summary: fullSummary,
      }),
      publishedAt: item.publishedAt,
      relevanceScore: score,
    };
  });
}

function dedupeAndSort(items: NewsSignalItem[]): NewsSignalItem[] {
  const deduped = new Map<string, NewsSignalItem>();

  for (const item of items) {
    const key = hash(`${item.url}|${item.title.toLowerCase()}`);
    const existing = deduped.get(key);
    if (!existing || item.relevanceScore > existing.relevanceScore) {
      deduped.set(key, item);
    }
  }

  const sorted = [...deduped.values()].sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  const hasCategory = new Set(sorted.map((item) => item.category));
  for (const fallback of fallbackItems()) {
    if (!hasCategory.has(fallback.category)) {
      sorted.push(fallback);
    }
  }

  return sorted;
}

export async function getNewsSignals(forceRefresh = false): Promise<NewsCache> {
  const cached = await loadCache();
  if (
    !forceRefresh &&
    cached &&
    Date.now() - new Date(cached.lastUpdated).getTime() < POLL_WINDOW_MS
  ) {
    return {
      ...cached,
      items: cached.items.map((item) => ({
        ...item,
        whyItMatters: whyItMatters({
          category: item.category,
          title: item.title,
          summary: item.fullSummary || item.summary,
        }),
      })),
    };
  }

  const sources = getSources();
  const responses = await Promise.all(
    sources.map(async (source) => {
      const start = Date.now();
      try {
        const items = await fetchSource(source);
        return { source, items, status: "ok" as const, latencyMs: Date.now() - start };
      } catch (e) {
        return {
          source,
          items: [],
          status: "error" as const,
          latencyMs: Date.now() - start,
          message: e instanceof Error ? e.message : "Unknown error",
        };
      }
    })
  );

  const items = responses.flatMap((r) => r.items);
  const health: SourceHealth[] = responses.map((r) => ({
    source: r.source.source,
    status: r.status,
    latencyMs: r.latencyMs,
    message: r.message,
    lastChecked: new Date().toISOString(),
  }));

  const merged = dedupeAndSort(items);

  const nextCache: NewsCache = {
    lastUpdated: new Date().toISOString(),
    items: merged,
    health,
  };

  await saveCache(nextCache);
  return nextCache;
}

function findTitleKey(properties: Record<string, { type: string }>): string | null {
  return Object.entries(properties).find(([, value]) => value.type === "title")?.[0] ?? null;
}

function findProperty(
  properties: Record<string, { type: string }>,
  type: string,
  matchName: string,
): string | null {
  return (
    Object.entries(properties).find(
      ([name, value]) =>
        value.type === type && name.toLowerCase().includes(matchName.toLowerCase()),
    )?.[0] ?? null
  );
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

export async function saveSignalToNotion(input: {
  itemId: string;
}): Promise<{ taskPageId: string; title: string }> {
  const token = process.env.NOTION_TOKEN;
  const tasksDbId = process.env.NOTION_DATABASE_TASKS_ID;
  if (!token || !tasksDbId) {
    throw new Error("Notion task database is not configured");
  }

  const feed = await getNewsSignals(false);
  const item = feed.items.find((signal) => signal.id === input.itemId);
  if (!item) {
    throw new Error("Feed item not found in cache");
  }

  const notion = new Client({ auth: token });
  const schema = (
    await notion.dataSources.retrieve({ data_source_id: tasksDbId })
  ).properties as Record<string, { type: string;[key: string]: unknown }>;

  const titleKey = findTitleKey(schema);
  if (!titleKey) {
    throw new Error("Task database has no title property");
  }

  const properties: Record<string, unknown> = {
    [titleKey]: {
      title: [{ text: { content: `[Signal][${item.category.toUpperCase()}] ${item.title}` } }],
    },
  };

  const status = findProperty(schema, "status", "status");
  if (status) {
    const statusName = pickOption(schema[status], ["This Week", "Backlog", "Waiting"]);
    if (statusName) {
      properties[status] = { status: { name: statusName } };
    }
  }
  const statusSelect = findProperty(schema, "select", "status");
  if (!status && statusSelect) {
    const statusName = pickOption(schema[statusSelect], ["This Week", "Backlog", "Waiting"]);
    if (statusName) {
      properties[statusSelect] = { select: { name: statusName } };
    }
  }

  const dueDate = findProperty(schema, "date", "due");
  if (dueDate) {
    properties[dueDate] = { date: { start: new Date().toISOString() } };
  }

  const queueLabel = findProperty(schema, "select", "queue");
  if (queueLabel) {
    const queueName = pickOption(schema[queueLabel], ["Founder To-Do", "Agent Inbox"]);
    if (queueName) {
      properties[queueLabel] = { select: { name: queueName } };
    }
  }

  const taskType = findProperty(schema, "select", "task type");
  if (taskType) {
    const taskTypeName = pickOption(schema[taskType], ["Ops", "General", "Content"]);
    if (taskTypeName) {
      properties[taskType] = { select: { name: taskTypeName } };
    }
  }

  const priority = findProperty(schema, "select", "priority");
  if (priority) {
    const priorityName = pickOption(schema[priority], ["High", "Normal", "Medium", "Low"]);
    if (priorityName) {
      properties[priority] = { select: { name: priorityName } };
    }
  }

  const richText = Object.entries(schema).find(([, value]) => value.type === "rich_text")?.[0];
  if (richText) {
    properties[richText] = {
      rich_text: [
        {
          type: "text",
          text: {
            content: `${item.fullSummary || item.summary}\n\nWhy it matters: ${item.whyItMatters}\n${item.url}`,
          },
        },
      ],
    };
  }

  const created = await notion.pages.create({
    parent: { data_source_id: tasksDbId },
    properties:
      properties as NonNullable<Parameters<Client["pages"]["create"]>[0]["properties"]>,
  });

  return {
    taskPageId: created.id,
    title: item.title,
  };
}
