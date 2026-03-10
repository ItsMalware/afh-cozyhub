import { NextRequest, NextResponse } from "next/server";

import { getNewsSignals } from "@/lib/news-signals";

export async function GET(request: NextRequest) {
  try {
    const refresh = request.nextUrl.searchParams.get("refresh") === "1";
    const feed = await getNewsSignals(refresh);

    return NextResponse.json(
      {
        message: "News signals ready",
        ...feed,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown news feed error";
    return NextResponse.json(
      {
        message: "Unable to load news signals",
        error: message,
      },
      { status: 500 },
    );
  }
}
