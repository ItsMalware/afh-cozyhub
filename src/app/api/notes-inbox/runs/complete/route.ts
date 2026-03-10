import { NextRequest, NextResponse } from "next/server";

import { completeRoutedRun } from "@/lib/agent-notes";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      runId?: string;
      hoursCmmdHub?: number;
      workSummary?: string;
    };

    if (!body.runId) {
      return NextResponse.json({ message: "runId is required" }, { status: 400 });
    }
    if (typeof body.hoursCmmdHub !== "number" || !Number.isFinite(body.hoursCmmdHub)) {
      return NextResponse.json({ message: "hoursCmmdHub must be a number" }, { status: 400 });
    }
    if (!body.workSummary?.trim()) {
      return NextResponse.json({ message: "workSummary is required" }, { status: 400 });
    }

    const run = await completeRoutedRun({
      runId: body.runId,
      hoursCmmdHub: body.hoursCmmdHub,
      workSummary: body.workSummary.trim(),
    });

    return NextResponse.json(
      {
        message: "Delegated run completed and ticket closed",
        run,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown run completion error";
    return NextResponse.json(
      {
        message: "Unable to complete delegated run",
        error: message,
      },
      { status: 500 },
    );
  }
}
