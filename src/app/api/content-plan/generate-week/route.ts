import { NextRequest, NextResponse } from "next/server";

import { generateWeeklyContentPlan, getWeeklyCoverageSummary } from "@/lib/brand-operator";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      companyIds?: string[];
    };

    const generated = await generateWeeklyContentPlan({
      companyIds: body.companyIds,
    });
    const coverage = await getWeeklyCoverageSummary();

    return NextResponse.json(
      {
        message: "Weekly content plan generated",
        generated,
        coverage,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown weekly plan error";
    return NextResponse.json(
      {
        message: "Unable to generate weekly plan",
        error: message,
      },
      { status: 500 },
    );
  }
}
