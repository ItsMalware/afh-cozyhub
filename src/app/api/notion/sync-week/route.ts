import { NextResponse } from "next/server";

import { syncWeeklyPlanToNotion } from "@/lib/brand-operator";

export async function POST() {
  try {
    const result = await syncWeeklyPlanToNotion();
    return NextResponse.json(
      {
        message: "Weekly Notion sync complete",
        ...result,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown notion sync error";
    return NextResponse.json(
      {
        message: "Unable to sync weekly plan to Notion",
        error: message,
      },
      { status: 500 },
    );
  }
}
