import { NextRequest, NextResponse } from "next/server";

import { getNotebookBrief } from "@/lib/agents";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const businessName = request.nextUrl.searchParams.get("businessName") ?? "Business";

    if (!businessId) {
      return NextResponse.json({ message: "businessId is required" }, { status: 400 });
    }

    const brief = await getNotebookBrief(businessId, businessName);
    return NextResponse.json(brief, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown brief error";
    return NextResponse.json(
      {
        message: "Unable to load NotebookLM brief",
        error: message,
      },
      { status: 500 },
    );
  }
}
