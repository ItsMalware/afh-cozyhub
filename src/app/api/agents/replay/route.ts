import { NextResponse } from "next/server";

import { listReplayArtifacts } from "@/lib/agents/replay";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const requested = Number(searchParams.get("limit") ?? "20");
    const limit = Number.isFinite(requested) ? Math.max(1, Math.min(50, requested)) : 20;
    const replays = await listReplayArtifacts(limit);
    return NextResponse.json({ replays }, { status: 200 });
  } catch (error) {
    console.error("Replay list failed", error);
    return NextResponse.json({ error: "Unable to list replay artifacts" }, { status: 500 });
  }
}
