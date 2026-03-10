import { NextRequest, NextResponse } from "next/server";
import { requireInternalToken } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
    const auth = requireInternalToken(request, {
        tokenEnvNames: ["NOTION_WEBHOOK_SECRET", "AFH_INTERNAL_API_TOKEN", "CRON_SECRET"],
    });
    if (!auth.ok) {
        return NextResponse.json({ message: auth.message }, { status: auth.status });
    }
    return NextResponse.json({ status: "ok" }, { status: 200 });
}

export async function POST(request: NextRequest) {
    try {
        const auth = requireInternalToken(request, {
            tokenEnvNames: ["NOTION_WEBHOOK_SECRET", "AFH_INTERNAL_API_TOKEN", "CRON_SECRET"],
        });
        if (!auth.ok) {
            return NextResponse.json({ message: auth.message }, { status: auth.status });
        }

        let body: any = {};

        // Attempt to safely parse the body
        try {
            body = await request.json();
        } catch {
            console.warn("Task assigned webhook body parse failed");
        }

        // Is it a challenge?
        if (body?.challenge) {
            return new NextResponse(body.challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
        }

        // Is it a verification token?
        if (body?.verification_token) {
            return new NextResponse(body.verification_token, {
                status: 200,
                headers: { "Content-Type": "text/plain" },
            });
        }

        return NextResponse.json({ status: "accepted logger" }, { status: 200 });
    } catch (err: unknown) {
        console.error("Error in task assigned webhook handler", err);
        return NextResponse.json({ message: "Unable to process webhook" }, { status: 500 });
    }
}
