import { NextResponse } from "next/server";

import { orchestrateParallel } from "@/lib/agents/parallel";

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as {
      task?: unknown;
      subTasks?: unknown;
      modelRouting?: unknown;
    };
    const task = typeof payload.task === "string" ? payload.task.trim() : "";
    if (!task) {
      return NextResponse.json({ error: "task is required" }, { status: 400 });
    }

    const subTasks =
      Array.isArray(payload.subTasks) && payload.subTasks.every((item) => typeof item === "string")
        ? payload.subTasks
        : undefined;
    const modelRouting =
      payload.modelRouting && typeof payload.modelRouting === "object"
        ? (payload.modelRouting as {
            reasoning?: string;
            research?: string;
            speed?: string;
          })
        : undefined;

    const result = await orchestrateParallel({
      task,
      subTasks,
      modelRouting,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Parallel orchestration failed", error);
    return NextResponse.json({ error: "Parallel orchestration failed" }, { status: 500 });
  }
}
