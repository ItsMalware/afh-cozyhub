// @ts-nocheck
import { NextResponse } from "next/server";
import { routeExistingTask } from "@/lib/agent-notes";
import { appendChatTurn, formatPrimeMemoryContext } from "@/lib/chat-memory";
import {
  appendChatTurnToFirestore,
  loadRecentChatHistoryFromFirestore,
} from "@/lib/chat-history-firestore";

const SYSTEM_PROMPT =
  "You are Prime Assistant for AI Focus Hub. Keep responses concise, practical, and action-oriented for founder productivity. Offer concrete next actions when useful.";
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_CHAT_MODEL || "gemini-3.1-pro-preview";
const DEFAULT_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
const CHAT_TIMEOUT_MS = 60000;

type OpenAIChatContentPart = {
  type: string;
  text?: string;
};

type OpenAIChatPayload = {
  choices?: Array<{
    message?: {
      content?: string | OpenAIChatContentPart[];
    };
  }>;
};

type GeminiPayload = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

function fallbackReply(message: string): string {
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes("triage")) {
    return "Would you like me to run the Inbox triage agent on your tasks database? (You can trigger it in the agent inbox)";
  }
  if (lowerMessage.includes("hello") || lowerMessage.includes("hi")) {
    return "Hello! I am your AI Focus Hub agent. I can help coordinate your inbox flow, check pending tasks, or track your commitments. How can I assist you today?";
  }
  if (lowerMessage.includes("news")) {
    return "I'm pulling the latest news signals for you. Check the 'News & Signals' tab for the latest updates on threats and AI trends.";
  }
  return `I received your message: "${message}". Let me know if you want me to update Notion or schedule a focus block.`;
}

function extractChatContent(content: string | OpenAIChatContentPart[] | undefined): string {
  if (!content) {
    return "";
  }
  if (typeof content === "string") {
    return content.trim();
  }
  return content
    .map((part) => (part.type === "text" ? part.text ?? "" : ""))
    .join("")
    .trim();
}

function extractGeminiText(payload: GeminiPayload): string {
  return (
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? ""
  );
}

import { Client } from "@notionhq/client";
import { requireInternalToken } from "@/lib/api-auth";

function findPropertyKey(
  properties: Record<string, any>,
  predicate: (name: string, prop: any) => boolean,
): string | null {
  for (const [name, prop] of Object.entries(properties)) {
    if (predicate(name, prop)) {
      return name;
    }
  }
  return null;
}

function pickSelectOption(prop: any, preferred: string[]): string | null {
  if (!prop || prop.type !== "select") {
    return null;
  }
  const options = Array.isArray(prop.select?.options) ? prop.select.options : [];
  const names = options
    .map((opt: any) => (typeof opt?.name === "string" ? opt.name : ""))
    .filter(Boolean);
  for (const candidate of preferred) {
    const matched = names.find((name: string) => name.toLowerCase() === candidate.toLowerCase());
    if (matched) {
      return matched;
    }
  }
  return names[0] ?? null;
}

function pickStatusOption(prop: any, preferred: string[]): string | null {
  if (!prop || prop.type !== "status") {
    return null;
  }
  const options = Array.isArray(prop.status?.options) ? prop.status.options : [];
  const names = options
    .map((opt: any) => (typeof opt?.name === "string" ? opt.name : ""))
    .filter(Boolean);
  for (const candidate of preferred) {
    const matched = names.find((name: string) => name.toLowerCase() === candidate.toLowerCase());
    if (matched) {
      return matched;
    }
  }
  return names[0] ?? null;
}

function mapCategoryToTaskType(category: string): string {
  const value = category.toLowerCase();
  if (/fix|bug|code|dev|engineering|api|backend|frontend/.test(value)) return "Dev";
  if (/content|marketing|social|video|newsletter|copy/.test(value)) return "Content";
  if (/finance|budget|invoice/.test(value)) return "Finance";
  if (/admin|legal|ops/.test(value)) return "Ops";
  return "Ops";
}

function mapCategoryToRoutingTask(category: string): "dev" | "workflow" | "content" | "legal_admin" | "general" {
  const value = category.toLowerCase();
  if (/fix|bug|code|dev|engineering|api|backend|frontend/.test(value)) return "dev";
  if (/workflow|automation|pipeline|antigravity/.test(value)) return "workflow";
  if (/content|marketing|social|video|newsletter|copy/.test(value)) return "content";
  if (/legal|admin|tax|ein|license|compliance|contract|ops/.test(value)) return "legal_admin";
  return "general";
}

// Tool 1: Create a Notion Ticket
const createNotionTicketTool = {
  functionDeclarations: [
    {
      name: "create_notion_task",
      description: "Creates a new task/ticket in the user's Notion database. Call this when the user explicitly asks to 'create a ticket', 'add a task', or 'remind me to' do something.",
      parameters: {
        type: "OBJECT",
        properties: {
          title: {
            type: "STRING",
            description: "The main title/name of the task to be created.",
          },
          category: {
            type: "STRING",
            description: "An optional category or functional area for the task (e.g., 'Engineering', 'Marketing', 'Fix'). Defaults to 'General' if unclear.",
          },
          plannedMinutes: {
            type: "INTEGER",
            description: "The estimated time to complete the task in minutes. Defaults to 30 if not specified.",
          }
        },
        required: ["title"],
      },
    },
  ],
};

async function handleFunctionCall(functionCall: any): Promise<string> {
  if (functionCall.name === "create_notion_task") {
    const { category = "General", plannedMinutes = 30 } = functionCall.args;
    let { title } = functionCall.args;
    if (!title.startsWith("[Agent]")) {
      title = `[Agent] ${title}`;
    }

    // Use the exact environment ID since the app correctly reads tasks from it
    const targetDbId = process.env.NOTION_DATABASE_TASKS_ID;
    const notionToken = process.env.NOTION_TOKEN;

    if (!notionToken || !targetDbId) {
      return "I tried to create the ticket, but I am missing the Notion API token or Database ID in my environment.";
    }

    try {
      const notion = new Client({ auth: notionToken });

      const db: any = await notion.dataSources.retrieve({ data_source_id: targetDbId });
      const properties = db.properties || {};
      const titleKey =
        findPropertyKey(properties, (_k, prop) => prop?.type === "title") || "Name";
      const statusKey = findPropertyKey(
        properties,
        (k, prop) => prop?.type === "status" || (prop?.type === "select" && k.toLowerCase().includes("status")),
      );
      const queueLabelKey = findPropertyKey(
        properties,
        (k, prop) => prop?.type === "select" && (k.toLowerCase().includes("queue") || k.toLowerCase().includes("label")),
      );
      const taskTypeKey = findPropertyKey(
        properties,
        (k, prop) => prop?.type === "select" && k.toLowerCase().includes("task type"),
      );
      const priorityKey = findPropertyKey(
        properties,
        (k, prop) => prop?.type === "select" && k.toLowerCase().includes("priority"),
      );
      const dueDateKey = findPropertyKey(
        properties,
        (k, prop) => prop?.type === "date" && k.toLowerCase().includes("due"),
      );
      const hoursKey = findPropertyKey(
        properties,
        (k, prop) => prop?.type === "number" && (k.toLowerCase().includes("hours_cmmd_hub") || k.toLowerCase() === "hours"),
      );

      const pageProps: any = {
        [titleKey]: {
          title: [
            { text: { content: title } },
          ],
        }
      };

      if (statusKey) {
        if (properties[statusKey].type === "status") {
          const statusName = pickStatusOption(properties[statusKey], ["This Week", "Backlog", "Waiting"]);
          if (statusName) {
            pageProps[statusKey] = { status: { name: statusName } };
          }
        } else {
          const statusName = pickSelectOption(properties[statusKey], ["This Week", "Backlog", "Waiting"]);
          if (statusName) {
            pageProps[statusKey] = { select: { name: statusName } };
          }
        }
      }

      if (queueLabelKey) {
        const queueName = pickSelectOption(properties[queueLabelKey], ["Agent Inbox", "Founder To-Do"]);
        if (queueName) {
          pageProps[queueLabelKey] = { select: { name: queueName } };
        }
      }

      if (taskTypeKey) {
        const taskTypeName = pickSelectOption(properties[taskTypeKey], [mapCategoryToTaskType(category), "Ops", "General"]);
        if (taskTypeName) {
          pageProps[taskTypeKey] = { select: { name: taskTypeName } };
        }
      }

      if (priorityKey) {
        const priorityName = pickSelectOption(properties[priorityKey], ["High", "Urgent", "Medium", "Normal"]);
        if (priorityName) {
          pageProps[priorityKey] = { select: { name: priorityName } };
        }
      }

      if (dueDateKey) {
        const due = new Date();
        due.setDate(due.getDate() + 2);
        pageProps[dueDateKey] = { date: { start: due.toISOString().slice(0, 10) } };
      }

      if (hoursKey) {
        const estimatedHours = Number((Math.max(0, Number(plannedMinutes) || 30) / 60).toFixed(2));
        pageProps[hoursKey] = { number: estimatedHours };
      }

      const created = await notion.pages.create({
        parent: { data_source_id: targetDbId },
        properties: pageProps,
      } as any);

      const routedRun = await routeExistingTask({
        note: title,
        notionTask: {
          pageId: created.id,
          url: (created as { url?: string }).url ?? "",
          title,
        },
        taskType: mapCategoryToRoutingTask(category),
        isForAgent: true,
      });

      if (routedRun) {
        const statusNote =
          routedRun.status === "dispatched"
            ? "Connector accepted the run."
            : `Run queued: ${routedRun.error ?? "connector not currently active"}.`;
        return `Successfully created and routed ticket: "${title}" (${plannedMinutes} mins, ${Number((plannedMinutes / 60).toFixed(2))}h SME estimate) via ${routedRun.connector}, run ${routedRun.runId}. ${statusNote}`;
      }
      return `Successfully created ticket: "${title}" (${plannedMinutes} mins, ${Number((plannedMinutes / 60).toFixed(2))}h SME estimate). No connector route matched.`;
    } catch (error: any) {
      console.error("Failed to execute create_notion_task:", error);
      return `I encountered an error trying to create the ticket in Notion: ${error.message}`;
    }
  }

  return "I don't know how to perform that action yet.";
}

async function getGeminiReply(message: string, memoryContext: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

  try {
    const model = DEFAULT_GEMINI_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: memoryContext
                ? `${SYSTEM_PROMPT}\n\nConversation memory (recent turns):\n${memoryContext}`
                : SYSTEM_PROMPT,
            },
          ],
        },
        tools: [createNotionTicketTool],
        contents: [
          {
            role: "user",
            parts: [{ text: message }],
          },
        ],
        generationConfig: {
          temperature: 0.4,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const raw = await response.text();
      console.error(`Gemini chat request failed (${response.status}): ${raw}`);
      return null;
    }

    const payload = await response.json() as any;

    // Check if the model decided to call a function instead of returning text
    const partsArray = payload.candidates?.[0]?.content?.parts ?? [];
    const functionCallPart = partsArray.find((p: any) => p.functionCall);

    if (functionCallPart) {
      const functionResult = await handleFunctionCall(functionCallPart.functionCall);
      return functionResult;
    }

    // Otherwise, return standard text
    const text = extractGeminiText(payload);
    return text || null;
  } catch (error) {
    console.error("Gemini chat request error", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function getOpenAIReply(message: string, memoryContext: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_CHAT_MODEL,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
          ...(memoryContext
            ? [
                {
                  role: "system" as const,
                  content: `Conversation memory (recent turns):\n${memoryContext}`,
                },
              ]
            : []),
          {
            role: "user",
            content: message,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const raw = await response.text();
      console.error(`OpenAI chat request failed (${response.status}): ${raw}`);
      return null;
    }

    const payload = (await response.json()) as OpenAIChatPayload;
    const content = extractChatContent(payload.choices?.[0]?.message?.content);
    return content || null;
  } catch (error) {
    console.error("OpenAI chat request error", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(req: Request) {
  try {
    const auth = requireInternalToken(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const messages = await loadRecentChatHistoryFromFirestore(300);
    return NextResponse.json({ messages }, { status: 200 });
  } catch (error) {
    console.error("Unable to load chat history from Firestore", error);
    return NextResponse.json({ messages: [] }, { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = requireInternalToken(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const payload = (await req.json()) as { message?: unknown };
    const message = typeof payload.message === "string" ? payload.message.trim() : "";

    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
    const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);
    const anyProviderConfigured = geminiConfigured || openaiConfigured;

    if (!anyProviderConfigured) {
      return NextResponse.json(
        {
          reply:
            "AI provider is not configured. Add GEMINI_API_KEY or OPENAI_API_KEY in environment settings.",
          source: "config",
        },
        { status: 200 },
      );
    }

    const memoryContext = await formatPrimeMemoryContext(14);
    const geminiReply = geminiConfigured ? await getGeminiReply(message, memoryContext) : null;
    const openAiReply = geminiReply
      ? null
      : openaiConfigured
        ? await getOpenAIReply(message, memoryContext)
        : null;
    const aiReply = geminiReply ?? openAiReply;
    const source = geminiReply ? "gemini" : openAiReply ? "openai" : "fallback";
    const fallbackEnabled = process.env.ALLOW_CHAT_FALLBACK !== "false";
    const reply = aiReply
      ? aiReply
      : fallbackEnabled
        ? fallbackReply(message)
        : "I could not reach the configured AI provider right now. Please verify the API key and model settings.";

    const persistResults = await Promise.allSettled([
      appendChatTurn({
        userText: message,
        assistantText: reply,
      }),
      appendChatTurnToFirestore({
        userText: message,
        assistantText: reply,
      }),
    ]);
    if (persistResults.some((result) => result.status === "rejected")) {
      console.error(
        "Unable to persist prime chat memory",
        persistResults
          .filter((result): result is PromiseRejectedResult => result.status === "rejected")
          .map((result) => result.reason),
      );
    }

    return NextResponse.json(
      {
        reply,
        source,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Agent chat error", error);
    return NextResponse.json(
      {
        reply:
          "I am having trouble connecting right now. I can still create a task or continue in fallback mode.",
        source: "fallback",
      },
      { status: 200 },
    );
  }
}
