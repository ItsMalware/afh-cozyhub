import { NextResponse } from "next/server";

import { discoverSkillPacks } from "@/lib/agents/skills";

export async function GET() {
  try {
    const skills = await discoverSkillPacks();
    return NextResponse.json({ skills }, { status: 200 });
  } catch (error) {
    console.error("Skill discovery failed", error);
    return NextResponse.json({ error: "Unable to discover skills" }, { status: 500 });
  }
}
