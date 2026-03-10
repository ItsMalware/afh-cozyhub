export type AgentName = "Prime" | "Librarian" | "Worker";

export type ToolPermission =
  | "notion.read"
  | "notion.write.session"
  | "notion.write.task"
  | "notebooklm.read";

const PERMISSIONS: Record<AgentName, ToolPermission[]> = {
  Prime: ["notion.read", "notebooklm.read"],
  Librarian: ["notion.read", "notebooklm.read"],
  Worker: ["notion.write.session", "notion.write.task"],
};

export function assertPermission(agent: AgentName, permission: ToolPermission): void {
  if (!PERMISSIONS[agent].includes(permission)) {
    throw new Error(`${agent} is not allowed to use ${permission}`);
  }
}

export function listPermissions(agent: AgentName): ToolPermission[] {
  return PERMISSIONS[agent];
}
