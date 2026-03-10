import { NextResponse } from "next/server";

import { getAttentionQueue, getWeeklyCoverageSummary } from "@/lib/brand-operator";

export async function GET() {
  try {
    const queue = await getAttentionQueue();
    const coverage = await getWeeklyCoverageSummary();
    return NextResponse.json(
      {
        message: "Attention queue ready",
        ...queue,
        coverage: coverage.coverage,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown attention queue error";
    return NextResponse.json(
      {
        message: "Unable to load attention queue",
        error: message,
      },
      { status: 500 },
    );
  }
}
