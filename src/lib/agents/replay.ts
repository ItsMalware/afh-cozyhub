import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), "data");
const REPLAY_DIR = join(DATA_DIR, "agent-replay");

export type ReplayArtifact = {
  replayId: string;
  createdAt: string;
  kind: string;
  input: Record<string, unknown>;
  steps: Array<{
    at: string;
    actor: string;
    action: string;
    detail?: string;
    payload?: Record<string, unknown>;
  }>;
  output: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export async function writeReplayArtifact(
  artifact: Omit<ReplayArtifact, "replayId" | "createdAt">,
): Promise<{ replayId: string; filePath: string }> {
  const replayId = randomUUID();
  const createdAt = new Date().toISOString();
  await mkdir(REPLAY_DIR, { recursive: true });
  const filePath = join(REPLAY_DIR, `${createdAt.slice(0, 10)}-${replayId}.json`);
  const fullArtifact: ReplayArtifact = {
    replayId,
    createdAt,
    ...artifact,
  };
  await writeFile(filePath, JSON.stringify(fullArtifact, null, 2), "utf8");
  return { replayId, filePath };
}

export async function listReplayArtifacts(limit = 20): Promise<
  Array<{
    replayId: string;
    createdAt: string;
    kind: string;
    filePath: string;
  }>
> {
  try {
    const files = await readdir(REPLAY_DIR);
    const entries = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          const filePath = join(REPLAY_DIR, file);
          const fileStat = await stat(filePath);
          return { filePath, mtime: fileStat.mtimeMs };
        }),
    );

    const sorted = entries.sort((a, b) => b.mtime - a.mtime).slice(0, limit);
    return Promise.all(
      sorted.map(async (entry) => {
        const raw = await readFile(entry.filePath, "utf8");
        const parsed = JSON.parse(raw) as Partial<ReplayArtifact>;
        return {
          replayId: parsed.replayId ?? "",
          createdAt: parsed.createdAt ?? "",
          kind: parsed.kind ?? "unknown",
          filePath: entry.filePath,
        };
      }),
    );
  } catch {
    return [];
  }
}
