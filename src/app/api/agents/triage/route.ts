import { NextResponse } from "next/server";
import { triageAgent } from "@/lib/agents";

export async function POST() {
    try {
        const result = await triageAgent.triageInbox();
        return NextResponse.json(
            {
                message: "Inbox triaged successfully",
                ...result,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("Failed to run Triage Agent", error);
        return NextResponse.json(
            {
                message: "Failed to run triage agent",
                error: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
        );
    }
}
