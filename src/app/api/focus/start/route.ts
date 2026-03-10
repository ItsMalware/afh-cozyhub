import { NextRequest, NextResponse } from "next/server";

import { startSession } from "@/lib/agents";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { taskId?: string };

    if (!body.taskId) {
      return NextResponse.json({ message: "taskId is required" }, { status: 400 });
    }

    const session = await startSession(body.taskId);
    return NextResponse.json(session, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown focus start error";

    return NextResponse.json(
      {
        message: "Unable to start focus session",
        error: message,
      },
      { status: 500 },
    );
  }
}
