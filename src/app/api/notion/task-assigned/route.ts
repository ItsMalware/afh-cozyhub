import { NextRequest, NextResponse } from "next/server";

let lastSeenToken = "Waiting for token...";

export async function GET() {
    return new NextResponse(`Last seen Notion verification token:\n\n${lastSeenToken}`, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
    });
}

export async function POST(request: NextRequest) {
    try {
        let body: any = {};

        // Attempt to safely parse the body
        try {
            body = await request.json();
            console.log(`\n=== INCOMING TASK ASSIGNED WEBHOOK ===\n${JSON.stringify(body, null, 2)}\n=============================\n`);
        } catch (e) {
            console.log(`Could not parse JSON body: ${e}`);
        }

        // Is it a challenge?
        if (body?.challenge) {
            lastSeenToken = body.challenge;
            return new NextResponse(body.challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
        }

        // Is it a verification token?
        if (body?.verification_token) {
            lastSeenToken = body.verification_token;
            return NextResponse.json(
                {
                    challenge: body.verification_token,
                    verification_token: body.verification_token,
                },
                { status: 200 },
            );
        }

        return NextResponse.json({ status: "accepted logger" }, { status: 200 });
    } catch (err: any) {
        console.error("Error in webhook handler:", err);
        return NextResponse.json({ message: err.message || "Unknown error" }, { status: 500 });
    }
}
