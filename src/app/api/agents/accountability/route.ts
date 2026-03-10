import { NextResponse } from "next/server";
import { accountabilityAgent } from "@/lib/agents";

export async function POST() {
    try {
        const result = await accountabilityAgent.runAccountabilityCheck();
        return NextResponse.json(
            {
                message: "Accountability check completed",
                ...result,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("Failed to run Accountability Agent", error);
        return NextResponse.json(
            {
                message: "Failed to run accountability agent",
                error: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
        );
    }
}
