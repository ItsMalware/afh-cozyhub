"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CozyIcon } from "@/components/cozy-icon";
import { ClockIcon } from "@/components/clock-icon";
import {
  LayoutDashboard,
  Target,
  Bot,
  Newspaper,
  Inbox,
  Coffee,
  AlertCircle,
  Activity,
  Palette,
} from "lucide-react";

import { DashboardPayload, FocusTask, PaletteColor } from "@/lib/types";

type Screen = "dashboard" | "branding" | "focus" | "agents" | "news" | "notifications";
type OperatorModule = "scanner" | "assets" | "planner" | "sync" | "attention";

type BriefState = {
  loading: boolean;
  error: string;
  text: string;
  source: string;
  fetchedAt: string;
};

type BrandProfileView = {
  companyId: string;
  companyName: string;
  brandVoice: string;
  tone: string[];
  pillars: string[];
  audience: string;
  summary: string;
  scannedAt: string;
};

type AttentionItem = {
  id: string;
  type: "due_today" | "overdue" | "missing_weekly_commitments" | "legal_admin_risk";
  severity: "low" | "medium" | "high" | "critical";
  companyName?: string;
  title: string;
  detail: string;
  action: string;
};

type CoverageItem = {
  companyId: string;
  companyName: string;
  required: number;
  planned: number;
  gap: number;
};

type NewsSignal = {
  id: string;
  category: "threat" | "ai" | "agents";
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

type SourceHealth = {
  source: string;
  status: "ok" | "error";
  latencyMs: number;
  message?: string;
  lastChecked: string;
};

type ChatUiMessage = {
  role: "user" | "agent";
  text: string;
};

type RouterRun = {
  runId: string;
  connector: "codex" | "antigravity" | "prime";
  status: "dispatched" | "waiting" | "failed" | "completed";
  createdAt: string;
  error?: string;
};

type BreakLogEntry = {
  startedAt: string;
  durationMinutes: number;
  sessionId?: string;
};

type WakeAlarmSettings = {
  enabled: boolean;
  time: string;
  monthlyEarningsUsd: number;
  lastTriggeredDate: string;
};

type WeatherSnapshot = {
  city: string;
  timezone: string;
  temperatureC: number;
  condition: string;
  fetchedAt: string;
};

type ProductivitySlice = {
  task: "Focus" | "Meetings" | "Breaks" | "Others";
  percentage: number;
  ringClass: string;
};

type BrandingSnapshot = {
  id: string;
  companyId: string;
  companyName: string;
  weekKey: string;
  capturedAt: string;
  funnel: {
    awareness: number;
    consideration: number;
    conversion: number;
    loyalty: number;
  };
  moments: {
    strength: number;
    momentum: number;
    notes: string;
  };
  channelMix: Record<string, number>;
  sourceRefs: string[];
};

type BrandingInsight = {
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

type BrandingPrediction = {
  id: string;
  companyId: string;
  generatedAt: string;
  windowDays: 60;
  horizonDays: 7;
  direction: "up" | "down" | "flat";
  confidence: number;
  rationale: string;
};

type BrandingSummaryPayload = {
  latestSnapshot: BrandingSnapshot | null;
  latestInsight: BrandingInsight | null;
  latestPrediction: BrandingPrediction | null;
};

type SpecialAgent = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  icon: string;
};

const COLOR_CLASS: Record<PaletteColor, string> = {
  pink: "var(--pink)",
  sage: "var(--sage)",
  teal: "var(--teal)",
  sand: "var(--sand)",
};

const FILL_CLASS: Record<PaletteColor, string> = {
  pink: "fill-pink",
  sage: "fill-sage",
  teal: "fill-teal",
  sand: "fill-sand",
};

const BALANCE_PCT_COLOR: Record<PaletteColor, string> = {
  pink: "#a84b62",
  sage: "#47674e",
  teal: "#3a4c50",
  sand: "#4a5759",
};

const BRIEF_MARKDOWN_ALLOWED_ELEMENTS = [
  "p",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "a",
  "h1",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "code",
] as const;

function formatSyncLabel(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "0 min";
  }
  return `${Math.round(minutes)} min`;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "0%";
  }
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function formatBehindGap(minutes: number): string {
  return `${Math.abs(Math.round(minutes))} min behind target`;
}

function formatClockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatClockMeta(timestamp: number): string {
  const date = new Date(timestamp);
  const dateLabel = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const zoneToken =
    date
      .toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })
      .split(" ")
      .pop() ?? "";
  return zoneToken ? `${dateLabel} · ${zoneToken}` : dateLabel;
}

function weekOfYear(date: Date): number {
  const firstDay = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const diff = date.getTime() - firstDay.getTime();
  const days = Math.floor(diff / 86_400_000);
  return Math.floor(days / 7);
}

function formatFocusedHours(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "0h";
  }
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours}h`;
}

function formatTemperature(temperatureC: number, unit: "C" | "F"): string {
  if (unit === "F") {
    return `${Math.round((temperatureC * 9) / 5 + 32)}°F`;
  }
  return `${Math.round(temperatureC)}°C`;
}

function sanitizeUiText(value: string): string {
  return value
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizePercentages(values: number[]): number[] {
  const sum = values.reduce((acc, value) => acc + value, 0);
  if (sum <= 0) {
    return values.map(() => 0);
  }

  const raw = values.map((value) => (value / sum) * 100);
  const floors = raw.map((value) => Math.floor(value));
  let remaining = 100 - floors.reduce((acc, value) => acc + value, 0);

  const byRemainder = raw
    .map((value, index) => ({ index, remainder: value - floors[index] }))
    .sort((a, b) => b.remainder - a.remainder);

  for (let i = 0; i < byRemainder.length && remaining > 0; i += 1) {
    floors[byRemainder[i].index] += 1;
    remaining -= 1;
  }

  return floors;
}

function buildProductivitySlices(queue: FocusTask[]): ProductivitySlice[] {
  const buckets = {
    Focus: 0,
    Meetings: 0,
    Breaks: 0,
    Others: 0,
  };

  for (const task of queue) {
    const source = `${task.category} ${task.title}`.toLowerCase();
    if (/meeting|sync|call|standup|1:1/.test(source)) {
      buckets.Meetings += task.plannedMinutes;
      continue;
    }
    if (/break|rest|lunch|pause/.test(source)) {
      buckets.Breaks += task.plannedMinutes;
      continue;
    }
    if (/focus|build|code|dev|execute|ship/.test(source)) {
      buckets.Focus += task.plannedMinutes;
      continue;
    }
    buckets.Others += task.plannedMinutes;
  }

  const percentages = normalizePercentages([
    buckets.Focus,
    buckets.Meetings,
    buckets.Breaks,
    buckets.Others,
  ]);

  return [
    { task: "Focus", percentage: percentages[0], ringClass: "progress-ring-focus" },
    { task: "Meetings", percentage: percentages[1], ringClass: "progress-ring-meetings" },
    { task: "Breaks", percentage: percentages[2], ringClass: "progress-ring-breaks" },
    { task: "Others", percentage: percentages[3], ringClass: "progress-ring-others" },
  ];
}

function toClock(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const m = Math.floor(clamped / 60)
    .toString()
    .padStart(2, "0");
  const s = (clamped % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function routerConnectorLabel(connector: RouterRun["connector"]): string {
  if (connector === "codex") return "Codex Builder";
  if (connector === "antigravity") return "Automation Crew";
  return "Prime Delegator";
}

function buildWakeMessage(monthlyEarningsUsd: number): string {
  if (monthlyEarningsUsd >= 10_000) {
    return "You hit your $10k monthly goal. Cozy option: sleep in if your body needs it.";
  }
  return `Gentle wake-up nudge. Your $10k monthly goal is in progress ($${monthlyEarningsUsd.toLocaleString()}).`;
}

function resolvePrimaryTask(queue: FocusTask[]): FocusTask | undefined {
  return queue.find((task) => task.status === "NEXT") ?? queue.find((task) => task.status === "QUEUED");
}

function toDateOnlyKey(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

function isDueToday(task: FocusTask): boolean {
  if (!task.dueDate) {
    return false;
  }
  return toDateOnlyKey(task.dueDate) === toDateOnlyKey(new Date().toISOString());
}

function queueBadge(task: FocusTask): { label: string; className: string } {
  switch (task.status) {
    case "DONE":
      return { label: "Done", className: "chip chip-sage" };
    case "LIVE":
      return { label: "Live", className: "chip chip-teal" };
    case "NEXT":
      return { label: "Next up", className: "chip chip-pink" };
    default:
      return { label: "Queued", className: "chip chip-cream" };
  }
}

function severityChip(severity: AttentionItem["severity"]): string {
  if (severity === "critical") {
    return "chip chip-pink";
  }
  if (severity === "high") {
    return "chip chip-teal";
  }
  return "chip chip-cream";
}

function KawaiiAgentBubbleIcon({ size, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/agent-icons/prime-agent.jpeg"
      alt=""
      width={size ?? 64}
      height={size ?? 64}
      className={className}
      style={size ? { width: size, height: size } : undefined}
    />
  );
}

const SPECIAL_AGENTS: SpecialAgent[] = [
  {
    id: "dev-agent",
    name: "Dev Agent",
    description: "Builds dev teams, coordinates Codex + Antigravity execution, and enforces Notion ticket lifecycle rules.",
    prompt:
      "Run Dev Agent. Create the dev team needed, delegate to Codex/Antigravity as appropriate, set ticket status to In progress before work, and only close after work summary + Hours_cmmd_hub are written.",
    icon: "/agent-icons/agent-new-2.jpg",
  },
  {
    id: "content-agent",
    name: "Content Agent",
    description: "Plans weekly content across channels and drafts platform-ready ideas.",
    prompt: "Run Content Agent for this week. Give me channel-by-channel priorities and top 3 posts to produce first.",
    icon: "/agent-icons/agent-new-1.jpg",
  },
  {
    id: "ops-agent",
    name: "Ops Agent",
    description: "Balances workloads, schedules focus blocks, and surfaces blocked operations.",
    prompt: "Run Ops Agent and rebalance my next 5 days. Flag the highest-risk blocked items.",
    icon: "/agent-icons/agent-new-3.jpg",
  },
  {
    id: "research-agent",
    name: "Research Agent",
    description: "Scans threats, competitors, and market changes that need immediate action.",
    prompt: "Run Research Agent and summarize urgent market or threat signals I should act on this week.",
    icon: "/agent-icons/agent-new-4.jpg",
  },
  {
    id: "admin-agent",
    name: "Admin Agent",
    description: "Tracks legal/compliance tasks, renewals, and administrative due dates.",
    prompt: "Run Admin Agent and list legal/compliance actions due soon with owners and due dates.",
    icon: "/agent-icons/agent-admin.jpeg",
  },
];

export default function Home() {
  const weeklyGreetingOptions = useMemo(
    () => [
      "You got this, Yasmine.",
      "Steady progress beats pressure.",
      "Focus first. The rest follows.",
      "One clear move at a time.",
      "Calm execution wins the week.",
      "You are building momentum today.",
    ],
    [],
  );
  const [screen, setScreen] = useState<Screen>(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("hub_screen") as Screen | null;
      const validScreens: Screen[] = [
        "dashboard", "branding", "focus", "agents", "news", "notifications",
      ];
      if (saved && validScreens.includes(saved)) {
        return saved;
      }
    }
    return "dashboard";
  });
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [apiState, setApiState] = useState("");
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [startLoadingTaskId, setStartLoadingTaskId] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  const [outcomes, setOutcomes] = useState(() =>
    typeof window !== "undefined" ? (window.sessionStorage.getItem("hub_outcomes") ?? "") : ""
  );
  const [blockers, setBlockers] = useState(() =>
    typeof window !== "undefined" ? (window.sessionStorage.getItem("hub_blockers") ?? "") : ""
  );
  const [followUps, setFollowUps] = useState(() =>
    typeof window !== "undefined" ? (window.sessionStorage.getItem("hub_followUps") ?? "") : ""
  );

  const [brief, setBrief] = useState<BriefState>({
    loading: false,
    error: "",
    text: "",
    source: "",
    fetchedAt: "",
  });

  const [timerNow, setTimerNow] = useState(Date.now());
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [scanUrlsInput, setScanUrlsInput] = useState("");
  const [brandProfile, setBrandProfile] = useState<BrandProfileView | null>(null);
  const [brandScanLoading, setBrandScanLoading] = useState(false);
  const [brandMessage, setBrandMessage] = useState("");
  const [attentionLoading, setAttentionLoading] = useState(false);
  const [attentionError, setAttentionError] = useState("");
  const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([]);
  const [coverageItems, setCoverageItems] = useState<CoverageItem[]>([]);
  const [attentionWeek, setAttentionWeek] = useState("");
  const [brandingSummary, setBrandingSummary] = useState<BrandingSummaryPayload | null>(null);
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [brandingError, setBrandingError] = useState("");
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState("");
  const [newsItems, setNewsItems] = useState<NewsSignal[]>([]);
  const [newsFilter, setNewsFilter] = useState<"all" | "threat" | "ai" | "agents">("all");
  const [newsUpdatedAt, setNewsUpdatedAt] = useState("");
  const [newsHealth, setNewsHealth] = useState<SourceHealth[]>([]);
  const [newsSaveLoadingId, setNewsSaveLoadingId] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [temperatureUnit, setTemperatureUnit] = useState<"C" | "F">("F");
  const [expandedNewsIds, setExpandedNewsIds] = useState<string[]>([]);

  const [chatMessages, setChatMessages] = useState<ChatUiMessage[]>([]);
  const [currentChatInput, setCurrentChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedSpecialAgent, setSelectedSpecialAgent] = useState<SpecialAgent | null>(null);
  const [operatorModule, setOperatorModule] = useState<OperatorModule>("scanner");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (screen === "agents" || chatOpen) {
      scrollToBottom();
    }
  }, [chatLoading, chatMessages, screen, chatOpen]);

  // Persist active screen tab across refreshes
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("hub_screen", screen);
    }
  }, [screen]);

  // Persist in-progress session fields across refreshes
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("hub_outcomes", outcomes);
      window.sessionStorage.setItem("hub_blockers", blockers);
      window.sessionStorage.setItem("hub_followUps", followUps);
    }
  }, [outcomes, blockers, followUps]);

  useEffect(() => {
    let cancelled = false;

    const loadChatHistory = async () => {
      try {
        const response = await fetch("/api/chat", {
          method: "GET",
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          messages?: Array<{ role?: string; text?: string }>;
        };
        const history = (payload.messages ?? [])
          .map((entry): ChatUiMessage | null => {
            const role = entry.role === "user" ? "user" : entry.role === "agent" ? "agent" : null;
            const text = typeof entry.text === "string" ? entry.text.trim() : "";
            if (!role || !text) {
              return null;
            }
            return { role, text };
          })
          .filter((entry): entry is ChatUiMessage => Boolean(entry));

        if (cancelled || history.length === 0) {
          return;
        }

        setChatMessages((prev) => (prev.length > 0 ? prev : history));
      } catch {
        // Non-fatal: keep in-memory chat only if history fetch fails.
      }
    };

    void loadChatHistory();
    return () => {
      cancelled = true;
    };
  }, []);

  const sendChatMessage = useCallback(async (userMsg: string) => {
    const trimmed = userMsg.trim();
    if (!trimmed) {
      return;
    }

    setChatMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setChatLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const raw = await res.text();
      let data: { reply?: string; error?: string; source?: string } = {};
      try {
        data = raw ? (JSON.parse(raw) as { reply?: string; error?: string; source?: string }) : {};
      } catch {
        data = {};
      }
      if (!res.ok) {
        throw new Error(data.error ?? data.reply ?? `Unable to get agent response (${res.status})`);
      }
      const sourceLabel = data.source ? `\n\n[Source: ${data.source}]` : "";
      setChatMessages((prev) => [
        ...prev,
        { role: "agent", text: `${data.reply || "I received your message."}${sourceLabel}` },
      ]);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Agent unavailable right now.";
      setChatMessages((prev) => [...prev, { role: "agent", text: `Agent issue: ${detail}` }]);
    } finally {
      setChatLoading(false);
    }
  }, []);

  const handleSendMessage = useCallback(async () => {
    if (!currentChatInput.trim() || chatLoading) return;
    const userMsg = currentChatInput.trim();
    setCurrentChatInput("");
    await sendChatMessage(userMsg);
  }, [chatLoading, currentChatInput, sendChatMessage]);

  const runSpecialAgent = useCallback(
    async (agent: SpecialAgent) => {
      if (chatLoading) {
        return;
      }
      await sendChatMessage(agent.prompt);
    },
    [chatLoading, sendChatMessage],
  );

  const [noteInput, setNoteInput] = useState("");
  const [ticketForAgent, setTicketForAgent] = useState(true);
  const [ticketUrgent, setTicketUrgent] = useState(false);
  const [ticketBlocked, setTicketBlocked] = useState(false);
  const [ticketNeedsFollowUp, setTicketNeedsFollowUp] = useState(false);
  const [noteMessage, setNoteMessage] = useState("");
  const [routerRuns, setRouterRuns] = useState<RouterRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [wakeAlarm, setWakeAlarm] = useState<WakeAlarmSettings>({
    enabled: false,
    time: "07:00",
    monthlyEarningsUsd: 0,
    lastTriggeredDate: "",
  });
  const [breakThresholdMinutes, setBreakThresholdMinutes] = useState(120);
  const [breakActiveUntilMs, setBreakActiveUntilMs] = useState<number | null>(null);
  const [lastBreakAtMs, setLastBreakAtMs] = useState<number | null>(null);
  const [lastBurnoutNudgeMs, setLastBurnoutNudgeMs] = useState<number | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  const notifiedIds = useRef<Set<string>>(new Set());
  const completedRunNotifiedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission().catch(console.error);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const savedThreshold = Number(window.localStorage.getItem("afh.break.threshold.minutes") ?? "120");
    if (Number.isFinite(savedThreshold) && [90, 120, 150].includes(savedThreshold)) {
      setBreakThresholdMinutes(savedThreshold);
    }
    const savedLastBreak = Number(window.localStorage.getItem("afh.break.lastAtMs") ?? "");
    if (Number.isFinite(savedLastBreak) && savedLastBreak > 0) {
      setLastBreakAtMs(savedLastBreak);
    }
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(media.matches);
    const listener = () => setReduceMotion(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const raw = window.localStorage.getItem("afh.wake.alarm.settings");
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<WakeAlarmSettings>;
      setWakeAlarm((prev) => ({
        enabled: Boolean(parsed.enabled),
        time: typeof parsed.time === "string" && /^\d{2}:\d{2}$/.test(parsed.time) ? parsed.time : prev.time,
        monthlyEarningsUsd:
          typeof parsed.monthlyEarningsUsd === "number" && Number.isFinite(parsed.monthlyEarningsUsd)
            ? Math.max(0, parsed.monthlyEarningsUsd)
            : prev.monthlyEarningsUsd,
        lastTriggeredDate:
          typeof parsed.lastTriggeredDate === "string" ? parsed.lastTriggeredDate : prev.lastTriggeredDate,
      }));
    } catch {
      // Ignore invalid local settings payload.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("afh.break.threshold.minutes", String(breakThresholdMinutes));
  }, [breakThresholdMinutes]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("afh.wake.alarm.settings", JSON.stringify(wakeAlarm));
  }, [wakeAlarm]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }
    if (Notification.permission !== "granted") {
      return;
    }

    for (const item of attentionItems) {
      if (!notifiedIds.current.has(item.id)) {
        notifiedIds.current.add(item.id);

        try {
          new Notification(item.title, {
            body: item.detail,
          });
        } catch (err) {
          console.error("Failed to trigger notification", err);
        }
      }
    }
  }, [attentionItems]);

  const activeSession = dashboard?.activeSession ?? null;

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const raw = await response.text();
      let payload: (DashboardPayload & { message?: string; error?: string }) | null = null;
      if (raw.trim().length > 0) {
        try {
          payload = JSON.parse(raw) as DashboardPayload & { message?: string; error?: string };
        } catch {
          payload = null;
        }
      }

      if (!response.ok) {
        const fallback = raw.trim().slice(0, 180);
        throw new Error(payload?.error ?? payload?.message ?? (fallback || "Unable to load dashboard"));
      }

      if (!payload) {
        throw new Error("Dashboard API returned invalid JSON.");
      }

      setDashboard(payload);
      setError("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected dashboard error";
      try {
        const fallbackResponse = await fetch("/data/dashboard-seed.json", { cache: "no-store" });
        const fallbackRaw = await fallbackResponse.text();
        const fallbackPayload = JSON.parse(fallbackRaw) as DashboardPayload;
        setDashboard(fallbackPayload);
        setError(`Dashboard API unavailable. Loaded fallback data. (${message})`);
      } catch {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const todayQueue = useMemo(() => {
    if (!dashboard) {
      return [];
    }

    const dueToday = dashboard.queue.filter((task) => task.status !== "DONE" && isDueToday(task));
    return dueToday;
  }, [dashboard]);

  const focusQueue = useMemo(() => {
    if (!dashboard) {
      return [];
    }
    if (todayQueue.length > 0) {
      return todayQueue;
    }
    return dashboard.queue.filter((task) => task.status !== "DONE").slice(0, 8);
  }, [dashboard, todayQueue]);

  const selectedBusiness = useMemo(() => {
    if (activeSession) {
      return {
        id: activeSession.businessId,
        name: activeSession.businessName,
      };
    }

    const nextTask = resolvePrimaryTask(focusQueue);
    if (nextTask) {
      return { id: nextTask.businessId, name: nextTask.businessName };
    }

    const firstBusiness = dashboard?.businesses[0];
    if (firstBusiness) {
      return { id: firstBusiness.id, name: firstBusiness.name };
    }

    return null;
  }, [activeSession, dashboard, focusQueue]);

  useEffect(() => {
    if (!selectedBusiness?.id) {
      setBrandingSummary(null);
      setBrandingError("");
      return;
    }

    let cancelled = false;
    const loadBrandingSummary = async () => {
      try {
        setBrandingLoading(true);
        const params = new URLSearchParams({ companyId: selectedBusiness.id });
        const response = await fetch(`/api/branding-day/summary?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as BrandingSummaryPayload & {
          message?: string;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? payload.message ?? "Unable to load branding summary");
        }
        if (!cancelled) {
          setBrandingSummary(payload);
          setBrandingError("");
        }
      } catch (err) {
        if (!cancelled) {
          setBrandingSummary(null);
          setBrandingError(err instanceof Error ? err.message : "Branding summary unavailable");
        }
      } finally {
        if (!cancelled) {
          setBrandingLoading(false);
        }
      }
    };

    void loadBrandingSummary();
    return () => {
      cancelled = true;
    };
  }, [selectedBusiness?.id]);

  const brandingActionQueue = useMemo(() => {
    if (!selectedBusiness) {
      return [];
    }
    return focusQueue
      .filter((task) => task.businessId === selectedBusiness.id)
      .slice(0, 4);
  }, [focusQueue, selectedBusiness]);

  const brandingSnapshot = brandingSummary?.latestSnapshot ?? null;
  const brandingInsight = brandingSummary?.latestInsight ?? null;
  const brandingPrediction = brandingSummary?.latestPrediction ?? null;
  const brandingChannelEntries = useMemo(() => {
    if (!brandingSnapshot) {
      return [];
    }
    return Object.entries(brandingSnapshot.channelMix).sort((a, b) => b[1] - a[1]);
  }, [brandingSnapshot]);

  const recommendedTask = useMemo(() => {
    return resolvePrimaryTask(focusQueue);
  }, [focusQueue]);

  const recommendedGapLabel = useMemo(() => {
    if (!dashboard || !recommendedTask) {
      return "";
    }

    const behindEntry = dashboard.behindTargets.find(
      (entry) => entry.businessId === recommendedTask.businessId,
    );
    if (!behindEntry || behindEntry.behindMinutes >= 0) {
      return "";
    }

    return formatBehindGap(behindEntry.behindMinutes);
  }, [dashboard, recommendedTask]);

  const filteredNewsItems = useMemo(() => {
    if (newsFilter === "all") {
      return newsItems;
    }
    return newsItems.filter((item) => item.category === newsFilter);
  }, [newsFilter, newsItems]);

  const toggleExpandedNews = useCallback((id: string) => {
    setExpandedNewsIds((previous) =>
      previous.includes(id) ? previous.filter((newsId) => newsId !== id) : [...previous, id],
    );
  }, []);

  useEffect(() => {
    if (!dashboard || selectedCompanyId) {
      return;
    }
    if (dashboard.businesses[0]) {
      setSelectedCompanyId(dashboard.businesses[0].id);
    }
  }, [dashboard, selectedCompanyId]);

  const loadAttentionQueue = useCallback(async () => {
    try {
      setAttentionLoading(true);
      const response = await fetch("/api/attention-queue", { cache: "no-store" });
      const payload = (await response.json()) as {
        week?: string;
        events?: AttentionItem[];
        coverage?: CoverageItem[];
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? payload.message ?? "Unable to load attention queue");
      }

      setAttentionWeek(payload.week ?? "");
      setAttentionItems(payload.events ?? []);
      setCoverageItems(payload.coverage ?? []);
      setAttentionError("");
    } catch (err) {
      setAttentionError(err instanceof Error ? err.message : "Attention queue load failed");
    } finally {
      setAttentionLoading(false);
    }
  }, []);

  useEffect(() => {
    if (screen !== "notifications" && screen !== "agents") {
      return;
    }
    void loadAttentionQueue();
  }, [screen, loadAttentionQueue]);

  useEffect(() => {
    if (!dashboard || coverageItems.length > 0 || attentionLoading) {
      return;
    }
    void loadAttentionQueue();
  }, [attentionLoading, coverageItems.length, dashboard, loadAttentionQueue]);

  const runBrandScan = useCallback(async () => {
    if (!selectedCompanyId) {
      setBrandMessage("Select a company first.");
      return;
    }

    const urls = scanUrlsInput
      .split(",")
      .map((url) => url.trim())
      .filter((url) => url.length > 0);
    if (urls.length === 0) {
      setBrandMessage("Add at least one website URL.");
      return;
    }

    const company = dashboard?.businesses.find((item) => item.id === selectedCompanyId);

    try {
      setBrandScanLoading(true);
      setBrandMessage("");
      const response = await fetch("/api/brand-dna/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          companyName: company?.name,
          urls,
        }),
      });
      const payload = (await response.json()) as {
        profile?: BrandProfileView;
        assetsAdded?: number;
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? payload.message ?? "Brand scan failed");
      }

      setBrandProfile(payload.profile ?? null);
      setBrandMessage(
        `Brand profile refreshed. ${payload.assetsAdded ?? 0} new assets captured.`,
      );
    } catch (err) {
      setBrandMessage(err instanceof Error ? err.message : "Brand scan failed");
    } finally {
      setBrandScanLoading(false);
    }
  }, [dashboard?.businesses, scanUrlsInput, selectedCompanyId]);

  const generateWeeklyPlan = useCallback(async () => {
    try {
      setBrandScanLoading(true);
      const response = await fetch("/api/content-plan/generate-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = (await response.json()) as {
        generated?: { generated?: number; week?: string };
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? payload.message ?? "Weekly plan generation failed");
      }

      const count = payload.generated?.generated ?? 0;
      setBrandMessage(`Weekly content plan generated (${count} items).`);
      await loadAttentionQueue();
    } catch (err) {
      setBrandMessage(err instanceof Error ? err.message : "Weekly plan generation failed");
    } finally {
      setBrandScanLoading(false);
    }
  }, [loadAttentionQueue]);

  const syncWeekToNotion = useCallback(async () => {
    try {
      setBrandScanLoading(true);
      const response = await fetch("/api/notion/sync-week", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        syncedTasks?: number;
        syncedContentRows?: number;
        skipped?: string[];
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? payload.message ?? "Notion sync failed");
      }

      const skippedMessage =
        payload.skipped && payload.skipped.length > 0
          ? ` Skipped: ${payload.skipped.join(" | ")}`
          : "";
      setBrandMessage(
        `Notion sync complete. Tasks: ${payload.syncedTasks ?? 0}, Content rows: ${payload.syncedContentRows ?? 0}.${skippedMessage}`,
      );
      await loadAttentionQueue();
    } catch (err) {
      setBrandMessage(err instanceof Error ? err.message : "Notion sync failed");
    } finally {
      setBrandScanLoading(false);
    }
  }, [loadAttentionQueue]);

  const loadNewsSignals = useCallback(async (refresh: boolean) => {
    try {
      setNewsLoading(true);
      const response = await fetch(`/api/news-signals${refresh ? "?refresh=1" : ""}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        items?: NewsSignal[];
        lastUpdated?: string;
        health?: SourceHealth[];
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? payload.message ?? "Unable to load news feed");
      }

      setNewsItems(payload.items ?? []);
      setNewsUpdatedAt(payload.lastUpdated ?? "");
      setNewsHealth(payload.health ?? []);
      setNewsError("");
    } catch (err) {
      setNewsError(err instanceof Error ? err.message : "News feed load failed");
    } finally {
      setNewsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (screen !== "news") {
      return;
    }
    void loadNewsSignals(false);
    const id = window.setInterval(() => {
      void loadNewsSignals(false);
    }, 30 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [screen, loadNewsSignals]);

  const saveNewsSignalToNotion = useCallback(async (itemId: string) => {
    try {
      setNewsSaveLoadingId(itemId);
      const response = await fetch("/api/news-signals/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const payload = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? payload.message ?? "Unable to save signal");
      }
      setNewsError("");
      setApiState("Signal saved to Notion task queue.");
    } catch (err) {
      setNewsError(err instanceof Error ? err.message : "Unable to save signal");
    } finally {
      setNewsSaveLoadingId(null);
    }
  }, []);

  const loadRouterRuns = useCallback(async () => {
    try {
      setRunsLoading(true);
      const response = await fetch("/api/notes-inbox/runs", { cache: "no-store" });
      const payload = (await response.json()) as {
        runs?: RouterRun[];
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? payload.message ?? "Unable to load router runs");
      }
      setRouterRuns(payload.runs ?? []);
    } catch (err) {
      setNoteMessage(err instanceof Error ? err.message : "Unable to load router runs");
    } finally {
      setRunsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (screen !== "notifications" && screen !== "agents") {
      return;
    }
    void loadRouterRuns();
    const intervalId = window.setInterval(() => {
      void loadRouterRuns();
    }, 12000);
    return () => window.clearInterval(intervalId);
  }, [screen, loadRouterRuns]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    for (const run of routerRuns) {
      if (run.status !== "completed" || completedRunNotifiedIds.current.has(run.runId)) {
        continue;
      }
      completedRunNotifiedIds.current.add(run.runId);
      setApiState(`Agent run completed: ${routerConnectorLabel(run.connector)} (${run.runId.slice(0, 8)})`);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification("Agent run completed", {
            body: `${routerConnectorLabel(run.connector)} finished run ${run.runId.slice(0, 8)}`,
          });
        } catch (error) {
          console.error("Failed to trigger run-complete notification", error);
        }
      }
    }
  }, [routerRuns]);

  const captureInboxNote = useCallback(async () => {
    const note = noteInput.trim();
    if (!note) {
      setNoteMessage("Add a note first.");
      return;
    }

    try {
      setRunsLoading(true);
      const response = await fetch("/api/notes-inbox/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note,
          businessId: selectedCompanyId || undefined,
          metadata: {
            isForAgent: ticketForAgent,
            isUrgent: ticketUrgent,
            isBlocked: ticketBlocked,
            needsFollowUp: ticketNeedsFollowUp,
          },
        }),
      });
      const payload = (await response.json()) as {
        needsClarification?: boolean;
        clarificationQuestion?: string;
        notionTask?: { url?: string };
        route?: { connector?: string; status?: string };
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? payload.message ?? "Unable to capture note");
      }

      if (payload.needsClarification) {
        setNoteMessage(payload.clarificationQuestion ?? "Need clarification.");
      } else {
        if (ticketForAgent) {
          await fetch("/api/agents/triage", { method: "POST" });
        }
        const routed = payload.route
          ? ` Routed to ${payload.route.connector} (${payload.route.status}).`
          : "";
        setNoteMessage(`Task created in Notion.${routed}`);
        setNoteInput("");
        await loadRouterRuns();
      }
    } catch (err) {
      setNoteMessage(err instanceof Error ? err.message : "Unable to capture note");
    } finally {
      setRunsLoading(false);
    }
  }, [
    loadRouterRuns,
    noteInput,
    selectedCompanyId,
    ticketBlocked,
    ticketForAgent,
    ticketNeedsFollowUp,
    ticketUrgent,
  ]);

  const writeDailySummary = useCallback(async () => {
    try {
      setRunsLoading(true);
      const response = await fetch("/api/notes-inbox/daily-summary", { method: "POST" });
      const payload = (await response.json()) as {
        summaryPageId?: string;
        completed?: number;
        blocked?: number;
        escalated?: number;
        skipped?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to write daily summary");
      }
      if (payload.skipped) {
        setNoteMessage(payload.skipped);
      } else {
        setNoteMessage(
          `Daily summary recorded. Completed ${payload.completed ?? 0}, blocked ${payload.blocked ?? 0}, escalated ${payload.escalated ?? 0}.`,
        );
      }
    } catch (err) {
      setNoteMessage(err instanceof Error ? err.message : "Unable to write daily summary");
    } finally {
      setRunsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedBusiness) {
      return;
    }

    const controller = new AbortController();

    const run = async () => {
      try {
        setBrief((prev) => ({ ...prev, loading: true, error: "" }));
        const params = new URLSearchParams({
          businessId: selectedBusiness.id,
          businessName: selectedBusiness.name,
        });
        const response = await fetch(`/api/brief?${params.toString()}`, {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        });

        const payload = (await response.json()) as {
          brief?: string;
          source?: string;
          fetchedAt?: string;
          error?: string;
          message?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? payload.message ?? "Unable to load brief");
        }

        setBrief({
          loading: false,
          error: "",
          text: payload.brief ?? "",
          source: payload.source ?? "unknown",
          fetchedAt: payload.fetchedAt ?? "",
        });
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }

        setBrief((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : "Brief lookup failed",
        }));
      }
    };

    void run();

    return () => {
      controller.abort();
    };
  }, [selectedBusiness]);

  useEffect(() => {
    setTimerNow(Date.now());
    const id = window.setInterval(() => {
      setTimerNow(Date.now());
    }, 1000);
    const syncTimerNow = () => setTimerNow(Date.now());

    window.addEventListener("focus", syncTimerNow);
    document.addEventListener("visibilitychange", syncTimerNow);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", syncTimerNow);
      document.removeEventListener("visibilitychange", syncTimerNow);
    };
  }, []);

  const completionPct = useMemo(() => {
    if (!dashboard || dashboard.totalPlannedMinutes <= 0) {
      return 0;
    }

    return Math.min(
      100,
      Math.round((dashboard.totalFocusedMinutes / dashboard.totalPlannedMinutes) * 100),
    );
  }, [dashboard]);

  const productivitySlices = useMemo(
    () => (dashboard ? buildProductivitySlices(dashboard.queue) : []),
    [dashboard],
  );
  const weeklyGreeting = useMemo(() => {
    const index = weekOfYear(new Date()) % weeklyGreetingOptions.length;
    return weeklyGreetingOptions[index];
  }, [weeklyGreetingOptions]);

  const ringDashOffset = useMemo(() => {
    const circumference = 283;
    return circumference - (completionPct / 100) * circumference;
  }, [completionPct]);

  const focusRemainingSeconds = useMemo(() => {
    if (!activeSession || activeSession.status !== "LIVE") {
      return 0;
    }

    const startedAtMs = new Date(activeSession.startedAt).getTime();
    if (!Number.isFinite(startedAtMs)) {
      return activeSession.plannedMinutes * 60;
    }

    const elapsed = Math.floor((timerNow - startedAtMs) / 1000);
    return Math.max(0, activeSession.plannedMinutes * 60 - elapsed);
  }, [activeSession, timerNow]);

  const focusElapsedSeconds = useMemo(() => {
    if (!activeSession || activeSession.status !== "LIVE") {
      return 0;
    }
    const startedAtMs = new Date(activeSession.startedAt).getTime();
    if (!Number.isFinite(startedAtMs)) {
      return 0;
    }
    return Math.max(0, Math.floor((timerNow - startedAtMs) / 1000));
  }, [activeSession, timerNow]);

  const focusProgressPct = useMemo(() => {
    if (!activeSession || activeSession.plannedMinutes <= 0) {
      return 0;
    }

    const total = activeSession.plannedMinutes * 60;
    const elapsed = Math.max(0, total - focusRemainingSeconds);
    return Math.min(100, Math.round((elapsed / total) * 100));
  }, [activeSession, focusRemainingSeconds]);

  const activeSessionElapsedMinutes = useMemo(() => {
    if (!activeSession || activeSession.status !== "LIVE") {
      return 0;
    }
    // After a break, count elapsed from when the break *started* (lastBreakAtMs),
    // not from session start — so the break threshold resets after each break.
    const anchorMs = lastBreakAtMs ?? new Date(activeSession.startedAt).getTime();
    if (!Number.isFinite(anchorMs)) {
      return 0;
    }
    return Math.max(0, Math.floor((timerNow - anchorMs) / (1000 * 60)));
  }, [activeSession, lastBreakAtMs, timerNow]);

  const breakActive = useMemo(() => {
    if (!breakActiveUntilMs) {
      return false;
    }
    return timerNow < breakActiveUntilMs;
  }, [breakActiveUntilMs, timerNow]);

  const breakGlow = useMemo(
    () => Boolean(activeSession && activeSessionElapsedMinutes >= breakThresholdMinutes && !breakActive),
    [activeSession, activeSessionElapsedMinutes, breakThresholdMinutes, breakActive],
  );

  const dayStatus = useMemo(() => {
    const isClockedIn = Boolean(activeSession && activeSession.status === "LIVE");
    if (!isClockedIn) {
      return {
        score: 0,
        color: "hsl(190 12% 70%)",
        tooltip: "Clock in by starting a focus session to enable day pacing.",
        label: "Clock-in required",
      };
    }

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const dayStart = 6 * 60;
    const dayEnd = 22 * 60;
    const dayProgress = Math.max(0, Math.min(1, (currentMinutes - dayStart) / (dayEnd - dayStart)));
    const strain = Math.max(0, Math.min(1, activeSessionElapsedMinutes / Math.max(1, breakThresholdMinutes)));
    const score = Math.max(0, Math.min(1, dayProgress * 0.6 + strain * 0.4));
    const hue = Math.round(120 - score * 120);
    return {
      score,
      color: `hsl(${hue} 70% 45%)`,
      label: score < 0.35 ? "Healthy" : score < 0.7 ? "Steady pace" : "High strain",
      tooltip:
        score < 0.35
          ? "Pacing is healthy."
          : score < 0.7
            ? "Steady pace. Consider a short reset soon."
            : "High strain window. A break now helps long-term output.",
    };
  }, [activeSession, activeSessionElapsedMinutes, breakThresholdMinutes]);

  const activityBoard = useMemo(() => {
    const active = routerRuns.filter((run) => run.status === "dispatched").length;
    const waiting = routerRuns.filter((run) => run.status === "waiting").length;
    const failed = routerRuns.filter((run) => run.status === "failed").length;
    const completed = routerRuns.filter((run) => run.status === "completed").length;
    const recent = routerRuns
      .slice(0, 3)
      .map((run) => ({
        id: run.runId,
        label: `${routerConnectorLabel(run.connector)} · ${run.status}`,
        at: new Date(run.createdAt).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        }),
      }));
    return { active, waiting, failed, completed, recent };
  }, [routerRuns]);

  useEffect(() => {
    if (!activeSession || !breakGlow) {
      return;
    }
    const now = Date.now();
    const cooldownMs = 45 * 60 * 1000;
    if (lastBurnoutNudgeMs && now - lastBurnoutNudgeMs < cooldownMs) {
      return;
    }
    setLastBurnoutNudgeMs(now);
    setApiState("Gentle nudge: you’ve been in deep focus for a while. A short break can protect momentum.");
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification("Gentle break reminder", {
          body: "You have been in active focus for a while. A short reset helps sustain output.",
        });
      } catch {
        // Notification is best-effort only.
      }
    }
  }, [activeSession, breakGlow, lastBurnoutNudgeMs]);

  const takeBreak = useCallback(() => {
    const durationMinutes = 10;
    const now = Date.now();
    setBreakActiveUntilMs(now + durationMinutes * 60 * 1000);
    setLastBreakAtMs(now);
    setLastBurnoutNudgeMs(null);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("afh.break.lastAtMs", String(now));
      const current = window.localStorage.getItem("afh.break.logs");
      const parsed = current ? (JSON.parse(current) as BreakLogEntry[]) : [];
      const next: BreakLogEntry[] = [
        {
          startedAt: new Date(now).toISOString(),
          durationMinutes,
          sessionId: activeSession?.id,
        },
        ...parsed,
      ].slice(0, 50);
      window.localStorage.setItem("afh.break.logs", JSON.stringify(next));
    }
    setApiState(`Break started for ${durationMinutes} minutes. Great pacing choice.`);
  }, [activeSession?.id]);

  useEffect(() => {
    if (typeof window === "undefined" || !wakeAlarm.enabled) {
      return;
    }

    const checkAlarm = () => {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      if (wakeAlarm.lastTriggeredDate === today) {
        return;
      }

      const [hh, mm] = wakeAlarm.time.split(":").map((part) => Number(part));
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) {
        return;
      }

      const target = new Date(now);
      target.setHours(hh, mm, 0, 0);
      if (now.getTime() < target.getTime()) {
        return;
      }

      const message = buildWakeMessage(wakeAlarm.monthlyEarningsUsd);
      setWakeAlarm((prev) => ({ ...prev, lastTriggeredDate: today }));
      setNoteMessage(message);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification("Good morning from Prime", { body: message });
        } catch {
          // Notification is best-effort only.
        }
      }
    };

    checkAlarm();
    const interval = window.setInterval(checkAlarm, 30_000);
    return () => window.clearInterval(interval);
  }, [wakeAlarm]);

  const loadWeather = useCallback(async () => {
    try {
      setWeatherLoading(true);
      const response = await fetch("/api/weather", {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        weather?: WeatherSnapshot;
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? payload.message ?? "Unable to load weather");
      }
      setWeather(payload.weather ?? null);
      setWeatherError("");
    } catch (err) {
      setWeatherError(err instanceof Error ? err.message : "Unable to load weather");
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  useEffect(() => {
    if (screen !== "dashboard") {
      return;
    }
    void loadWeather();
    const id = window.setInterval(() => {
      void loadWeather();
    }, 30 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [loadWeather, screen]);

  useEffect(() => {
    const onUpdateAvailable = () => {
      setUpdateAvailable(true);
    };
    window.addEventListener("afh-update-available", onUpdateAvailable);
    return () => {
      window.removeEventListener("afh-update-available", onUpdateAvailable);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    window.location.reload();
  }, []);

  const startFocus = useCallback(
    async (task?: FocusTask) => {
      if (!dashboard) {
        return;
      }

      const targetTask = task ?? resolvePrimaryTask(focusQueue);
      if (!targetTask) {
        setApiState("No task due today to start.");
        return;
      }

      try {
        setStartLoadingTaskId(targetTask.id);
        setApiState("");

        const response = await fetch("/api/focus/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: targetTask.id }),
        });

        const payload = (await response.json()) as {
          id?: string;
          message?: string;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? payload.message ?? "Unable to start session");
        }

        setApiState("Focus session started.");
        setScreen("focus");
        await loadDashboard();
      } catch (err) {
        setApiState(err instanceof Error ? err.message : "Unable to start session");
      } finally {
        setStartLoadingTaskId(null);
      }
    },
    [dashboard, focusQueue, loadDashboard],
  );

  const completeFocus = useCallback(
    async (forceConfirm = false) => {
      if (!activeSession) {
        return;
      }

      try {
        setIsCompleting(true);
        setApiState("");

        const response = await fetch("/api/focus/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: activeSession.id,
            outcomes,
            blockers,
            followUps,
            ...(forceConfirm ? { confirmationToken: "CONFIRM" } : {}),
          }),
        });

        const payload = (await response.json()) as {
          message?: string;
          error?: string;
        };

        if (response.status === 409) {
          setNeedsConfirmation(true);
          throw new Error(payload.error ?? "Confirmation required for bulk follow-up writes");
        }

        if (!response.ok) {
          throw new Error(payload.error ?? payload.message ?? "Unable to complete focus session");
        }

        setNeedsConfirmation(false);
        setOutcomes("");
        setBlockers("");
        setFollowUps("");
        setApiState("Focus session completed and synced.");
        setScreen("dashboard");
        await loadDashboard();
      } catch (err) {
        setApiState(err instanceof Error ? err.message : "Unable to complete focus session");
      } finally {
        setIsCompleting(false);
      }
    },
    [activeSession, blockers, followUps, loadDashboard, outcomes],
  );

  return (
    <>
      <nav>
        <div className="nav-brand">
          Cozy<span>Hub</span>
        </div>
        <ul className="nav-tabs">
          <li>
            <button
              className={`nav-tab flex items-center justify-center gap-2 ${screen === "dashboard" ? "active" : ""}`}
              onClick={() => setScreen("dashboard")}
              type="button"
            >
              <CozyIcon
                icon={LayoutDashboard}
                size={16}
                state={screen === "dashboard" ? "focus" : "idle"}
                motion={screen === "dashboard" ? "glow" : "none"}
                reducedMotion={reduceMotion}
              />
              Dashboard
            </button>
          </li>
          <li>
            <button
              className={`nav-tab flex items-center justify-center gap-2 ${screen === "focus" ? "active" : ""}`}
              onClick={() => setScreen("focus")}
              type="button"
            >
              <CozyIcon
                icon={Target}
                size={16}
                state={screen === "focus" ? "breakReady" : "idle"}
                motion={screen === "focus" ? "breathe" : "none"}
                reducedMotion={reduceMotion}
              />
              Focus
            </button>
          </li>
          <li>
            <button
              className={`nav-tab flex items-center justify-center gap-2 ${screen === "branding" ? "active" : ""}`}
              onClick={() => setScreen("branding")}
              type="button"
            >
              <CozyIcon
                icon={Palette}
                size={16}
                state={screen === "branding" ? "focus" : "idle"}
                motion={screen === "branding" ? "float" : "none"}
                reducedMotion={reduceMotion}
              />
              Branding
            </button>
          </li>
          <li>
            <button
              className={`nav-tab flex items-center justify-center gap-2 ${screen === "agents" ? "active" : ""}`}
              onClick={() => setScreen("agents")}
              type="button"
            >
              <CozyIcon
                icon={Bot}
                size={16}
                state={screen === "agents" ? "focus" : "idle"}
                motion={screen === "agents" ? "float" : "none"}
                reducedMotion={reduceMotion}
              />
              Agents
            </button>
          </li>
          <li>
            <button
              className={`nav-tab flex items-center justify-center gap-2 ${screen === "news" ? "active" : ""}`}
              onClick={() => setScreen("news")}
              type="button"
            >
              <CozyIcon
                icon={Newspaper}
                size={16}
                state={screen === "news" ? "focus" : "idle"}
                motion={screen === "news" ? "glow" : "none"}
                reducedMotion={reduceMotion}
              />
              News
            </button>
          </li>
          <li>
            <button
              className={`nav-tab flex items-center justify-center gap-2 ${screen === "notifications" ? "active" : ""}`}
              onClick={() => {
                setScreen("notifications");
                if (typeof Notification !== "undefined" && Notification.permission === "default") {
                  Notification.requestPermission().catch(console.error);
                }
              }}
              type="button"
            >
              <CozyIcon
                icon={Inbox}
                size={16}
                state={screen === "notifications" ? "warning" : "idle"}
                motion={screen === "notifications" ? "wiggle" : "none"}
                reducedMotion={reduceMotion}
              />
              Inbox
            </button>
          </li>
        </ul>
      </nav>

      <div className="app">
        {updateAvailable && (
          <div className="update-available-banner">
            <span>New version available.</span>
            <button className="btn btn-primary btn-sm" onClick={applyUpdate} type="button">
              Refresh now
            </button>
          </div>
        )}
        {loading && <div className="screen"><div className="state-banner">Loading dashboard...</div></div>}
        {!loading && error && (
          <div className="screen">
            <div className="state-banner error">Dashboard error: {error}</div>
          </div>
        )}
        {!loading && !error && dashboard && (
          <>
            {screen === "dashboard" && (
              <div className="screen dashboard-screen">
                <div className="sync-bar">
                  <div className="sync-dot" />
                  Working on today: {selectedBusiness?.name ?? "No company selected today"}
                </div>

                <div className="balance-grid">
                  {dashboard.businesses.map((business) => {
                    const pct =
                      business.plannedMinutes > 0
                        ? Math.max(0, Math.min(100, Math.round((business.focusedMinutes / business.plannedMinutes) * 100)))
                        : 0;
                    return (
                      <div className="glass balance-card" key={business.id}>
                        <div className="balance-company">{business.name}</div>
                        <div className="balance-pct" style={{ color: BALANCE_PCT_COLOR[business.color] }}>
                          {pct}%
                        </div>
                        <div className="balance-bar-v">
                          <div className={`progress-fill ${FILL_CLASS[business.color]}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {apiState && <div className="state-banner">{apiState}</div>}

                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
                  <div className="glass cozy-greeting-card">
                    <div className="cozy-greeting-title">{weeklyGreeting}</div>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={() => void startFocus()}
                    type="button"
                    disabled={Boolean(startLoadingTaskId)}
                  >
                    {startLoadingTaskId ? "Starting..." : "Start Focus Block"}
                  </button>
                </div>

                <div className="cozy-dashboard-widgets">
                  <div className="glass cozy-widget-card cozy-compact-card cozy-weather-card">
                    <div className="cozy-widget-header">
                      <div className="card-title">Weather</div>
                      <div className="cozy-unit-toggle" role="group" aria-label="Temperature unit">
                        <button
                          type="button"
                          className={`cozy-unit-btn ${temperatureUnit === "F" ? "is-active" : ""}`}
                          onClick={() => setTemperatureUnit("F")}
                        >
                          F
                        </button>
                        <button
                          type="button"
                          className={`cozy-unit-btn ${temperatureUnit === "C" ? "is-active" : ""}`}
                          onClick={() => setTemperatureUnit("C")}
                        >
                          C
                        </button>
                      </div>
                    </div>
                    <div className="cozy-widget-value">
                      {weatherLoading ? "Updating..." : weather ? formatTemperature(weather.temperatureC, temperatureUnit) : "--"}
                    </div>
                    <div className="task-biz">
                      {weather ? `${weather.city} · ${weather.condition}` : weatherError ? "Weather unavailable" : "No weather data"}
                    </div>
                  </div>
                  <div className="glass cozy-widget-card cozy-clock-card cozy-compact-card">
                    <div className="cozy-widget-value flex items-center gap-2">
                      <ClockIcon size={20} className="text-[var(--teal)] opacity-80" />
                      {formatClockTime(timerNow)}
                    </div>
                    <div className="task-biz">{dashboard.dateLabel || formatClockMeta(timerNow)}</div>
                  </div>
                  <div className="glass cozy-widget-card cozy-productivity-card">
                    <div className="card-title">Productivity</div>
                    <div className="cozy-productivity-metrics">
                      <div className="cozy-productivity-metric">
                        <div className="cozy-productivity-label">Time</div>
                        <div className="cozy-productivity-value">{formatFocusedHours(dashboard.totalFocusedMinutes)}</div>
                      </div>
                      <div className="cozy-productivity-metric">
                        <div className="cozy-productivity-label">Tasks</div>
                        <div className="cozy-productivity-value">{dashboard.queue.length}</div>
                      </div>
                      <div className="cozy-productivity-metric">
                        <div className="cozy-productivity-label">Work day</div>
                        <div className="cozy-productivity-value">{completionPct}%</div>
                      </div>
                    </div>
                    <div className="cozy-widget-separator" />
                    <div className="cozy-progress-grid">
                      {productivitySlices.map((item) => {
                        const circumference = 75.4;
                        const dashOffset = circumference - (item.percentage / 100) * circumference;
                        return (
                          <div className="cozy-progress-item" key={item.task}>
                            <svg width="28" height="28" viewBox="0 0 28 28" className="cozy-progress-svg">
                              <circle cx="14" cy="14" r="12" className="cozy-progress-track" />
                              <circle
                                cx="14"
                                cy="14"
                                r="12"
                                className={`cozy-progress-fill ${item.ringClass}`}
                                strokeDasharray={circumference}
                                strokeDashoffset={dashOffset}
                              />
                            </svg>
                            <div className="cozy-progress-label">{item.task}</div>
                            <div className="cozy-progress-value">{item.percentage}%</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="grid-2">
                  <div className="glass" style={{ padding: 24 }}>
                    <div className="card-title">Today&apos;s Focus Queue</div>
                    {recommendedTask && (
                      <div className="task-biz" style={{ marginBottom: 10 }}>
                        Recommended next: <strong>{recommendedTask.businessName}</strong>
                        {recommendedGapLabel ? ` · ${recommendedGapLabel}` : ""}
                      </div>
                    )}
                    <div className="task-biz" style={{ marginBottom: 8 }}>
                      {todayQueue.length > 0
                        ? "Showing tasks due today."
                        : "No tasks due today. Showing active queue."}
                    </div>
                    {focusQueue.length === 0 && (
                      <div className="task-biz">
                        No active tasks right now. Keep the dashboard clean and enjoy the space.
                      </div>
                    )}
                    {focusQueue.map((task) => {
                      const badge = queueBadge(task);
                      return (
                        <div className="task-row" key={task.id}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div className="task-company-dot" style={{ background: COLOR_CLASS[dashboard.businesses.find((business) => business.id === task.businessId)?.color ?? "pink"] }} />
                              <div>
                                <div className="task-name">{task.title}</div>
                                <div className="task-biz">
                                  {task.businessName} · {task.category}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="task-mins">{formatDuration(task.plannedMinutes)}</div>
                          <div className="task-status">
                            {task.status === "NEXT" || task.status === "QUEUED" ? (
                              <button
                                className="btn btn-ghost btn-sm"
                                type="button"
                                disabled={Boolean(startLoadingTaskId)}
                                onClick={() => void startFocus(task)}
                              >
                                {startLoadingTaskId === task.id ? "Starting" : "Start"}
                              </button>
                            ) : (
                              <span className={badge.className}>{badge.label}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <div className="glass" style={{ padding: 24, textAlign: "center" }}>
                      <div className="card-title" style={{ textAlign: "left" }}>Daily Completion</div>
                      <div style={{ display: "flex", justifyContent: "center", position: "relative", width: 100, height: 100, margin: "0 auto 12px" }}>
                        <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }}>
                          <circle cx="50" cy="50" r="45" fill="none" stroke="var(--sand)" strokeWidth="8" />
                          <circle
                            cx="50"
                            cy="50"
                            r="45"
                            fill="none"
                            stroke="var(--pink)"
                            strokeWidth="8"
                            strokeLinecap="round"
                            strokeDasharray="283"
                            strokeDashoffset={ringDashOffset}
                          />
                        </svg>
                        <div
                          style={{
                            position: "absolute",
                            fontFamily: "var(--font-cormorant)",
                            fontSize: "1.5rem",
                            fontWeight: 500,
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%)",
                          }}
                        >
                          {completionPct}%
                        </div>
                      </div>
                      <div style={{ fontSize: "0.78rem", opacity: 0.5 }}>
                        {formatDuration(dashboard.totalFocusedMinutes)} of {formatDuration(dashboard.totalPlannedMinutes)} focused today
                      </div>
                    </div>

                    <div className="glass" style={{ padding: 24 }}>
                      <div className="card-title">Behind Target Businesses</div>
                      {dashboard.behindTargets.length === 0 && <div className="task-biz">No businesses are currently behind target.</div>}
                      {dashboard.behindTargets.map((business, index) => (
                        <div className="behind-row" key={business.businessId}>
                          <div className="behind-rank">{index + 1}</div>
                          <div style={{ flex: 1 }}>
                            <div className="behind-name">{business.name}</div>
                            <div className="behind-gap">{Math.abs(Math.round(business.behindMinutes))} min behind</div>
                          </div>
                          <span className={index === 0 ? "chip chip-pink" : "chip chip-cream"}>
                            {index === 0 ? "Urgent" : "Monitor"}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="glass" style={{ padding: 24 }}>
                      <div className="card-title">Weekly Coverage Gaps</div>
                      {coverageItems.length === 0 && (
                        <div className="task-biz">Generate weekly content plan to view coverage.</div>
                      )}
                      {coverageItems
                        .filter((item) => item.gap > 0)
                        .slice(0, 3)
                        .map((item) => (
                          <div className="behind-row" key={item.companyId}>
                            <div style={{ flex: 1 }}>
                              <div className="behind-name">{item.companyName}</div>
                              <div className="behind-gap">
                                Planned {item.planned} / Required {item.required}
                              </div>
                            </div>
                            <span className="chip chip-pink">Gap {item.gap}</span>
                          </div>
                        ))}
                      {coverageItems.length > 0 &&
                        coverageItems.every((item) => item.gap <= 0) && (
                          <div className="task-biz">All companies currently meet weekly minimum coverage.</div>
                        )}
                    </div>
                  </div>
                </div>

                <div className="sync-bar">
                  <div className="sync-dot" />
                  Notion synced at {formatSyncLabel(dashboard.syncedAt)} · NotebookLM: {dashboard.notebookBusinessName}
                </div>
              </div>
            )}

            {screen === "branding" && (
              <div className="screen">
                <div className="screen-title">Branding Day Mode (MVP)</div>
                <div className="screen-sub">
                  {selectedBusiness
                    ? `${selectedBusiness.name} brand health, momentum, and action queue.`
                    : "Select a company to view branding intelligence."}
                </div>

                {brandingLoading && <div className="state-banner">Loading branding summary...</div>}
                {brandingError && <div className="state-banner error">Branding summary error: {brandingError}</div>}

                <div className="grid-2">
                  <div className="glass" style={{ padding: 24 }}>
                    <div className="card-title">Weekly Action Queue</div>
                    {!selectedBusiness && <div className="task-biz">No company selected.</div>}
                    {selectedBusiness && brandingActionQueue.length === 0 && (
                      <div className="task-biz">No queued actions for this company.</div>
                    )}
                    {brandingActionQueue.map((task) => (
                      <div className="task-row" key={`branding-${task.id}`}>
                        <div>
                          <div className="task-name">{task.title}</div>
                          <div className="task-biz">{task.category}</div>
                        </div>
                        <div className="task-mins">{formatDuration(task.plannedMinutes)}</div>
                        <div className="task-status">
                          <span className={`status status-${task.status.toLowerCase()}`}>{task.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <div className="glass" style={{ padding: 24 }}>
                      <div className="card-title">AI Insight Card</div>
                      <div className="task-biz" style={{ marginBottom: 10 }}>
                        {brandingInsight
                          ? `Generated ${formatSyncLabel(brandingInsight.generatedAt)}`
                          : "Insight unavailable"}
                      </div>
                      <div style={{ fontSize: "0.92rem", lineHeight: 1.5 }}>
                        {brandingInsight?.summary ?? "No insight summary returned for this company yet."}
                      </div>
                      {brandingInsight && brandingInsight.recommendedActions.length > 0 && (
                        <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: "0.86rem", lineHeight: 1.45 }}>
                          {brandingInsight.recommendedActions.slice(0, 3).map((action) => (
                            <li key={action}>{action}</li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="glass" style={{ padding: 24 }}>
                      <div className="card-title">Prediction</div>
                      {!brandingPrediction && <div className="task-biz">Prediction unavailable.</div>}
                      {brandingPrediction && (
                        <>
                          <div className="task-biz" style={{ marginBottom: 8 }}>
                            7-day direction: <strong style={{ textTransform: "capitalize" }}>{brandingPrediction.direction}</strong>
                          </div>
                          <div className="task-biz" style={{ marginBottom: 8 }}>
                            Confidence {formatPercent(brandingPrediction.confidence)}
                          </div>
                          <div style={{ fontSize: "0.84rem", lineHeight: 1.45 }}>{brandingPrediction.rationale}</div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid-2">
                  <div className="glass" style={{ padding: 24 }}>
                    <div className="card-title">Funnel Snapshot</div>
                    {!brandingSnapshot && <div className="task-biz">Funnel snapshot unavailable.</div>}
                    {brandingSnapshot && (
                      <div style={{ display: "grid", gap: 10 }}>
                        <div className="behind-row">
                          <div className="behind-name">Awareness</div>
                          <span className="chip chip-cream">{formatPercent(brandingSnapshot.funnel.awareness)}</span>
                        </div>
                        <div className="behind-row">
                          <div className="behind-name">Consideration</div>
                          <span className="chip chip-cream">{formatPercent(brandingSnapshot.funnel.consideration)}</span>
                        </div>
                        <div className="behind-row">
                          <div className="behind-name">Conversion</div>
                          <span className="chip chip-cream">{formatPercent(brandingSnapshot.funnel.conversion)}</span>
                        </div>
                        <div className="behind-row">
                          <div className="behind-name">Loyalty</div>
                          <span className="chip chip-cream">{formatPercent(brandingSnapshot.funnel.loyalty)}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <div className="glass" style={{ padding: 24 }}>
                      <div className="card-title">Channel Mix</div>
                      {brandingChannelEntries.length === 0 && (
                        <div className="task-biz">Channel distribution unavailable.</div>
                      )}
                      {brandingChannelEntries.map(([channel, share]) => (
                        <div className="behind-row" key={channel}>
                          <div className="behind-name">{channel}</div>
                          <span className="chip chip-cream">{formatPercent(share)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="glass" style={{ padding: 24 }}>
                      <div className="card-title">Moments Snapshot</div>
                      {!brandingSnapshot && <div className="task-biz">Moments snapshot unavailable.</div>}
                      {brandingSnapshot && (
                        <>
                          <div className="task-biz" style={{ marginBottom: 8 }}>
                            Strength {formatPercent(brandingSnapshot.moments.strength)}
                          </div>
                          <div className="task-biz" style={{ marginBottom: 8 }}>
                            Momentum {formatPercent(brandingSnapshot.moments.momentum)}
                          </div>
                          <div style={{ fontSize: "0.84rem", lineHeight: 1.45 }}>{brandingSnapshot.moments.notes}</div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {screen === "focus" && (
              <div className="screen">
                <div className="screen-title">Focus Session</div>
                <div className="screen-sub">
                  {activeSession
                    ? `${activeSession.businessName} · ${activeSession.taskTitle}`
                    : "No live session yet. Start one from the dashboard queue."}
                </div>
                <div
                  className="glass"
                  style={{ padding: 10, marginBottom: 10 }}
                  title={dayStatus.tooltip}
                >
                  <div style={{ fontSize: "0.78rem", opacity: 0.75, marginBottom: 6 }}>
                    Day pacing status
                  </div>
                  <div style={{ fontSize: "0.72rem", opacity: 0.65, marginBottom: 6 }}>
                    {dayStatus.label}
                  </div>
                  <div className="progress-track" style={{ height: 10 }}>
                    <div
                      className="progress-fill"
                      style={{
                        width: `${Math.round(dayStatus.score * 100)}%`,
                        background: dayStatus.color,
                        transition: reduceMotion ? "none" : "width 300ms ease",
                      }}
                    />
                  </div>
                </div>

                {apiState && <div className="state-banner">{apiState}</div>}
                {needsConfirmation && (
                  <div className="state-banner warning">
                    This completion includes bulk follow-up lines. Confirm to proceed.
                  </div>
                )}

                {!activeSession && (
                  <div className="glass" style={{ padding: 24 }}>
                    <div className="card-title">Ready to Focus</div>
                    <div style={{ marginBottom: 12, fontSize: "0.88rem" }}>
                      Start a queued task from the dashboard to open a live session.
                    </div>
                    <button className="btn btn-primary" type="button" onClick={() => setScreen("dashboard")}>
                      Go to Dashboard
                    </button>
                  </div>
                )}

                {activeSession && (
                  <div className="grid-2">
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      <div className="glass glass-pink" style={{ padding: "28px 24px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                          <span className="chip chip-pink">{activeSession.businessName}</span>
                          <span className="chip chip-teal">Live</span>
                          <span className={`chip ${breakGlow ? "chip-sage" : "chip-cream"}`}>
                            <CozyIcon
                              icon={breakGlow ? Coffee : Activity}
                              size={14}
                              state={breakGlow ? "breakReady" : "idle"}
                              motion={breakGlow ? "glow" : "none"}
                              reducedMotion={reduceMotion}
                            />
                            {breakGlow ? "Break recommended" : "Pacing steady"}
                          </span>
                        </div>
                        <div className="card-heading" style={{ marginTop: 10 }}>{activeSession.taskTitle}</div>
                        <div style={{ fontSize: "0.78rem", opacity: 0.5, marginBottom: 4 }}>
                          {activeSession.plannedMinutes > 0
                            ? `${formatDuration(activeSession.plannedMinutes)} block`
                            : "Open-ended block"}
                        </div>

                        <div className="timer-display flex items-center justify-center gap-4">
                          <ClockIcon
                            size={40}
                            autoAnimate
                            className={breakGlow ? "text-[var(--cozy-mint)]" : "text-[var(--cozy-sky)]"}
                          />
                          {toClock(activeSession.plannedMinutes > 0 ? focusRemainingSeconds : focusElapsedSeconds)}
                        </div>
                        <div className="timer-sub">
                          {activeSession.plannedMinutes > 0
                            ? `${Math.max(0, Math.ceil(focusRemainingSeconds / 60))} min remaining`
                            : `${Math.floor(focusElapsedSeconds / 60)} min elapsed`}
                        </div>

                        <div style={{ marginBottom: 16 }}>
                          <div className="progress-track" style={{ height: 8 }}>
                            <div className="progress-fill fill-pink" style={{ width: `${focusProgressPct}%` }} />
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
                          <label style={{ fontSize: "0.78rem", opacity: 0.75 }}>Break nudge at:</label>
                          <select
                            value={breakThresholdMinutes}
                            onChange={(event) => setBreakThresholdMinutes(Number(event.target.value))}
                            className="btn btn-ghost btn-sm"
                            style={{ minWidth: 92 }}
                          >
                            <option value={90}>90m</option>
                            <option value={120}>120m</option>
                            <option value={150}>150m</option>
                          </select>
                          <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>
                            Worked: {activeSessionElapsedMinutes}m
                            {lastBreakAtMs ? ` · Last break ${Math.floor((Date.now() - lastBreakAtMs) / 60000)}m ago` : ""}
                          </span>
                        </div>

                        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            onClick={takeBreak}
                            disabled={breakActive}
                            title={breakActive ? `Break active — ${Math.ceil((breakActiveUntilMs! - timerNow) / 60000)}m remaining` : undefined}
                            style={{
                              boxShadow:
                                breakGlow && !reduceMotion
                                  ? "0 0 0.8rem rgba(75, 145, 88, 0.55)"
                                  : "none",
                              borderColor: breakGlow ? "rgba(75, 145, 88, 0.7)" : undefined,
                              opacity: breakActive ? 0.55 : 1,
                            }}
                          >
                            {breakActive
                              ? `Break — ${Math.ceil((breakActiveUntilMs! - timerNow) / 60000)}m left`
                              : "Take a Break"}
                          </button>
                          <button
                            className="btn btn-primary btn-sm"
                            type="button"
                            disabled={isCompleting}
                            onClick={() => void completeFocus(false)}
                          >
                            {isCompleting ? "Saving..." : "Complete"}
                          </button>
                        </div>
                      </div>

                      <div className="glass glass-sage" style={{ padding: 20 }}>
                        <div className="card-title">Capture Outcomes</div>
                        <textarea
                          className="outcome-field"
                          placeholder="What did you get done?"
                          value={outcomes}
                          onChange={(event) => setOutcomes(event.target.value)}
                        />
                        <textarea
                          className="outcome-field"
                          placeholder="Blockers / open questions"
                          value={blockers}
                          onChange={(event) => setBlockers(event.target.value)}
                        />
                        <textarea
                          className="outcome-field"
                          placeholder="Follow-ups to create in Notion (one line each)"
                          value={followUps}
                          onChange={(event) => setFollowUps(event.target.value)}
                        />
                        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                          <button className="btn btn-ghost btn-sm" type="button" style={{ flex: 1 }} disabled>
                            + Task to Notion
                          </button>
                          <button
                            className="btn btn-primary btn-sm"
                            type="button"
                            style={{ flex: 1 }}
                            disabled={isCompleting}
                            onClick={() => void completeFocus(needsConfirmation)}
                          >
                            {needsConfirmation ? "Confirm & Save" : "Save & Close"}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="glass" style={{ padding: 24, height: "fit-content" }}>
                      <div className="card-title">AI Workspace</div>
                      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                        <span className="chip chip-teal">Prime</span>
                        <span className="chip chip-cream">Librarian</span>
                        <span className="chip chip-cream">Worker</span>
                      </div>
                      <div style={{ fontSize: "0.78rem", opacity: 0.6, marginBottom: 10 }}>
                        NotebookLM pre-session brief (read-only)
                      </div>

                      {brief.loading && <div className="state-banner">Loading brief...</div>}
                      {!brief.loading && brief.error && (
                        <div className="state-banner error">
                          {brief.error.includes("MCP") || brief.error.includes("local") || brief.error.includes("browser") || brief.error.includes("runtime")
                            ? "NotebookLM brief is offline (MCP transport unavailable). Proceed with your top priority task from Focus Ops."
                            : `NotebookLM brief unavailable: ${brief.error}`}
                        </div>
                      )}
                      {!brief.loading && !brief.error && (
                        <div className="glass" style={{ padding: 14 }}>
                          <div className="brief-markdown">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              skipHtml
                              allowedElements={[...BRIEF_MARKDOWN_ALLOWED_ELEMENTS]}
                            >
                              {brief.text || "_No brief returned for this business yet._"}
                            </ReactMarkdown>
                          </div>
                          <div style={{ marginTop: 8, fontSize: "0.72rem", opacity: 0.55 }}>
                            Source: {brief.source || "unknown"}
                            {brief.fetchedAt ? ` · ${formatSyncLabel(brief.fetchedAt)}` : ""}
                          </div>
                        </div>
                      )}

                      <div style={{ marginTop: 12, fontSize: "0.76rem", opacity: 0.6, lineHeight: 1.5 }}>
                        Tool boundaries: Prime orchestrates, Librarian reads Notion/NotebookLM, Worker writes session updates with audit logs.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {screen === "agents" && (
              <div className="screen">
                <div className="screen-title">Agent Teams</div>
                <div className="screen-sub">Brand DNA operator is active: scan, plan, sync, and attention routing.</div>
                <div className="grid-2">
                  <div className="glass" style={{ padding: 24 }}>
                    <div className="card-title">Brand DNA Module</div>
                    <div style={{ fontSize: "0.82rem", opacity: 0.7, marginBottom: 10 }}>
                      Input company website URLs and refresh reusable brand profile context.
                    </div>

                    <select
                      className="sms-input"
                      value={selectedCompanyId}
                      onChange={(event) => setSelectedCompanyId(event.target.value)}
                      style={{ marginBottom: 10 }}
                    >
                      <option value="">Select company</option>
                      {(dashboard?.businesses ?? []).map((business) => (
                        <option key={business.id} value={business.id}>
                          {business.name}
                        </option>
                      ))}
                    </select>

                    <textarea
                      className="outcome-field"
                      placeholder="Website URLs (comma-separated)"
                      value={scanUrlsInput}
                      onChange={(event) => setScanUrlsInput(event.target.value)}
                    />

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        className="btn btn-primary btn-sm"
                        type="button"
                        onClick={() => void runBrandScan()}
                        disabled={brandScanLoading}
                      >
                        {brandScanLoading ? "Working..." : "Scan Brand DNA"}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        type="button"
                        onClick={() => void generateWeeklyPlan()}
                        disabled={brandScanLoading}
                      >
                        Generate Week Plan
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        type="button"
                        onClick={() => void syncWeekToNotion()}
                        disabled={brandScanLoading}
                      >
                        Sync Week to Notion
                      </button>
                    </div>

                    {brandMessage && <div className="state-banner" style={{ marginTop: 10 }}>{brandMessage}</div>}

                    {brandProfile && (
                      <div className="glass" style={{ marginTop: 12, padding: 14 }}>
                        <div className="card-title" style={{ marginBottom: 6 }}>
                          {brandProfile.companyName}
                        </div>
                        <div style={{ fontSize: "0.82rem", marginBottom: 6 }}>
                          <strong>Voice:</strong> {brandProfile.brandVoice}
                        </div>
                        <div style={{ fontSize: "0.82rem", marginBottom: 6 }}>
                          <strong>Pillars:</strong> {brandProfile.pillars.join(", ")}
                        </div>
                        <div style={{ fontSize: "0.82rem", marginBottom: 6 }}>
                          <strong>Tone:</strong> {brandProfile.tone.join(", ")}
                        </div>
                        <div style={{ fontSize: "0.8rem", opacity: 0.75 }}>{brandProfile.summary}</div>
                      </div>
                    )}
                  </div>

                  <div className="glass" style={{ padding: 24 }}>
                    <div className="card-title">Operator Architecture</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                      <button
                        type="button"
                        className={`chip ${operatorModule === "scanner" ? "chip-teal" : "chip-cream"}`}
                        onClick={() => setOperatorModule("scanner")}
                      >
                        Site Scanner
                      </button>
                      <button
                        type="button"
                        className={`chip ${operatorModule === "assets" ? "chip-teal" : "chip-cream"}`}
                        onClick={() => setOperatorModule("assets")}
                      >
                        Asset Curator
                      </button>
                      <button
                        type="button"
                        className={`chip ${operatorModule === "planner" ? "chip-teal" : "chip-cream"}`}
                        onClick={() => setOperatorModule("planner")}
                      >
                        Content Planner
                      </button>
                      <button
                        type="button"
                        className={`chip ${operatorModule === "sync" ? "chip-teal" : "chip-cream"}`}
                        onClick={() => setOperatorModule("sync")}
                      >
                        Notion Sync
                      </button>
                      <button
                        type="button"
                        className={`chip ${operatorModule === "attention" ? "chip-pink" : "chip-cream"}`}
                        onClick={() => setOperatorModule("attention")}
                      >
                        Attention
                      </button>
                    </div>
                    <div style={{ fontSize: "0.85rem", lineHeight: 1.6 }}>
                      {operatorModule === "scanner" &&
                        "Scanner extracts brand DNA from public pages and turns noisy URLs into reusable profile context for downstream agents."}
                      {operatorModule === "assets" &&
                        "Asset Curator organizes source links and reusable context snippets so specialists can work from consistent inputs."}
                      {operatorModule === "planner" &&
                        "Content Planner creates platform-ready weekly requirements and makes task recommendations from brand goals."}
                      {operatorModule === "sync" &&
                        "Notion Sync writes structured tasks/content and enforces status + tracking consistency across work queues."}
                      {operatorModule === "attention" &&
                        "Attention agent surfaces due today, overdue, coverage gaps, and legal/admin risks to prioritize execution."}
                    </div>
                    <div style={{ marginTop: 12, fontSize: "0.78rem", opacity: 0.7 }}>
                      Content flow: Idea → Drafting → Ready → Scheduled → Posted
                    </div>
                  </div>
                </div>

                <div className="agent-console-grid" style={{ marginTop: 18 }}>
                  <div className="glass agent-chat-card" style={{ padding: 24 }}>
                    <div className="card-title">Agent Chat Console</div>
                    <div className="agent-console-header">
                      <div className="kawaii-agent-avatar" aria-hidden="true">
                        <KawaiiAgentBubbleIcon className="kawaii-agent-icon" />
                      </div>
                      <div>
                        <div className="task-name">Prime Assistant</div>
                        <div className="task-biz">Chat here to brief Prime, route tasks, or ask for status updates.</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 10, marginBottom: 10, flexWrap: "wrap" }}>
                      <span className="chip chip-teal">Prime online</span>
                      <span className="chip chip-cream">
                        <Image
                          src="/agent-icons/agent-research.jpeg"
                          alt=""
                          aria-hidden="true"
                          width={16}
                          height={16}
                          className="chip-avatar"
                        />
                        Librarian standby
                      </span>
                      <span className="chip chip-cream">
                        <Image
                          src="/agent-icons/agent-ops.jpeg"
                          alt=""
                          aria-hidden="true"
                          width={16}
                          height={16}
                          className="chip-avatar"
                        />
                        Worker standby
                      </span>
                    </div>
                    <div className="special-agent-grid">
                      {SPECIAL_AGENTS.map((agent) => (
                        <div
                          key={agent.id}
                          className="special-agent-card"
                          title={`${agent.name}`}
                        >
                          <div className="special-agent-row">
                            <span className="special-agent-title-wrap">
                              <Image
                                src={agent.icon}
                                alt=""
                                width={28}
                                height={28}
                                className="special-agent-icon"
                              />
                              <span className="task-name">{agent.name}</span>
                            </span>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                type="button"
                                className="chip chip-cream"
                                onClick={() => setSelectedSpecialAgent(agent)}
                              >
                                Details
                              </button>
                              <button
                                type="button"
                                className="chip chip-sage"
                                onClick={() => void runSpecialAgent(agent)}
                                disabled={chatLoading}
                              >
                                Run
                              </button>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="special-agent-description"
                            style={{ textAlign: "left", width: "100%", cursor: "pointer" }}
                            onClick={() => setSelectedSpecialAgent(agent)}
                          >
                            {agent.description}
                          </button>
                        </div>
                      ))}
                    </div>
                    {selectedSpecialAgent && (
                      <div className="glass" style={{ marginTop: 10, padding: 12 }}>
                        <div className="special-agent-row" style={{ marginBottom: 8 }}>
                          <div className="task-name">{selectedSpecialAgent.name}</div>
                          <button
                            type="button"
                            className="chip chip-cream"
                            onClick={() => setSelectedSpecialAgent(null)}
                          >
                            Close
                          </button>
                        </div>
                        <div className="task-biz" style={{ marginBottom: 8 }}>
                          {selectedSpecialAgent.description}
                        </div>
                        <div style={{ fontSize: "0.78rem", opacity: 0.8, marginBottom: 8 }}>
                          Prompt: {selectedSpecialAgent.prompt}
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => void runSpecialAgent(selectedSpecialAgent)}
                          disabled={chatLoading}
                        >
                          Run {selectedSpecialAgent.name}
                        </button>
                      </div>
                    )}

                    <div className="chat-messages chat-messages-panel">
                      {chatMessages.length === 0 && (
                        <div style={{ textAlign: "center", opacity: 0.55, fontSize: "0.82rem", marginTop: 20 }}>
                          Start a chat with Prime. Example: &quot;Plan my next company focus day and queue tasks.&quot;
                        </div>
                      )}
                      {chatMessages.map((msg, i) => (
                        <div
                          key={i}
                          className={`chat-line ${msg.role === "user" ? "chat-line-user" : "chat-line-agent"}`}
                        >
                          {msg.role === "agent" && (
                            <span className="mini-kawaii-avatar" aria-hidden="true">
                              <KawaiiAgentBubbleIcon className="kawaii-agent-icon" />
                            </span>
                          )}
                          <div className={`chat-bubble ${msg.role === "user" ? "user-bubble" : "agent-bubble"}`}>
                            {msg.text}
                          </div>
                        </div>
                      ))}
                      {chatLoading && (
                        <div className="chat-line chat-line-agent">
                          <span className="mini-kawaii-avatar" aria-hidden="true">
                            <KawaiiAgentBubbleIcon className="kawaii-agent-icon" />
                          </span>
                          <div className="chat-bubble agent-bubble typing-indicator">
                            <span>.</span><span>.</span><span>.</span>
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    <div className="chat-input-area">
                      <input
                        type="text"
                        className="chat-input"
                        placeholder="Message Prime..."
                        value={currentChatInput}
                        onChange={(e) => setCurrentChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            void handleSendMessage();
                          }
                        }}
                      />
                      <button
                        className="btn btn-primary btn-sm chat-send-btn"
                        onClick={() => void handleSendMessage()}
                        disabled={chatLoading || !currentChatInput.trim()}
                      >
                        Send
                      </button>
                    </div>
                  </div>

                  <div className="glass agent-work-card" style={{ padding: 24 }}>
                    <div className="card-title">Agent Work Monitor</div>
                    <div className="agent-work-header">
                      <div className="task-biz">Live execution status</div>
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => void loadRouterRuns()}>
                        Refresh
                      </button>
                    </div>
                    <div className="glass" style={{ padding: 10, marginBottom: 10 }}>
                      <div className="card-title" style={{ marginBottom: 8 }}>Activity Board</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                        <span className="chip chip-sage">Active {activityBoard.active}</span>
                        <span className="chip chip-cream">Waiting {activityBoard.waiting}</span>
                        <span className="chip chip-teal">Completed {activityBoard.completed}</span>
                        <span className="chip chip-pink">Failed {activityBoard.failed}</span>
                      </div>
                      {activityBoard.recent.map((entry) => (
                        <div key={entry.id} className="task-biz" style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>{entry.label}</span>
                          <span>{entry.at}</span>
                        </div>
                      ))}
                    </div>

                    {routerRuns.length === 0 && (
                      <div className="task-biz" style={{ marginBottom: 14 }}>
                        No active routed runs yet.
                      </div>
                    )}
                    {routerRuns.slice(0, 6).map((run) => (
                      <div className="agent-work-row" key={run.runId}>
                        <div style={{ flex: 1 }}>
                          <div className="task-name">
                            {routerConnectorLabel(run.connector)}
                          </div>
                          <div className="task-biz">{new Date(run.createdAt).toLocaleString()}</div>
                          {run.error && <div style={{ fontSize: "0.75rem", color: "var(--pink)" }}>{run.error}</div>}
                        </div>
                        <span
                          className={
                            run.status === "dispatched"
                              ? "chip chip-sage"
                              : run.status === "completed"
                                ? "chip chip-teal"
                                : run.status === "waiting"
                                  ? "chip chip-cream"
                                  : "chip chip-pink"
                          }
                        >
                          {run.status}
                        </span>
                      </div>
                    ))}

                    <div className="card-title" style={{ marginTop: 16 }}>Attention Queue</div>
                    {attentionItems.length === 0 && <div className="task-biz">No immediate attention events.</div>}
                    {attentionItems.slice(0, 4).map((item) => (
                      <div className="agent-work-row" key={item.id}>
                        <div style={{ flex: 1 }}>
                          <div className="task-name">{item.title}</div>
                          <div className="task-biz">{item.detail}</div>
                        </div>
                        <span className={severityChip(item.severity)}>{item.severity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {screen === "news" && (
              <div className="screen">
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <div>
                    <div className="screen-title">News &amp; Signals</div>
                    <div className="screen-sub">Threat Intel + AI official updates + Agent ecosystem changes.</div>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    onClick={() => void loadNewsSignals(true)}
                    disabled={newsLoading}
                  >
                    {newsLoading ? "Refreshing..." : "Manual Refresh"}
                  </button>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  <button className={`chip ${newsFilter === "all" ? "chip-pink" : "chip-cream"}`} type="button" onClick={() => setNewsFilter("all")}>
                    All
                  </button>
                  <button className={`chip ${newsFilter === "threat" ? "chip-pink" : "chip-cream"}`} type="button" onClick={() => setNewsFilter("threat")}>
                    Threat
                  </button>
                  <button className={`chip ${newsFilter === "ai" ? "chip-pink" : "chip-cream"}`} type="button" onClick={() => setNewsFilter("ai")}>
                    AI
                  </button>
                  <button className={`chip ${newsFilter === "agents" ? "chip-pink" : "chip-cream"}`} type="button" onClick={() => setNewsFilter("agents")}>
                    Agents
                  </button>
                </div>

                {newsUpdatedAt && (
                  <div className="sync-bar" style={{ marginBottom: 10 }}>
                    <div className="sync-dot" />
                    Cached feed updated {formatSyncLabel(newsUpdatedAt)}
                  </div>
                )}

                {newsHealth && newsHealth.length > 0 && (
                  <div className="glass source-health-card">
                    <h3 className="source-health-title">Source Health</h3>
                    <div className="source-health-grid">
                      {newsHealth.map(s => (
                        <div key={s.source} className="source-health-item">
                          <CozyIcon
                            icon={s.status === "ok" ? Activity : AlertCircle}
                            size={16}
                            state={s.status === "ok" ? "success" : "warning"}
                            motion={s.status === "ok" ? "none" : "breathe"}
                          />
                          <span className="source-health-name">{s.source}</span>
                          <span className="source-health-latency">{s.latencyMs}ms</span>
                          {s.status === "error" && s.message && (
                            <span className="source-health-error" title={s.message}>Issue</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {newsError && <div className="state-banner error">{newsError}</div>}
                {newsLoading && <div className="state-banner">Loading feed...</div>}

                {!newsLoading && filteredNewsItems.length === 0 && (
                  <div className="glass placeholder-card">No signal items available.</div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {filteredNewsItems.map((item) => (
                    <div className="glass" style={{ padding: 20 }} key={item.id}>
                      {(() => {
                        const showFullSummary = expandedNewsIds.includes(item.id);
                        const safeSummary = sanitizeUiText(item.summary);
                        const safeFullSummary = sanitizeUiText(item.fullSummary || item.summary);
                        const safeWhyItMatters = sanitizeUiText(item.whyItMatters);
                        const displaySummary = showFullSummary ? safeFullSummary : safeSummary;
                        const previewComparable = safeSummary.replace(/^•\s?/gm, "").trim();
                        const fullComparable = safeFullSummary.trim();
                        const canExpand =
                          item.isTruncated ||
                          fullComparable.length > previewComparable.length + 40 ||
                          safeSummary.length > 200;
                        return (
                          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                            <div style={{ flex: "1 1 300px" }}>
                              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                                <span className="chip chip-teal">{item.category}</span>
                                <span className="chip chip-cream">{item.source}</span>
                              </div>
                              <h3 className="card-heading" style={{ marginBottom: 8, fontSize: "1.05rem", lineHeight: 1.3 }}>
                                {item.title}
                              </h3>
                              <p
                                style={{
                                  opacity: 0.85,
                                  marginBottom: 12,
                                  whiteSpace: "pre-line",
                                  wordBreak: "break-word",
                                  overflowWrap: "anywhere",
                                }}
                              >
                                {displaySummary}
                              </p>
                              {canExpand && (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  type="button"
                                  onClick={() => toggleExpandedNews(item.id)}
                                  style={{ marginBottom: 12 }}
                                >
                                  {showFullSummary ? "Show less" : "Read more"}
                                </button>
                              )}
                              <div style={{ fontSize: "0.8rem", backgroundColor: "var(--white-t50)", padding: "10px 14px", borderRadius: 8, borderLeft: "3px solid var(--pink)" }}>
                                <strong>Why it matters:</strong> {safeWhyItMatters}
                              </div>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10, minWidth: 140 }}>
                              <div className="chip chip-sage" style={{ fontSize: "0.8rem", alignSelf: "stretch", justifyContent: "center" }}>
                                Score {item.relevanceScore}
                              </div>
                              <button
                                className="btn btn-primary btn-sm"
                                type="button"
                                style={{ width: "100%", padding: "8px 0" }}
                                onClick={() => void saveNewsSignalToNotion(item.id)}
                                disabled={newsSaveLoadingId === item.id}
                              >
                                {newsSaveLoadingId === item.id ? "Saving..." : "Save to Notion"}
                              </button>
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-ghost btn-sm"
                                style={{ textDecoration: "none", width: "100%", textAlign: "center", padding: "8px 0" }}
                              >
                                Open Source
                              </a>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {screen === "notifications" && (
              <div className="screen">
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <div>
                    <div className="screen-title">Inbox</div>
                    <div className="screen-sub">Agent Notes Inbox, router status, and attention queue.</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => void loadAttentionQueue()}>
                    Refresh
                  </button>
                </div>

                <div className="glass" style={{ padding: 20, marginBottom: 14 }}>
                  <div className="card-title">Wake-Up Alarm (Mobile)</div>
                  <div className="task-biz" style={{ marginBottom: 10 }}>
                    Daily gentle reminder with goal-aware message switching at $10,000/month.
                  </div>
                  <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ fontSize: "0.78rem", opacity: 0.75 }}>Alarm time</span>
                      <input
                        type="time"
                        value={wakeAlarm.time}
                        onChange={(event) =>
                          setWakeAlarm((prev) => ({ ...prev, time: event.target.value || "07:00" }))
                        }
                        className="outcome-field"
                        style={{ marginBottom: 0, minHeight: 42 }}
                      />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ fontSize: "0.78rem", opacity: 0.75 }}>Monthly earnings (USD)</span>
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={wakeAlarm.monthlyEarningsUsd}
                        onChange={(event) => {
                          const parsed = Number(event.target.value);
                          setWakeAlarm((prev) => ({
                            ...prev,
                            monthlyEarningsUsd:
                              Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0,
                          }));
                        }}
                        className="outcome-field"
                        style={{ marginBottom: 0, minHeight: 42 }}
                      />
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    <button
                      className="btn btn-primary btn-sm"
                      type="button"
                      onClick={() => setWakeAlarm((prev) => ({ ...prev, enabled: true }))}
                    >
                      {wakeAlarm.enabled ? "Alarm Enabled" : "Enable Alarm"}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      onClick={() => setWakeAlarm((prev) => ({ ...prev, enabled: false }))}
                    >
                      Disable
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      onClick={() =>
                        setWakeAlarm({
                          enabled: false,
                          time: "07:00",
                          monthlyEarningsUsd: 0,
                          lastTriggeredDate: "",
                        })
                      }
                    >
                      Delete Alarm
                    </button>
                  </div>
                  <div style={{ fontSize: "0.76rem", opacity: 0.7, marginTop: 8 }}>
                    Next message preview: {buildWakeMessage(wakeAlarm.monthlyEarningsUsd)}
                  </div>
                  <div style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 4 }}>
                    Status: {wakeAlarm.enabled ? `Enabled at ${wakeAlarm.time}` : "Disabled"}
                    {wakeAlarm.lastTriggeredDate ? ` · last triggered ${wakeAlarm.lastTriggeredDate}` : ""}
                  </div>
                </div>

                <div className="glass" style={{ padding: 20, marginBottom: 14 }}>
                  <div className="card-title">Create Notion Ticket</div>
                  <textarea
                    className="outcome-field"
                    placeholder="Write the task note here. Keep it simple; labels are set by the buttons."
                    value={noteInput}
                    onChange={(event) => setNoteInput(event.target.value)}
                  />
                  <div className="notion-toggle-row">
                    <button
                      className={`notion-toggle ${ticketForAgent ? "is-active" : ""}`}
                      type="button"
                      onClick={() => setTicketForAgent((prev) => !prev)}
                    >
                      Is this for an agent
                    </button>
                    <button
                      className={`notion-toggle ${ticketUrgent ? "is-active" : ""}`}
                      type="button"
                      onClick={() => setTicketUrgent((prev) => !prev)}
                    >
                      Is this urgent
                    </button>
                    <button
                      className={`notion-toggle ${ticketBlocked ? "is-active" : ""}`}
                      type="button"
                      onClick={() => setTicketBlocked((prev) => !prev)}
                    >
                      Is this blocked
                    </button>
                    <button
                      className={`notion-toggle ${ticketNeedsFollowUp ? "is-active" : ""}`}
                      type="button"
                      onClick={() => setTicketNeedsFollowUp((prev) => !prev)}
                    >
                      Needs follow-up
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      className="btn btn-primary btn-sm"
                      type="button"
                      onClick={() => void captureInboxNote()}
                      disabled={runsLoading}
                    >
                      {runsLoading ? "Processing..." : "Capture + Route"}
                    </button>
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => void writeDailySummary()}>
                      Write Daily Summary
                    </button>
                  </div>
                  {noteMessage && <div className="state-banner" style={{ marginTop: 8 }}>{noteMessage}</div>}
                </div>

                {attentionWeek && (
                  <div className="sync-bar">
                    <div className="sync-dot" />
                    Weekly operator window: {attentionWeek}
                  </div>
                )}

                {attentionLoading && <div className="state-banner">Loading attention queue...</div>}
                {!attentionLoading && attentionError && <div className="state-banner error">{attentionError}</div>}

                {!attentionLoading && !attentionError && (
                  <div className="grid-2">
                    <div className="glass" style={{ padding: 24 }}>
                      <div className="card-title">Attention Events</div>
                      {attentionItems.length === 0 && (
                        <div className="task-biz">No active attention events.</div>
                      )}
                      {attentionItems.map((item) => (
                        <div className="task-row" key={item.id}>
                          <div style={{ flex: 1 }}>
                            <div className="task-name">{item.title}</div>
                            <div className="task-biz">{item.detail}</div>
                            <div style={{ fontSize: "0.76rem", opacity: 0.75, marginTop: 2 }}>
                              Action: {item.action}
                            </div>
                          </div>
                          <span className={`chip flex items-center justify-center gap-1.5 ${severityChip(item.severity)}`}>
                            <CozyIcon
                              icon={item.severity === "high" ? AlertCircle : Activity}
                              size={14}
                              state={item.severity === "high" ? "warning" : "focus"}
                              motion={item.severity === "high" ? "wiggle" : "float"}
                              reducedMotion={reduceMotion}
                            />
                            {item.severity}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="glass" style={{ padding: 24 }}>
                      <div className="card-title">Weekly Coverage Gaps</div>
                      {coverageItems.length === 0 && <div className="task-biz">No coverage data yet.</div>}
                      {coverageItems.map((row) => (
                        <div className="behind-row" key={row.companyId}>
                          <div style={{ flex: 1 }}>
                            <div className="behind-name">{row.companyName}</div>
                            <div className="behind-gap">
                              Planned {row.planned} / Required {row.required}
                            </div>
                          </div>
                          <span className={row.gap > 0 ? "chip chip-pink" : "chip chip-sage"}>
                            {row.gap > 0 ? `Gap ${row.gap}` : "Covered"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="glass" style={{ padding: 20, marginTop: 16 }}>
                  <div className="card-title">Sub-Agent Router Runs</div>
                  {routerRuns.length === 0 && <div className="task-biz">No routed runs yet.</div>}
                  {routerRuns.slice(0, 8).map((run) => (
                    <div className="task-row" key={run.runId}>
                      <div style={{ flex: 1 }}>
                        <div className="task-name">{routerConnectorLabel(run.connector)}</div>
                        <div className="task-biz">{new Date(run.createdAt).toLocaleString()}</div>
                        {run.error && <div style={{ fontSize: "0.75rem", color: "var(--pink)" }}>{run.error}</div>}
                      </div>
                      <span
                        className={
                          run.status === "dispatched"
                            ? "chip chip-sage"
                            : run.status === "completed"
                              ? "chip chip-teal"
                              : run.status === "waiting"
                                ? "chip chip-cream"
                                : "chip chip-pink"
                        }
                      >
                        {run.status}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="glass placeholder-card" style={{ marginTop: 16 }}>
                  <div className="card-title">Signal Logs</div>
                  <div style={{ fontSize: "0.88rem", lineHeight: 1.6 }}>
                    Session and reminder writes append to `data/agent-audit-log.jsonl`; SMS log mode writes to `data/sms-outbox.jsonl`.
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {screen !== "agents" && !chatOpen && (
        <button
          className="floating-chat-trigger"
          onClick={() => setChatOpen(true)}
          title="Chat with Prime"
        >
          <div style={{ width: 32, height: 32 }}>
            <KawaiiAgentBubbleIcon className="kawaii-agent-icon" />
          </div>
        </button>
      )}

      {screen !== "agents" && chatOpen && (
        <div className="floating-chat-widget">
          <div className="floating-chat-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 24, height: 24 }}>
                <KawaiiAgentBubbleIcon className="kawaii-agent-icon" />
              </div>
              Prime Assistant
            </div>
            <button className="close-chat-btn" onClick={() => setChatOpen(false)}>
              &times;
            </button>
          </div>

          <div className="floating-messages">
            {chatMessages.length === 0 && (
              <div style={{ textAlign: "center", opacity: 0.6, fontSize: "0.85rem", marginTop: 20 }}>
                Start a chat with Prime.
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`chat-line ${msg.role === "user" ? "chat-line-user" : "chat-line-agent"}`}>
                <div className={`chat-bubble ${msg.role === "user" ? "user-bubble" : "agent-bubble"}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="chat-line chat-line-agent">
                <div className="chat-bubble agent-bubble typing-indicator">
                  <span>.</span><span>.</span><span>.</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="floating-input-area">
            <input
              type="text"
              className="chat-input"
              style={{ flex: 1, padding: "8px 12px", border: "1px solid var(--sand-t40)", borderRadius: 8 }}
              placeholder="Message Prime..."
              value={currentChatInput}
              onChange={(e) => setCurrentChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSendMessage();
              }}
            />
            <button
              className="btn btn-primary btn-sm chat-send-btn"
              onClick={() => void handleSendMessage()}
              disabled={chatLoading || !currentChatInput.trim()}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}
