import { NextResponse } from "next/server";

import { getRouterRuns } from "@/lib/agent-notes";

export async function GET() {
  try {
    const runs = await getRouterRuns();
    return NextResponse.json(
      {
        message: "Router runs ready",
        ...runs,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown runs error";
    return NextResponse.json(
      {
        message: "Unable to load router runs",
        error: message,
      },
      { status: 500 },
    );
  }
}
