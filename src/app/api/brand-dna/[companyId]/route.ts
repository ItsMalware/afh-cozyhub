import { NextRequest, NextResponse } from "next/server";

import { getBrandProfile } from "@/lib/brand-operator";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ companyId: string }> },
) {
  try {
    const { companyId } = await context.params;
    const profile = await getBrandProfile(companyId);

    if (!profile) {
      return NextResponse.json(
        { message: "Brand profile not found for company" },
        { status: 404 },
      );
    }

    return NextResponse.json(profile, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown profile read error";
    return NextResponse.json(
      {
        message: "Unable to fetch brand profile",
        error: message,
      },
      { status: 500 },
    );
  }
}
