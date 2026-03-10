import { NextResponse } from "next/server";

import { requireInternalToken } from "@/lib/api-auth";
import { writeDailyAgentSummary } from "@/lib/agent-notes";

export async function POST(request: Request) {
  try {
    const auth = requireInternalToken(request);
    if (!auth.ok) {
      return NextResponse.json({ message: auth.message }, { status: auth.status });
    }

    const summary = await writeDailyAgentSummary();
    return NextResponse.json(
      {
        message: "Agent daily summary written",
        ...summary,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Unable to write daily summary", error);
    return NextResponse.json(
      {
        message: "Unable to write daily agent summary",
      },
      { status: 500 },
    );
  }
}
