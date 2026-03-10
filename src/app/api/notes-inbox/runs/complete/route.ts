import { NextRequest, NextResponse } from "next/server";

import { requireInternalToken } from "@/lib/api-auth";
import { completeRoutedRun } from "@/lib/agent-notes";

export async function POST(request: NextRequest) {
  try {
    const auth = requireInternalToken(request);
    if (!auth.ok) {
      return NextResponse.json({ message: auth.message }, { status: auth.status });
    }

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
    console.error("Unable to complete delegated run", error);
    return NextResponse.json(
      {
        message: "Unable to complete delegated run",
      },
      { status: 500 },
    );
  }
}
