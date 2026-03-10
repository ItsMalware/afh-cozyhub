import { NextRequest, NextResponse } from "next/server";

import { completeSession } from "@/lib/agents";
import { enforceWriteSafety } from "@/lib/safety";

function estimateFollowUpCount(followUps: string): number {
  if (!followUps.trim()) {
    return 0;
  }

  return followUps
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0).length;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      sessionId?: string;
      outcomes?: string;
      blockers?: string;
      followUps?: string;
      confirmationToken?: string;
    };

    if (!body.sessionId) {
      return NextResponse.json({ message: "sessionId is required" }, { status: 400 });
    }

    const followUps = body.followUps ?? "";

    enforceWriteSafety({
      action: "complete_focus_session",
      isDestructive: false,
      bulkCount: estimateFollowUpCount(followUps),
      confirmationToken: body.confirmationToken,
    });

    const completed = await completeSession({
      sessionId: body.sessionId,
      outcomes: body.outcomes ?? "",
      blockers: body.blockers ?? "",
      followUps,
    });

    return NextResponse.json(completed, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown focus complete error";
    const status = message.includes("requires explicit confirmation") ? 409 : 500;

    return NextResponse.json(
      {
        message: "Unable to complete focus session",
        error: message,
      },
      { status },
    );
  }
}
