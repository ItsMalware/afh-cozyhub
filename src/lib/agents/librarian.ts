import { assertPermission } from "@/lib/agents/contracts";
import { NotebookBriefService, NotionDataService } from "@/lib/types";

export class LibrarianAgent {
  constructor(
    private notionService: NotionDataService,
    private notebookService: NotebookBriefService,
  ) {}

  async getDashboard() {
    assertPermission("Librarian", "notion.read");
    return this.notionService.getDashboardData();
  }

  async getNotebookBrief(businessId: string, businessName: string) {
    assertPermission("Librarian", "notebooklm.read");
    return this.notebookService.getBrief(businessId, businessName);
  }
}
