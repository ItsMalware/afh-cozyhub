import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";

import { writeAuditLog } from "@/lib/audit-log";
import { DashboardPayload, FocusSession } from "@/lib/types";

type ReminderState = {
  sessionStartSent: Record<string, string>;
  overdueSent: Record<string, string>;
  eodSentDates: Record<string, string>;
};

type ReminderEvent = {
  type: "session_start" | "overdue" | "eod";
  status: "sent" | "skipped";
  detail: string;
};

const DATA_DIR = join(process.cwd(), "data");
const STATE_FILE = join(DATA_DIR, "sms-reminder-state.json");
const OUTBOX_FILE = join(DATA_DIR, "sms-outbox.jsonl");

const DEFAULT_STATE: ReminderState = {
  sessionStartSent: {},
  overdueSent: {},
  eodSentDates: {},
};

function parseRecipients(): string[] {
  const raw = process.env.SMS_TO ?? "";
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function isEnabled(): boolean {
  return process.env.SMS_ENABLED === "true";
}

function isTwilioProvider(): boolean {
  return process.env.SMS_PROVIDER?.toLowerCase() === "twilio";
}

function nowDateKey(timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function nowHourMinute(timeZone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

  return { hour, minute };
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function loadState(): Promise<ReminderState> {
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<ReminderState>;
    return {
      sessionStartSent: parsed.sessionStartSent ?? {},
      overdueSent: parsed.overdueSent ?? {},
      eodSentDates: parsed.eodSentDates ?? {},
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function saveState(state: ReminderState): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

async function appendOutbox(entry: Record<string, unknown>): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await appendFile(OUTBOX_FILE, `${JSON.stringify(entry)}\n`, "utf8");
}

async function sendViaTwilio(message: string, recipients: string[]): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;

  if (!accountSid || !authToken || !from) {
    throw new Error(
      "SMS provider is twilio but TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM are missing",
    );
  }

  for (const to of recipients) {
    const payload = new URLSearchParams({
      To: to,
      From: from,
      Body: message,
    });

    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: payload.toString(),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Twilio send failed (${response.status}): ${body}`);
    }
  }
}

async function sendSms(message: string, type: ReminderEvent["type"]): Promise<string> {
  if (!isEnabled()) {
    return "SMS disabled (SMS_ENABLED != true)";
  }

  const recipients = parseRecipients();
  if (recipients.length === 0) {
    return "SMS skipped (no SMS_TO recipients configured)";
  }

  if (isTwilioProvider()) {
    await sendViaTwilio(message, recipients);
    await writeAuditLog({
      timestamp: new Date().toISOString(),
      agent: "Worker",
      action: "sms_sent",
      detail: `${type} reminder sent via Twilio`,
      payload: {
        type,
        recipients,
        length: message.length,
      },
    });
    return `sent via twilio to ${recipients.length} recipient(s)`;
  }

  await appendOutbox({
    timestamp: new Date().toISOString(),
    type,
    recipients,
    message,
  });
  await writeAuditLog({
    timestamp: new Date().toISOString(),
    agent: "Worker",
    action: "sms_sent",
    detail: `${type} reminder recorded to local outbox`,
    payload: {
      type,
      recipients,
      length: message.length,
      outbox: OUTBOX_FILE,
    },
  });
  return `recorded to ${OUTBOX_FILE}`;
}

export async function sendSessionStartReminder(session: FocusSession): Promise<ReminderEvent> {
  const state = await loadState();
  if (state.sessionStartSent[session.id]) {
    return {
      type: "session_start",
      status: "skipped",
      detail: "already sent for this session",
    };
  }

  const message = [
    `Focus started: ${session.businessName}`,
    `${session.taskTitle}`,
    `${Math.max(0, Math.round(session.plannedMinutes))} min block`,
  ].join(" | ");

  const detail = await sendSms(message, "session_start");
  state.sessionStartSent[session.id] = new Date().toISOString();
  await saveState(state);

  return {
    type: "session_start",
    status: isEnabled() ? "sent" : "skipped",
    detail,
  };
}

export async function runReminderSweep(
  dashboard: DashboardPayload,
): Promise<{ events: ReminderEvent[] }> {
  const state = await loadState();
  const events: ReminderEvent[] = [];
  const now = Date.now();
  const tz = process.env.SMS_TIMEZONE ?? "America/New_York";

  const activeSession = dashboard.activeSession;
  if (activeSession && activeSession.status === "LIVE") {
    const startedAt = new Date(activeSession.startedAt).getTime();
    const elapsedMinutes = Math.max(0, (now - startedAt) / 60_000);
    const graceMinutes = parseNumber(process.env.SMS_OVERDUE_GRACE_MINUTES, 5);
    const overdueAfter = Math.max(0, activeSession.plannedMinutes) + graceMinutes;

    if (elapsedMinutes >= overdueAfter) {
      if (!state.overdueSent[activeSession.id]) {
        const message = [
          `Overdue focus block: ${activeSession.businessName}`,
          `${activeSession.taskTitle}`,
          `${Math.round(elapsedMinutes)} min elapsed`,
        ].join(" | ");
        const detail = await sendSms(message, "overdue");
        state.overdueSent[activeSession.id] = new Date().toISOString();
        events.push({ type: "overdue", status: isEnabled() ? "sent" : "skipped", detail });
      } else {
        events.push({
          type: "overdue",
          status: "skipped",
          detail: "already sent for this live session",
        });
      }
    } else {
      events.push({
        type: "overdue",
        status: "skipped",
        detail: `not overdue yet (${Math.round(elapsedMinutes)}m/${Math.round(overdueAfter)}m)`,
      });
    }
  } else {
    events.push({
      type: "overdue",
      status: "skipped",
      detail: "no live session",
    });
  }

  const cutoffHour = parseNumber(process.env.SMS_EOD_HOUR, 20);
  const cutoffMinute = parseNumber(process.env.SMS_EOD_MINUTE, 0);
  const nowLocal = nowHourMinute(tz);
  const dayKey = nowDateKey(tz);
  const isPastCutoff =
    nowLocal.hour > cutoffHour ||
    (nowLocal.hour === cutoffHour && nowLocal.minute >= cutoffMinute);

  if (!isPastCutoff) {
    events.push({
      type: "eod",
      status: "skipped",
      detail: `before EOD cutoff (${cutoffHour}:${cutoffMinute.toString().padStart(2, "0")} ${tz})`,
    });
  } else if (state.eodSentDates[dayKey]) {
    events.push({
      type: "eod",
      status: "skipped",
      detail: `already sent for ${dayKey}`,
    });
  } else {
    const completionPct =
      dashboard.totalPlannedMinutes > 0
        ? Math.round((dashboard.totalFocusedMinutes / dashboard.totalPlannedMinutes) * 100)
        : 0;
    const topBehind = dashboard.behindTargets[0];
    const gapText = topBehind
      ? `Top gap: ${topBehind.name} (${Math.abs(Math.round(topBehind.behindMinutes))}m behind)`
      : "All businesses on target";
    const message = [
      `EOD recap: ${completionPct}% complete`,
      `${dashboard.totalFocusedMinutes}/${dashboard.totalPlannedMinutes} focused mins`,
      gapText,
    ].join(" | ");
    const detail = await sendSms(message, "eod");
    state.eodSentDates[dayKey] = new Date().toISOString();
    events.push({ type: "eod", status: isEnabled() ? "sent" : "skipped", detail });
  }

  await saveState(state);
  return { events };
}
