import { NextRequest, NextResponse } from "next/server";

import {
  addBrandingInsight,
  addBrandingPrediction,
  currentWeekKey,
  getBrandingSummary,
  upsertBrandingSnapshot,
} from "@/lib/branding-day-store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId")?.trim() ?? "";
  if (!companyId) {
    return NextResponse.json({ message: "companyId is required" }, { status: 400 });
  }

  const summary = await getBrandingSummary(companyId);
  return NextResponse.json(summary, { status: 200 });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      companyId?: string;
      companyName?: string;
      funnel?: {
        awareness?: number;
        consideration?: number;
        conversion?: number;
        loyalty?: number;
      };
      moments?: {
        strength?: number;
        momentum?: number;
        notes?: string;
      };
      channelMix?: Record<string, number>;
      sourceRefs?: string[];
      insight?: {
        periodStart?: string;
        periodEnd?: string;
        summary?: string;
        drivers?: string[];
        recommendedActions?: string[];
        confidence?: number;
        assumptions?: string[];
      };
      prediction?: {
        direction?: "up" | "down" | "flat";
        confidence?: number;
        rationale?: string;
      };
    };

    const companyId = body.companyId?.trim() ?? "";
    const companyName = body.companyName?.trim() ?? "";
    if (!companyId || !companyName) {
      return NextResponse.json(
        { message: "companyId and companyName are required" },
        { status: 400 },
      );
    }

    const snapshot = await upsertBrandingSnapshot({
      companyId,
      companyName,
      weekKey: currentWeekKey(),
      funnel: {
        awareness: body.funnel?.awareness ?? 0,
        consideration: body.funnel?.consideration ?? 0,
        conversion: body.funnel?.conversion ?? 0,
        loyalty: body.funnel?.loyalty ?? 0,
      },
      moments: {
        strength: body.moments?.strength ?? 0,
        momentum: body.moments?.momentum ?? 0,
        notes: body.moments?.notes ?? "",
      },
      channelMix: body.channelMix ?? {},
      sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [],
    });

    let insight = null;
    if (body.insight?.summary) {
      insight = await addBrandingInsight({
        companyId,
        periodStart: body.insight.periodStart ?? new Date().toISOString(),
        periodEnd: body.insight.periodEnd ?? new Date().toISOString(),
        summary: body.insight.summary,
        drivers: Array.isArray(body.insight.drivers) ? body.insight.drivers : [],
        recommendedActions: Array.isArray(body.insight.recommendedActions)
          ? body.insight.recommendedActions
          : [],
        confidence: body.insight.confidence ?? 0.5,
        assumptions: Array.isArray(body.insight.assumptions) ? body.insight.assumptions : [],
      });
    }

    let prediction = null;
    if (body.prediction?.direction && body.prediction?.rationale) {
      prediction = await addBrandingPrediction({
        companyId,
        direction: body.prediction.direction,
        confidence: body.prediction.confidence ?? 0.5,
        rationale: body.prediction.rationale,
      });
    }

    return NextResponse.json(
      {
        message: "Branding day summary recorded",
        snapshot,
        insight,
        prediction,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown branding summary error";
    return NextResponse.json(
      {
        message: "Unable to save branding summary",
        error: message,
      },
      { status: 500 },
    );
  }
}
