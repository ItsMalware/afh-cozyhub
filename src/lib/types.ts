export type PaletteColor = "pink" | "sage" | "teal" | "sand";

export type QueueStatus = "NEXT" | "QUEUED" | "DONE" | "LIVE";

export interface BusinessBalance {
  id: string;
  name: string;
  color: PaletteColor;
  plannedMinutes: number;
  focusedMinutes: number;
  behindMinutes: number;
}

export interface FocusTask {
  id: string;
  title: string;
  businessId: string;
  businessName: string;
  category: string;
  queueLabel?: string;
  dueDate?: string;
  plannedMinutes: number;
  status: QueueStatus;
}

export interface FocusSession {
  id: string;
  notionPageId?: string;
  taskId: string;
  taskTitle: string;
  businessId: string;
  businessName: string;
  plannedMinutes: number;
  startedAt: string;
  completedAt?: string;
  status: "LIVE" | "DONE";
  outcomes?: string;
  blockers?: string;
  followUps?: string;
}

export interface BehindTarget {
  businessId: string;
  name: string;
  behindMinutes: number;
}

export interface DashboardPayload {
  syncedAt: string;
  notebookBusinessName: string;
  dateLabel: string;
  totalBusinesses: number;
  totalPlannedMinutes: number;
  totalFocusedMinutes: number;
  businesses: BusinessBalance[];
  queue: FocusTask[];
  behindTargets: BehindTarget[];
  activeSession: FocusSession | null;
}

export interface BriefPayload {
  businessId: string;
  businessName: string;
  brief: string;
  source: string;
  fetchedAt: string;
}

export interface CompleteSessionInput {
  sessionId: string;
  outcomes: string;
  blockers: string;
  followUps: string;
}

export interface AuditRecord {
  timestamp: string;
  agent: "Prime" | "Librarian" | "Worker";
  action: string;
  detail: string;
  payload: Record<string, unknown>;
}

export interface NotionConfig {
  token?: string;
  businessesDbId?: string;
  tasksDbId?: string;
  projectsDbId?: string;
  sessionsDbId?: string;
}

export interface UpsertTaskInput {
  taskId?: string;
  title: string;
  businessId?: string;
  status?: string;
}

export interface NotionDataService {
  getDashboardData(): Promise<DashboardPayload>;
  startSession(taskId: string): Promise<FocusSession>;
  completeSession(input: CompleteSessionInput): Promise<FocusSession>;
  completeTask(taskId: string): Promise<void>;
  upsertTask(input: UpsertTaskInput): Promise<void>;
}

export interface NotebookBriefService {
  getBrief(businessId: string, businessName: string): Promise<BriefPayload>;
}
