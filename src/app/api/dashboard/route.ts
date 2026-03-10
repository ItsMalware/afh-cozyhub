import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

import { getDashboard } from "@/lib/agents";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
      const seedPath = path.join(process.cwd(), "public", "data", "dashboard-seed.json");
      const seedData = await fs.readFile(seedPath, "utf-8");
      return NextResponse.json(JSON.parse(seedData), { status: 200 });
    }

    const dashboard = await getDashboard();
    return NextResponse.json(dashboard, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown dashboard error";
    return NextResponse.json(
      {
        message: "Unable to load dashboard",
        error: message,
      },
      { status: 500 },
    );
  }
}
