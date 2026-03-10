// @ts-nocheck
import { NextResponse } from "next/server";

import { Client } from "@notionhq/client";
import { requireInternalToken } from "@/lib/api-auth";

type PropertySummary = {
  name: string;
  type: string;
  options?: string[];
  relationDataSourceId?: string;
};

function normalizeProperties(properties: Record<string, any>): PropertySummary[] {
  return Object.entries(properties).map(([name, property]) => {
    const summary: PropertySummary = {
      name,
      type: property?.type ?? "unknown",
    };

    if (property?.type === "select") {
      summary.options = (property.select?.options ?? [])
        .map((option: { name?: string }) => option?.name)
        .filter((name: string | undefined): name is string => Boolean(name));
    }

    if (property?.type === "status") {
      const groups = property.status?.groups ?? {};
      summary.options = (Object.values(groups).flat() as Array<{ name?: string }>)
        .map((option: { name?: string }) => option?.name)
        .filter((name: string | undefined): name is string => Boolean(name));
    }

    if (property?.type === "relation") {
      summary.relationDataSourceId = property.relation?.data_source_id;
    }

    return summary;
  });
}

async function fetchSchema(notion: Client, dataSourceId: string) {
  const dataSource = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
  const properties = normalizeProperties((dataSource as any).properties ?? {});
  return {
    dataSourceId,
    title: (dataSource as any).title?.[0]?.plain_text ?? "",
    properties,
  };
}

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = requireInternalToken(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const token = process.env.NOTION_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "NOTION_TOKEN is not configured" }, { status: 500 });
    }

    const notion = new Client({ auth: token });
    const { searchParams } = new URL(req.url);
    const dataSourceId = searchParams.get("dataSourceId") ?? undefined;

    if (dataSourceId) {
      const schema = await fetchSchema(notion, dataSourceId);
      return NextResponse.json({ schemas: [schema] }, { status: 200 });
    }

    const configured = [
      process.env.NOTION_DATABASE_TASKS_ID,
      process.env.NOTION_DATABASE_BUSINESSES_ID,
      process.env.NOTION_DATABASE_PROJECTS_ID,
      process.env.NOTION_DATABASE_SESSIONS_ID,
    ].filter((value): value is string => Boolean(value));

    if (configured.length === 0) {
      return NextResponse.json(
        { error: "No Notion database IDs are configured in environment variables" },
        { status: 400 },
      );
    }

    const schemas = await Promise.all(configured.map((id) => fetchSchema(notion, id)));
    return NextResponse.json({ schemas }, { status: 200 });
  } catch (error) {
    console.error("Notion schema read failed", error);
    const message = error instanceof Error ? error.message : "Unknown schema error";
    return NextResponse.json(
      {
        error: "Unable to fetch Notion schema",
        detail: message,
      },
      { status: 500 },
    );
  }
}
