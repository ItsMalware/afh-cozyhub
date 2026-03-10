import { getFirebaseAdminFirestore } from "@/lib/firebase-admin";

export type ChatHistoryRole = "user" | "agent";

export type ChatHistoryMessage = {
  role: ChatHistoryRole;
  text: string;
  timestamp: string;
};

const CHAT_HISTORY_COLLECTION = "prime_chat_history";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
let warnedFirestoreAuthError = false;

function firestoreChatHistoryEnabled(): boolean {
  return process.env.FIRESTORE_CHAT_HISTORY_ENABLED !== "false";
}

function normalizeText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export async function appendChatTurnToFirestore(input: {
  userText: string;
  assistantText: string;
}): Promise<void> {
  if (!firestoreChatHistoryEnabled()) {
    return;
  }

  const userText = normalizeText(input.userText);
  const assistantText = normalizeText(input.assistantText);
  if (!userText || !assistantText) {
    return;
  }

  const db = getFirebaseAdminFirestore();
  if (!db) {
    return;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + THIRTY_DAYS_MS);
  const batch = db.batch();
  const col = db.collection(CHAT_HISTORY_COLLECTION);

  batch.set(col.doc(), {
    role: "user",
    text: userText.slice(0, 4000),
    createdAt: now,
    expiresAt,
  });
  batch.set(col.doc(), {
    role: "agent",
    text: assistantText.slice(0, 4000),
    createdAt: now,
    expiresAt,
  });

  await batch.commit();
}

export async function loadRecentChatHistoryFromFirestore(limit = 300): Promise<ChatHistoryMessage[]> {
  if (!firestoreChatHistoryEnabled()) {
    return [];
  }

  const db = getFirebaseAdminFirestore();
  if (!db) {
    return [];
  }

  const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS);
  let snapshot;
  try {
    snapshot = await db
      .collection(CHAT_HISTORY_COLLECTION)
      .where("createdAt", ">=", thirtyDaysAgo)
      .orderBy("createdAt", "asc")
      .limit(Math.max(1, Math.min(limit, 1000)))
      .get();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("invalid_rapt")) {
      if (!warnedFirestoreAuthError) {
        warnedFirestoreAuthError = true;
        console.warn(
          "Firestore chat history disabled for this session due to Google reauth (invalid_rapt). Set FIRESTORE_CHAT_HISTORY_ENABLED=false to suppress this.",
        );
      }
      return [];
    }
    throw error;
  }

  const messages: ChatHistoryMessage[] = [];
  snapshot.docs.forEach((doc) => {
    const data = doc.data() as {
      role?: string;
      text?: string;
      createdAt?: { toDate?: () => Date } | string;
    };
    const role = data.role === "user" ? "user" : data.role === "agent" ? "agent" : null;
    const text = typeof data.text === "string" ? data.text.trim() : "";
    if (!role || !text) {
      return;
    }

    const createdAt = data.createdAt;
    const timestamp =
      typeof createdAt === "string"
        ? createdAt
        : typeof createdAt?.toDate === "function"
          ? createdAt.toDate().toISOString()
          : new Date().toISOString();

    messages.push({
      role,
      text,
      timestamp,
    });
  });

  return messages;
}
