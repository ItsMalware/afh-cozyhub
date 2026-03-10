import { NextResponse } from "next/server";

import { writeDailyAgentSummary } from "@/lib/agent-notes";

export async function POST() {
  try {
    const summary = await writeDailyAgentSummary();
    return NextResponse.json(
      {
        message: "Agent daily summary written",
        ...summary,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown daily summary error";
    return NextResponse.json(
      {
        message: "Unable to write daily agent summary",
        error: message,
      },
      { status: 500 },
    );
  }
}
