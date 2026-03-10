import { assertPermission } from "@/lib/agents/contracts";
import { CompleteSessionInput, NotionDataService } from "@/lib/types";

export class WorkerAgent {
  constructor(private notionService: NotionDataService) {}

  async startFocusSession(taskId: string) {
    assertPermission("Worker", "notion.write.session");
    return this.notionService.startSession(taskId);
  }

  async completeFocusSession(input: CompleteSessionInput) {
    assertPermission("Worker", "notion.write.session");
    assertPermission("Worker", "notion.write.task");
    return this.notionService.completeSession(input);
  }

  async completeTask(taskId: string) {
    assertPermission("Worker", "notion.write.task");
    return this.notionService.completeTask(taskId);
  }
}
