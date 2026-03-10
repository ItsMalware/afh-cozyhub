import { NextRequest, NextResponse } from "next/server";

import { requireInternalToken } from "@/lib/api-auth";
import { captureNote } from "@/lib/agent-notes";

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
    } catch {
      console.warn("Notes inbox webhook body parse failed");
    }

    // Is it a challenge?
    if (body?.challenge) {
      return new NextResponse(body.challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    // Is it a verification token?
    if (body?.verification_token) {
      return new NextResponse(body.verification_token, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
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
    console.error("Notes inbox capture failed", error);
    return NextResponse.json(
      {
        message: "Unable to capture note",
      },
      { status: 500 },
    );
  }
}
