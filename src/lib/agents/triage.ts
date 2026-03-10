// @ts-nocheck
import { Client } from "@notionhq/client";

export class TriageAgent {
    private notion: Client;
    private tasksDbId: string;
    private businessesDbId: string;

    constructor() {
        const token = process.env.NOTION_TOKEN;
        this.tasksDbId = process.env.NOTION_DATABASE_TASKS_ID ?? "";
        this.businessesDbId = process.env.NOTION_DATABASE_BUSINESSES_ID ?? "";

        if (!token) {
            throw new Error("Missing NOTION_TOKEN for TriageAgent");
        }

        this.notion = new Client({ auth: token });
    }

    private classifyTaskType(title: string): string {
        const text = title.toLowerCase();
        if (/legal|admin|license|ein|tax|compliance|contract|policy|audit/i.test(text)) {
            return "Admin";
        }
        if (/finance|invoice|payment|budget|expense|accounting|payroll/i.test(text)) {
            return "Finance";
        }
        if (/post|blog|article|content|social|newsletter|video|copy/i.test(text)) {
            return "Content";
        }
        return "Ops";
    }

    private classifyUrgency(title: string): "High" | "Medium" | "Low" {
        const text = title.toLowerCase();
        if (/urgent|critical|asap|today|blocker|important/i.test(text)) {
            return "High";
        }
        if (/soon|this week|needs /i.test(text)) {
            return "Medium";
        }
        return "Low";
    }

    private async getBusinesses(): Promise<Array<{ id: string; name: string }>> {
        if (!this.businessesDbId) return [];
        try {
            const response = await this.notion.dataSources.query({
                data_source_id: this.businessesDbId,
                page_size: 50,
            });

            return response.results.map((row) => {
                const properties = (row as any).properties;
                const nameProp = Object.values(properties).find(
                    (p: any) => p.type === "title"
                ) as any;
                const name = nameProp?.title?.[0]?.plain_text ?? "Unknown";
                return { id: row.id, name };
            });
        } catch {
            return [];
        }
    }

    private matchBusiness(title: string, businesses: Array<{ id: string; name: string }>): string | null {
        const text = title.toLowerCase();
        for (const biz of businesses) {
            if (text.includes(biz.name.toLowerCase())) {
                return biz.id;
            }
        }
        return null;
    }

    public async triageInbox(): Promise<{ triagedCount: number, top5: Array<{ id: string, title: string, url: string }> }> {
        if (!this.tasksDbId) return { triagedCount: 0, top5: [] };

        const businesses = await this.getBusinesses();

        // Query tasks that are in Inbox / No Status / Not Started
        const response = await this.notion.dataSources.query({
            data_source_id: this.tasksDbId,
            page_size: 100,
        });

        let triagedCount = 0;

        for (const row of response.results) {
            const properties = (row as any).properties;

            const titleProp = Object.values(properties).find((p: any) => p.type === "title") as any;
            const title = titleProp?.title?.[0]?.plain_text ?? "";

            const statusPropKey = Object.keys(properties).find(k => properties[k].type === "status" || (properties[k].type === "select" && k.toLowerCase().includes("status")));

            if (!statusPropKey) continue;

            const statusValueObj = properties[statusPropKey];
            const statusName = statusValueObj.type === "status"
                ? statusValueObj.status?.name
                : statusValueObj.select?.name;

            // We only triage tasks that look "unprocessed" or don't have due dates
            const isUnprocessed = !statusName || ["Inbox", "Not Started", "New", "Idea"].includes(statusName);

            const dueDatePropKey = Object.keys(properties).find(k => properties[k].type === "date");
            const hasDueDate = dueDatePropKey && properties[dueDatePropKey].date?.start;

            const typePropKey = Object.keys(properties).find(k => properties[k].type === "select" && k.toLowerCase().includes("type"));
            const hasType = typePropKey && properties[typePropKey].select?.name;

            const priorityPropKey = Object.keys(properties).find(k => properties[k].type === "select" && k.toLowerCase().includes("priority"));

            const businessRelKey = Object.keys(properties).find(k => properties[k].type === "relation" && k.toLowerCase().includes("business"));
            const hasBusiness = businessRelKey && properties[businessRelKey].relation?.length > 0;

            if (!isUnprocessed && hasDueDate && hasType && hasBusiness) {
                continue;
            }

            const updates: any = {};

            // Auto-tag type
            if (!hasType && typePropKey) {
                const inferredType = this.classifyTaskType(title);
                updates[typePropKey] = { select: { name: inferredType } };
            }

            // Priority
            if (priorityPropKey && !properties[priorityPropKey].select?.name) {
                updates[priorityPropKey] = { select: { name: this.classifyUrgency(title) } };
            }

            // Business
            if (!hasBusiness && businessRelKey) {
                const matchedBusinessId = this.matchBusiness(title, businesses);
                if (matchedBusinessId) {
                    updates[businessRelKey] = { relation: [{ id: matchedBusinessId }] };
                }
            }

            // Due Date (simple rule: high priority = today, else next week)
            if (!hasDueDate && dueDatePropKey) {
                const urgency = this.classifyUrgency(title);
                const date = new Date();
                if (urgency === "High") {
                    // Today
                } else if (urgency === "Medium") {
                    date.setDate(date.getDate() + 3); // In 3 days
                } else {
                    date.setDate(date.getDate() + 7); // In 7 days
                }
                updates[dueDatePropKey] = { date: { start: date.toISOString().split("T")[0] } };
            }

            if (Object.keys(updates).length > 0) {
                try {
                    await this.notion.pages.update({
                        page_id: row.id,
                        properties: updates
                    });
                    triagedCount++;
                } catch (e) {
                    console.error(`Failed to triage task ${row.id}`, e);
                }
            }
        }

        const top5Query = await this.notion.dataSources.query({
            data_source_id: this.tasksDbId,
            page_size: 50,
            sorts: [
                { property: "Due Date", direction: "ascending" },
            ]
        });

        const top5 = top5Query.results
            .map((r: any) => {
                const titleProp = Object.values(r.properties).find((p: any) => p.type === "title") as any;
                return {
                    id: r.id,
                    title: titleProp?.title?.[0]?.plain_text ?? "Untitled",
                    url: (r as any).url,
                };
            })
            .slice(0, 5);

        return { triagedCount, top5 };
    }
}
