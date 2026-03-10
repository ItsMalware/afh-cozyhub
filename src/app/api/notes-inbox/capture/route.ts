import { NextRequest, NextResponse } from "next/server";

import { captureNote } from "@/lib/agent-notes";

let lastSeenToken = "Waiting for token...";

export async function GET() {
  return new NextResponse(`Last seen Notion verification token:\n\n${lastSeenToken}`, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' }
  });
}

export async function POST(request: NextRequest) {
  try {
    let body: {
      note?: string;
      businessId?: string;
      metadata?: {
        isForAgent?: boolean;
        isUrgent?: boolean;
        isBlocked?: boolean;
        needsFollowUp?: boolean;
      };
      challenge?: string;
      verification_token?: string;
      [key: string]: unknown;
    } = {};

    // Attempt to safely parse the body
    try {
      body = await request.json();
      console.log(`\n=== INCOMING WEBHOOK BODY ===\n${JSON.stringify(body, null, 2)}\n=============================\n`);
    } catch (e) {
      console.log(`Could not parse JSON body: ${e}`);
    }

    // Is it a challenge?
    if (body?.challenge) {
      lastSeenToken = body.challenge;
      return new NextResponse(body.challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    // Is it a verification token?
    if (body?.verification_token) {
      lastSeenToken = body.verification_token;
      return NextResponse.json({
        challenge: body.verification_token,
        verification_token: body.verification_token
      }, { status: 200 });
    }

    // If it's empty or seems like a webhook setup, just accept it
    if (!body?.note && Object.keys(body).length <= 2) {
      return NextResponse.json({ status: "accepted" }, { status: 200 });
    }

    if (!body?.note) {
      return NextResponse.json({ message: "note is required", received: body }, { status: 400 });
    }

    const result = await captureNote({
      note: body.note,
      businessId: body.businessId,
      metadata: body.metadata,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown note capture error";
    return NextResponse.json(
      {
        message: "Unable to capture note",
        error: message,
      },
      { status: 500 },
    );
  }
}
