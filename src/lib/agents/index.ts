import { LibrarianAgent } from "@/lib/agents/librarian";
import { PrimeAgent } from "@/lib/agents/prime";
import { WorkerAgent } from "@/lib/agents/worker";
import { writeAuditLog } from "@/lib/audit-log";
import { createNotebookBriefService } from "@/lib/notebooklm-client";
import { createNotionDataService } from "@/lib/notion-client";
import { sendSessionStartReminder } from "@/lib/sms-reminders";
import { CompleteSessionInput } from "@/lib/types";

const notionService = createNotionDataService({
  token: process.env.NOTION_TOKEN,
  businessesDbId: process.env.NOTION_DATABASE_BUSINESSES_ID,
  tasksDbId: process.env.NOTION_DATABASE_TASKS_ID,
  projectsDbId: process.env.NOTION_DATABASE_PROJECTS_ID,
  sessionsDbId: process.env.NOTION_DATABASE_SESSIONS_ID,
});

const notebookService = createNotebookBriefService();

import { TriageAgent } from "@/lib/agents/triage";

import { AccountabilityAgent } from "@/lib/agents/accountability";

import { InboxLoadBalancerAgent } from "@/lib/agents/load-balancer";

const librarian = new LibrarianAgent(notionService, notebookService);
const worker = new WorkerAgent(notionService);
const prime = new PrimeAgent(librarian, worker);
export const triageAgent = new TriageAgent();
export const accountabilityAgent = new AccountabilityAgent();
export const inboxLoadBalancerAgent = new InboxLoadBalancerAgent();

export async function getDashboard() {
  return prime.buildDashboard();
}

export async function startSession(taskId: string) {
  const session = await prime.startSession(taskId);

  await writeAuditLog({
    timestamp: new Date().toISOString(),
    agent: "Worker",
    action: "focus_session_start",
    detail: `${session.businessName}: ${session.taskTitle}`,
    payload: {
      taskId: session.taskId,
      sessionId: session.id,
      plannedMinutes: session.plannedMinutes,
    },
  });

  try {
    await sendSessionStartReminder(session);
  } catch (error) {
    await writeAuditLog({
      timestamp: new Date().toISOString(),
      agent: "Worker",
      action: "sms_error",
      detail: "Failed to send session start reminder",
      payload: {
        taskId: session.taskId,
        sessionId: session.id,
        error: error instanceof Error ? error.message : "Unknown SMS error",
      },
    });
  }

  return session;
}

export async function completeSession(input: CompleteSessionInput) {
  const completed = await prime.completeSession(input);

  await writeAuditLog({
    timestamp: new Date().toISOString(),
    agent: "Worker",
    action: "focus_session_complete",
    detail: `Session ${input.sessionId} marked complete`,
    payload: {
      sessionId: input.sessionId,
      outcomesLength: input.outcomes.length,
      blockersLength: input.blockers.length,
      followUpsLength: input.followUps.length,
    },
  });

  return completed;
}

export async function completeTask(taskId: string) {
  await prime.completeTask(taskId);

  await writeAuditLog({
    timestamp: new Date().toISOString(),
    agent: "Worker",
    action: "task_complete",
    detail: `Task ${taskId} marked complete directly`,
    payload: {
      taskId: taskId,
    },
  });
}

export async function getNotebookBrief(businessId: string, businessName: string) {
  return prime.getBrief(businessId, businessName);
}
