import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);
  const notionConfigured = Boolean(
    process.env.NOTION_TOKEN && process.env.NOTION_DATABASE_TASKS_ID,
  );

  const preferredProvider = geminiConfigured
    ? "gemini"
    : openaiConfigured
      ? "openai"
      : "fallback";

  return NextResponse.json(
    {
      providers: {
        gemini: {
          configured: geminiConfigured,
          model: process.env.GEMINI_CHAT_MODEL || "gemini-3.1-pro-preview",
        },
        openai: {
          configured: openaiConfigured,
          model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
        },
      },
      notion: {
        configured: notionConfigured,
      },
      preferredProvider,
      ready: geminiConfigured || openaiConfigured,
    },
    { status: 200 },
  );
}
