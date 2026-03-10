import { mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";

import { AuditRecord } from "@/lib/types";
import { getFirebaseAdminFirestore } from "@/lib/firebase-admin";

const AUDIT_LOG_DIR = join(process.cwd(), "data");
const AUDIT_LOG_FILE = join(AUDIT_LOG_DIR, "agent-audit-log.jsonl");
const AUDIT_COLLECTION = "agent_audit_log";
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

async function writeToDisk(entry: AuditRecord): Promise<void> {
  await mkdir(AUDIT_LOG_DIR, { recursive: true });
  await appendFile(AUDIT_LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");
}

async function writeToFirestore(entry: AuditRecord): Promise<void> {
  const db = getFirebaseAdminFirestore();
  if (!db) {
    return;
  }
  const expiresAt = new Date(Date.now() + NINETY_DAYS_MS);
  await db.collection(AUDIT_COLLECTION).add({
    ...entry,
    createdAt: new Date(),
    expiresAt,
  });
}

export async function writeAuditLog(entry: AuditRecord): Promise<void> {
  const results = await Promise.allSettled([
    writeToDisk(entry),
    writeToFirestore(entry),
  ]);
  // Log any failures but don't throw — auditing must not block the caller
  for (const result of results) {
    if (result.status === "rejected") {
      console.warn("[audit-log] write failed:", result.reason);
    }
  }
}
