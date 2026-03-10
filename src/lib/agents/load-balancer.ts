// @ts-nocheck
import { Client } from "@notionhq/client";

export interface EmailMessage {
    id: string;
    subject: string;
    body: string;
    sender: string;
    date: string;
}

export interface EmailGroup {
    topic: string;
    emails: EmailMessage[];
    suggestedReply?: string;
    proposedAction: "Archive" | "Defer" | "Do Now";
    isActionable: boolean;
    notionTaskId?: string;
}

export class InboxLoadBalancerAgent {
    private notion: Client;
    private tasksDbId: string;

    constructor() {
        const token = process.env.NOTION_TOKEN;
        this.tasksDbId = process.env.NOTION_DATABASE_TASKS_ID ?? "";

        if (!token) {
            throw new Error("Missing NOTION_TOKEN for InboxLoadBalancerAgent");
        }

        this.notion = new Client({ auth: token });
    }

    private deduplicateAndGroup(emails: EmailMessage[]): EmailGroup[] {
        // Simple grouping logic: group by identical subjects (stripping Re:, Fwd:)
        const groups = new Map<string, EmailGroup>();

        for (const email of emails) {
            const topic = email.subject.replace(/^(Re|Fwd|Fw):\s*/i, "").trim();

            let action: "Archive" | "Defer" | "Do Now" = "Defer";
            let actionable = false;
            const bodyLower = email.body.toLowerCase();

            if (/urgent|immediately|action required/i.test(bodyLower)) {
                action = "Do Now";
                actionable = true;
            } else if (/newsletter|unsubscribe|update/i.test(bodyLower)) {
                action = "Archive";
            } else if (email.subject.includes("?")) {
                action = "Do Now";
                actionable = true;
            }

            if (groups.has(topic)) {
                const group = groups.get(topic)!;
                group.emails.push(email);
                // Elevate priority if new email warrants it
                if (action === "Do Now") {
                    group.proposedAction = "Do Now";
                    group.isActionable = true;
                }
            } else {
                groups.set(topic, {
                    topic,
                    emails: [email],
                    proposedAction: action,
                    isActionable: actionable,
                    suggestedReply: actionable ? `Thanks for reaching out regarding ${topic}. I will get back to you shortly.` : undefined,
                });
            }
        }

        return Array.from(groups.values());
    }

    private async createActionableNotionTask(group: EmailGroup): Promise<string | null> {
        if (!this.tasksDbId) return null;

        try {
            const db = await this.notion.dataSources.retrieve({ data_source_id: this.tasksDbId });
            const properties: any = {};

            const titleProp = Object.keys(db.properties).find((k) => db.properties[k].type === "title");
            if (titleProp) {
                properties[titleProp] = { title: [{ text: { content: `[Email Action] ${group.topic}` } }] };
            }

            const statusProp = Object.keys(db.properties).find((k) => db.properties[k].type === "status" || (db.properties[k].type === "select" && k.toLowerCase().includes("status")));
            if (statusProp) {
                const type = db.properties[statusProp].type;
                if (type === "status") properties[statusProp] = { status: { name: "Inbox" } };
                else properties[statusProp] = { select: { name: "Inbox" } };
            }

            const urgencyProp = Object.keys(db.properties).find((k) => db.properties[k].type === "select" && k.toLowerCase().includes("priority"));
            if (urgencyProp) {
                properties[urgencyProp] = { select: { name: group.proposedAction === "Do Now" ? "High" : "Medium" } };
            }

            const created = await this.notion.pages.create({
                parent: { data_source_id: this.tasksDbId },
                properties
            });

            return created.id;
        } catch (e) {
            console.error("Failed to create Notion task from email group", e);
            return null;
        }
    }

    public async processInbox(emails: EmailMessage[]): Promise<EmailGroup[]> {
        const grouped = this.deduplicateAndGroup(emails);

        for (const group of grouped) {
            if (group.isActionable) {
                const taskId = await this.createActionableNotionTask(group);
                if (taskId) {
                    group.notionTaskId = taskId;
                }
            }
        }

        return grouped;
    }
}
