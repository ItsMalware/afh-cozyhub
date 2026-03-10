import { NextRequest, NextResponse } from "next/server";

import { getDashboard } from "@/lib/agents";
import { runBrandingWeeklySummaryForCompany } from "@/lib/branding-weekly-summary";
import { FocusTask } from "@/lib/types";

function getBearerToken(header: string | null): string {
  if (!header) {
    return "";
  }
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer") {
    return "";
  }
  return token?.trim() ?? "";
}

function authorize(request: NextRequest): boolean {
  const requiredToken = process.env.BRANDING_WEEKLY_JOB_TOKEN ?? process.env.CRON_SECRET;
  if (!requiredToken) {
    return true;
  }
  const headerToken = request.headers.get("x-branding-token");
  const bearerToken = getBearerToken(request.headers.get("authorization"));
  return headerToken === requiredToken || bearerToken === requiredToken;
}

export async function POST(request: NextRequest) {
  try {
    if (!authorize(request)) {
      return NextResponse.json({ message: "Unauthorized weekly summary run" }, { status: 401 });
    }

    let payload: { companyId?: unknown; runAll?: unknown } = {};
    try {
      payload = (await request.json()) as { companyId?: unknown; runAll?: unknown };
    } catch {
      payload = {};
    }

    const dashboard = await getDashboard();
    const queueByCompany = new Map<string, FocusTask[]>();
    for (const task of dashboard.queue) {
      if (task.status === "DONE") {
        continue;
      }
      const existing = queueByCompany.get(task.businessId) ?? [];
      existing.push(task);
      queueByCompany.set(task.businessId, existing);
    }

    const targetCompanyId =
      typeof payload.companyId === "string" && payload.companyId.trim().length > 0
        ? payload.companyId.trim()
        : null;
    const runAll = payload.runAll === true;

    const targets = runAll
      ? dashboard.businesses
      : targetCompanyId
        ? dashboard.businesses.filter((business) => business.id === targetCompanyId)
        : dashboard.notebookBusinessName
          ? dashboard.businesses.filter((business) => business.name === dashboard.notebookBusinessName).slice(0, 1)
          : dashboard.businesses.slice(0, 1);

    if (targets.length === 0) {
      return NextResponse.json({ message: "No target company found for weekly summary run" }, { status: 404 });
    }

    const results = [];
    for (const business of targets) {
      const queue = (queueByCompany.get(business.id) ?? []).slice(0, 10);
      const result = await runBrandingWeeklySummaryForCompany({
        companyId: business.id,
        companyName: business.name,
        queue,
      });
      results.push({
        companyId: result.companyId,
        companyName: result.companyName,
        source: result.source,
        insightId: result.insight.id,
        predictionId: result.prediction.id,
        snapshotUpdated: result.snapshotUpdated,
      });
    }

    return NextResponse.json(
      {
        message: "Branding weekly summary pipeline complete",
        generatedAt: new Date().toISOString(),
        companyCount: results.length,
        results,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown weekly summary pipeline error";
    return NextResponse.json(
      {
        message: "Unable to run branding weekly summary pipeline",
        error: message,
      },
      { status: 500 },
    );
  }
}
