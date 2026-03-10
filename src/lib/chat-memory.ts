import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

type MemoryRole = "user" | "assistant";

type ChatMemoryEntry = {
  timestamp: string;
  role: MemoryRole;
  text: string;
};

const DATA_DIR = join(process.cwd(), "data");
const CHAT_MEMORY_FILE = join(DATA_DIR, "prime-chat-memory.jsonl");

function normalizeText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

async function loadEntries(): Promise<ChatMemoryEntry[]> {
  try {
    const raw = await readFile(CHAT_MEMORY_FILE, "utf8");
    const entries = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as ChatMemoryEntry;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is ChatMemoryEntry => Boolean(entry));
    return entries;
  } catch {
    return [];
  }
}

async function appendEntry(entry: ChatMemoryEntry): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await appendFile(CHAT_MEMORY_FILE, `${JSON.stringify(entry)}\n`, "utf8");
}

export async function appendChatTurn(input: {
  userText: string;
  assistantText: string;
}): Promise<void> {
  const userText = normalizeText(input.userText);
  const assistantText = normalizeText(input.assistantText);
  if (!userText || !assistantText) {
    return;
  }

  const timestamp = new Date().toISOString();
  await appendEntry({
    timestamp,
    role: "user",
    text: userText.slice(0, 4000),
  });
  await appendEntry({
    timestamp,
    role: "assistant",
    text: assistantText.slice(0, 4000),
  });
}

export async function formatPrimeMemoryContext(limit = 12): Promise<string> {
  const entries = await loadEntries();
  if (entries.length === 0) {
    return "";
  }

  const clipped = entries.slice(-Math.max(2, limit));
  return clipped
    .map((entry) => `${entry.role === "user" ? "User" : "Prime"}: ${entry.text}`)
    .join("\n");
}

