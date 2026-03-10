import { NextResponse } from "next/server";

import { requireInternalToken } from "@/lib/api-auth";
import { discoverSkillPacks } from "@/lib/agents/skills";

export async function GET(request: Request) {
  try {
    const auth = requireInternalToken(request);
    if (!auth.ok) {
      return NextResponse.json({ message: auth.message }, { status: auth.status });
    }

    const skills = await discoverSkillPacks();
    return NextResponse.json({ skills }, { status: 200 });
  } catch (error) {
    console.error("Skill discovery failed", error);
    return NextResponse.json({ error: "Unable to discover skills" }, { status: 500 });
  }
}
