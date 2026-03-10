import { NextRequest, NextResponse } from "next/server";

import { scanBrandDNA } from "@/lib/brand-operator";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      companyId?: string;
      companyName?: string;
      urls?: string[];
    };

    if (!body.companyId) {
      return NextResponse.json({ message: "companyId is required" }, { status: 400 });
    }

    const result = await scanBrandDNA({
      companyId: body.companyId,
      companyName: body.companyName,
      urls: body.urls ?? [],
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown brand scan error";
    return NextResponse.json(
      {
        message: "Unable to scan brand DNA",
        error: message,
      },
      { status: 500 },
    );
  }
}
