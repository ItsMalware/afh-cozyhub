import { NextResponse } from "next/server";

import { createDelegationPlan } from "@/lib/agents/delegation";
import { orchestrateParallel } from "@/lib/agents/parallel";

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as { task?: unknown; subTasks?: unknown };
    const task = typeof payload.task === "string" ? payload.task.trim() : "";

    if (!task) {
      return NextResponse.json({ error: "task is required" }, { status: 400 });
    }

    const subTasks =
      Array.isArray(payload.subTasks) && payload.subTasks.every((item) => typeof item === "string")
        ? payload.subTasks
        : undefined;

    if (subTasks && subTasks.length >= 2) {
      const orchestration = await orchestrateParallel({
        task,
        subTasks,
      });
      return NextResponse.json({ orchestration }, { status: 200 });
    }

    const plan = await createDelegationPlan(task);
    return NextResponse.json({ plan }, { status: 200 });
  } catch (error) {
    console.error("Prime delegation error", error);
    return NextResponse.json(
      { error: "Unable to create prime delegation plan" },
      { status: 500 },
    );
  }
}
