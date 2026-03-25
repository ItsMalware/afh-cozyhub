import { LibrarianAgent } from "@/lib/agents/librarian";
import { PrimeAgent } from "@/lib/agents/prime";
import { WorkerAgent } from "@/lib/agents/worker";
import { writeAuditLog } from "@/lib/audit-log";
import { createNotebookBriefService } from "@/lib/notebooklm-client";
import { createNotionDataService } from "@/lib/notion-client";
import { sendSessionStartReminder } from "@/lib/sms-reminders";
import { CompleteSessionInput, NotionDataService } from "@/lib/types";

import { TriageAgent } from "@/lib/agents/triage";

import { AccountabilityAgent } from "@/lib/agents/accountability";

import { InboxLoadBalancerAgent } from "@/lib/agents/load-balancer";

const notebookService = createNotebookBriefService();
let notionService: NotionDataService | null = null;
let prime: PrimeAgent | null = null;
let triage: TriageAgent | null = null;
let accountability: AccountabilityAgent | null = null;
let inboxLoadBalancer: InboxLoadBalancerAgent | null = null;

function getNotionService(): NotionDataService {
  if (!notionService) {
    notionService = createNotionDataService({
      token: process.env.NOTION_TOKEN,
      businessesDbId: process.env.NOTION_DATABASE_BUSINESSES_ID,
      tasksDbId: process.env.NOTION_DATABASE_TASKS_ID,
      projectsDbId: process.env.NOTION_DATABASE_PROJECTS_ID,
      sessionsDbId: process.env.NOTION_DATABASE_SESSIONS_ID,
    });
  }

  return notionService;
}

function getPrimeAgent(): PrimeAgent {
  if (!prime) {
    const service = getNotionService();
    const librarian = new LibrarianAgent(service, notebookService);
    const worker = new WorkerAgent(service);
    prime = new PrimeAgent(librarian, worker);
  }

  return prime;
}

function getTriageAgent(): TriageAgent {
  if (!triage) {
    triage = new TriageAgent();
  }
  return triage;
}

function getAccountabilityAgent(): AccountabilityAgent {
  if (!accountability) {
    accountability = new AccountabilityAgent();
  }
  return accountability;
}

function getInboxLoadBalancerAgent(): InboxLoadBalancerAgent {
  if (!inboxLoadBalancer) {
    inboxLoadBalancer = new InboxLoadBalancerAgent();
  }
  return inboxLoadBalancer;
}

export const triageAgent = {
  triageInbox: () => getTriageAgent().triageInbox(),
};

export const accountabilityAgent = {
  runAccountabilityCheck: () => getAccountabilityAgent().runAccountabilityCheck(),
};

export const inboxLoadBalancerAgent = {
  processInbox: (emails: Parameters<InboxLoadBalancerAgent["processInbox"]>[0]) =>
    getInboxLoadBalancerAgent().processInbox(emails),
};

export async function getDashboard() {
  return getPrimeAgent().buildDashboard();
}

export async function startSession(taskId: string) {
  const session = await getPrimeAgent().startSession(taskId);

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
  const completed = await getPrimeAgent().completeSession(input);

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
  await getPrimeAgent().completeTask(taskId);

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
  return getPrimeAgent().getBrief(businessId, businessName);
}
