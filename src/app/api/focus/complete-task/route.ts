import { NextRequest, NextResponse } from "next/server";

import { completeTask } from "@/lib/agents";
import { enforceWriteSafety } from "@/lib/safety";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      taskId?: string;
      confirmationToken?: string;
    };

    if (!body.taskId) {
      return NextResponse.json({ message: "taskId is required" }, { status: 400 });
    }

    enforceWriteSafety({
      action: "complete_task",
      isDestructive: false,
      bulkCount: 0,
      confirmationToken: body.confirmationToken,
    });

    await completeTask(body.taskId);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown task complete error";
    const status = message.includes("requires explicit confirmation") ? 409 : 500;

    return NextResponse.json(
      {
        message: "Unable to complete task",
        error: message,
      },
      { status },
    );
  }
}
