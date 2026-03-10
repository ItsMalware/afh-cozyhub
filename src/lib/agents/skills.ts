import { readdir } from "node:fs/promises";
import { join } from "node:path";

export type SkillPack = {
  name: string;
  skillPath: string;
  scriptsPath?: string;
};

async function pathExists(path: string): Promise<boolean> {
  try {
    await readdir(path);
    return true;
  } catch {
    return false;
  }
}

export async function discoverSkillPacks(): Promise<SkillPack[]> {
  const codeHome = process.env.CODEX_HOME ?? join(process.env.HOME ?? "", ".codex");
  const root = join(codeHome, "skills");
  const results: SkillPack[] = [];

  let skillDirs: string[] = [];
  try {
    skillDirs = await readdir(root);
  } catch {
    return [];
  }

  for (const dirName of skillDirs) {
    const base = join(root, dirName);
    const skillMd = join(base, "SKILL.md");
    const scriptDir = join(base, "scripts");

    try {
      const files = await readdir(base);
      if (files.includes("SKILL.md")) {
        results.push({
          name: dirName,
          skillPath: skillMd,
          scriptsPath: (await pathExists(scriptDir)) ? scriptDir : undefined,
        });
      }
    } catch {
      // Skip invalid directory entries.
    }
  }

  return results;
}
