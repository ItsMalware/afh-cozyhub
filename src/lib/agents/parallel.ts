import { createDelegationPlan } from "@/lib/agents/delegation";
import { writeReplayArtifact } from "@/lib/agents/replay";

function splitIntoSubTasks(task: string): string[] {
  const normalized = task
    .split(/\n+/)
    .flatMap((line) => line.split(/\s+and\s+|;/i))
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const unique = [...new Set(normalized)];
  if (unique.length >= 2) {
    return unique.slice(0, 4);
  }
  return [`Analyze: ${task}`, `Implement: ${task}`];
}

export async function orchestrateParallel(input: {
  task: string;
  subTasks?: string[];
  modelRouting?: {
    reasoning?: string;
    research?: string;
    speed?: string;
  };
}) {
  const subTasks =
    input.subTasks && input.subTasks.length >= 2 ? input.subTasks : splitIntoSubTasks(input.task);

  const startedAt = Date.now();
  const subPlans = await Promise.all(
    subTasks.map(async (subTask) => {
      const plan = await createDelegationPlan(subTask);
      return {
        subTask,
        plan,
      };
    }),
  );
  const durationMs = Date.now() - startedAt;

  const mergedSummary = [
    `Parallel branches: ${subPlans.length}`,
    ...subPlans.map(
      (branch) =>
        `- ${branch.subTask}: ${branch.plan.execution.mode} via ${branch.plan.specialist.name}`,
    ),
  ].join("\n");

  const replay = await writeReplayArtifact({
    kind: "parallel_orchestration",
    input: {
      task: input.task,
      subTasks,
      modelRouting: input.modelRouting ?? {
        reasoning: "gemini-3.1-pro-preview",
        research: "gemini-3.1-pro-preview",
        speed: "gpt-4o-mini",
      },
    },
    steps: [
      {
        at: new Date().toISOString(),
        actor: "Prime",
        action: "parallel_spawn",
        detail: `Spawned ${subPlans.length} sub-agents`,
      },
    ],
    output: {
      mergedSummary,
      durationMs,
      subPlanCount: subPlans.length,
    },
    metadata: {
      costMode: "rule-first",
    },
  });

  return {
    task: input.task,
    subTasks,
    subPlans,
    mergedSummary,
    durationMs,
    replayId: replay.replayId,
  };
}
