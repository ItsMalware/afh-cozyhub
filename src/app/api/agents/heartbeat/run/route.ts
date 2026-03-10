import { NextResponse } from "next/server";

import { runAgentHeartbeat } from "@/lib/agents/heartbeat";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const expectedToken = process.env.AGENT_HEARTBEAT_TOKEN;
    if (expectedToken) {
      const sentToken = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (!sentToken || sentToken !== expectedToken) {
        return NextResponse.json({ error: "Unauthorized heartbeat run" }, { status: 401 });
      }
    }

    const result = await runAgentHeartbeat();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Heartbeat run failed", error);
    return NextResponse.json({ error: "Heartbeat run failed" }, { status: 500 });
  }
}
