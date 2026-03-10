import { assertPermission } from "@/lib/agents/contracts";
import { LibrarianAgent } from "@/lib/agents/librarian";
import { WorkerAgent } from "@/lib/agents/worker";
import { CompleteSessionInput } from "@/lib/types";

export class PrimeAgent {
  constructor(
    private librarian: LibrarianAgent,
    private worker: WorkerAgent,
  ) {}

  async buildDashboard() {
    assertPermission("Prime", "notion.read");
    return this.librarian.getDashboard();
  }

  async startSession(taskId: string) {
    return this.worker.startFocusSession(taskId);
  }

  async completeSession(input: CompleteSessionInput) {
    return this.worker.completeFocusSession(input);
  }

  async completeTask(taskId: string) {
    return this.worker.completeTask(taskId);
  }

  async getBrief(businessId: string, businessName: string) {
    assertPermission("Prime", "notebooklm.read");
    return this.librarian.getNotebookBrief(businessId, businessName);
  }
}
