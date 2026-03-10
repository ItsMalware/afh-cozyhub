import { NextRequest, NextResponse } from "next/server";

import { saveSignalToNotion } from "@/lib/news-signals";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { itemId?: string };
    if (!body.itemId) {
      return NextResponse.json({ message: "itemId is required" }, { status: 400 });
    }

    const result = await saveSignalToNotion({ itemId: body.itemId });
    return NextResponse.json(
      {
        message: "Signal saved to Notion",
        ...result,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown save error";
    return NextResponse.json(
      {
        message: "Unable to save signal",
        error: message,
      },
      { status: 500 },
    );
  }
}
