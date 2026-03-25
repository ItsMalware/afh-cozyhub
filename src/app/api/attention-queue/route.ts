import { NextResponse } from "next/server";

import { getAttentionQueue, getWeeklyCoverageSummary } from "@/lib/brand-operator";

function hasNotionConfig(): boolean {
  return Boolean(
    process.env.NOTION_TOKEN &&
      process.env.NOTION_DATABASE_BUSINESSES_ID &&
      process.env.NOTION_DATABASE_TASKS_ID &&
      process.env.NOTION_DATABASE_PROJECTS_ID &&
      process.env.NOTION_DATABASE_SESSIONS_ID,
  );
}

export async function GET() {
  try {
    if (!hasNotionConfig()) {
      return NextResponse.json(
        {
          message: "Attention queue ready",
          week: "",
          events: [],
          coverage: [],
        },
        { status: 200 },
      );
    }

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
    if (message.toLowerCase().includes("notion api not configured")) {
      return NextResponse.json(
        {
          message: "Attention queue ready",
          week: "",
          events: [],
          coverage: [],
        },
        { status: 200 },
      );
    }
    return NextResponse.json(
      {
        message: "Unable to load attention queue",
        error: message,
      },
      { status: 500 },
    );
  }
}
