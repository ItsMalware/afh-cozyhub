import { NextResponse } from "next/server";
import { inboxLoadBalancerAgent } from "@/lib/agents";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const emails = Array.isArray(body.emails) ? body.emails : [];

        if (emails.length === 0) {
            return NextResponse.json(
                { message: "No emails provided in payload." },
                { status: 400 }
            );
        }

        const grouped = await inboxLoadBalancerAgent.processInbox(emails);

        return NextResponse.json(
            {
                message: "Inbox successfully balanced",
                totalEmailsProcessed: emails.length,
                groups: grouped,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("Failed to run Inbox Load Balancer", error);
        return NextResponse.json(
            {
                message: "Failed to run inbox load balancer",
                error: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
        );
    }
}
