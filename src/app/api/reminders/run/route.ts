import { NextRequest, NextResponse } from "next/server";

import { runScheduledBrandingWeeklySummaries } from "@/lib/branding-weekly-summary";
import { getDashboard } from "@/lib/agents";
import { runReminderSweep } from "@/lib/sms-reminders";

function getBearerToken(authorizationHeader: string | null): string {
  if (!authorizationHeader) {
    return "";
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer") {
    return "";
  }
  return token?.trim() ?? "";
}

function authorize(request: NextRequest): boolean {
  const requiredToken = process.env.REMINDER_JOB_TOKEN ?? process.env.CRON_SECRET;
  if (!requiredToken) {
    return true;
  }

  const headerToken = request.headers.get("x-reminder-token");
  const bearerToken = getBearerToken(request.headers.get("authorization"));
  return headerToken === requiredToken || bearerToken === requiredToken;
}

export async function POST(request: NextRequest) {
  try {
    if (!authorize(request)) {
      return NextResponse.json({ message: "Unauthorized reminder run" }, { status: 401 });
    }

    let payload: { forceWeeklyBranding?: unknown; runAllBusinesses?: unknown; companyId?: unknown } = {};
    try {
      payload = (await request.json()) as {
        forceWeeklyBranding?: unknown;
        runAllBusinesses?: unknown;
        companyId?: unknown;
      };
    } catch {
      payload = {};
    }

    const dashboard = await getDashboard();
    const result = await runReminderSweep(dashboard);
    const weeklyBranding = await runScheduledBrandingWeeklySummaries(dashboard, {
      force: payload.forceWeeklyBranding === true,
      runAll: payload.runAllBusinesses === true,
      companyId: typeof payload.companyId === "string" ? payload.companyId : undefined,
    });

    return NextResponse.json(
      {
        message: "Reminder sweep complete",
        ...result,
        weeklyBranding,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown reminder error";

    return NextResponse.json(
      {
        message: "Unable to run reminders",
        error: message,
      },
      { status: 500 },
    );
  }
}
