import { NextResponse } from "next/server";

import { requireInternalToken } from "@/lib/api-auth";
import { getRouterRuns } from "@/lib/agent-notes";

export async function GET(request: Request) {
  try {
    const auth = requireInternalToken(request);
    if (!auth.ok) {
      return NextResponse.json({ message: auth.message }, { status: auth.status });
    }

    const runs = await getRouterRuns();
    return NextResponse.json(
      {
        message: "Router runs ready",
        ...runs,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Unable to load router runs", error);
    return NextResponse.json(
      {
        message: "Unable to load router runs",
      },
      { status: 500 },
    );
  }
}
