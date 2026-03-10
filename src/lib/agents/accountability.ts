import { getAttentionQueue, syncWeeklyPlanToNotion, generateWeeklyContentPlan, getWeeklyCoverageSummary } from "@/lib/brand-operator";

export class AccountabilityAgent {
    constructor() { }

    public async runAccountabilityCheck(): Promise<{
        status: string;
        eventsFound: number;
        gapsFlagged: number;
        recoveryTasksCreated: number;
    }> {
        // 1. Generate weekly content plan (creates new commitments if missing)
        await generateWeeklyContentPlan();

        // 2. Sync to Notion and create follow-up/recovery tasks for Admin/Legal
        const syncResult = await syncWeeklyPlanToNotion();

        // 3. Get the attention queue (flags gaps in coverage and overdue items)
        const queue = await getAttentionQueue();

        // 4. Summarize the coverage
        const coverage = await getWeeklyCoverageSummary();
        const gapsFlagged = coverage.coverage.reduce((acc, c) => acc + c.gap, 0);

        return {
            status: "Accountability Check Completed",
            eventsFound: queue.events.length,
            gapsFlagged,
            recoveryTasksCreated: syncResult.followUpTasksCreated,
        };
    }
}
