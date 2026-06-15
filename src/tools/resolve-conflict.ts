import { ConflictRepo } from "../storage/conflict-repo.js";
import { RuleRepo } from "../storage/rule-repo.js";
import { MetricRepo } from "../storage/metric-repo.js";
import { applyResolution } from "../conflict/arbitrator.js";
import { ResolveConflictInput } from "../types.js";

export async function handleResolveConflict(input: ResolveConflictInput, conflictRepo: ConflictRepo, ruleRepo: RuleRepo, metricRepo: MetricRepo) {
  const conflict = await conflictRepo.findById(input.conflictId);
  if (!conflict) return { content: [{ type: "text", text: JSON.stringify({ error: "Conflict not found" }) }], isError: true };
  const ruleA = await ruleRepo.findById(conflict.ruleAId);
  const ruleB = await ruleRepo.findById(conflict.ruleBId);
  if (!ruleA || !ruleB) return { content: [{ type: "text", text: JSON.stringify({ error: "Referenced rule not found" }) }], isError: true };
  const arbitration = applyResolution(ruleA, ruleB, input.resolution);
  await conflictRepo.resolve(input.conflictId, input.resolution);
  if (arbitration) await ruleRepo.create({ ...arbitration, projectId: ruleA.projectId });
  if (input.batchAllSession) await conflictRepo.setBatchChoice(input.conflictId, "session:" + input.resolution);
  await metricRepo.track("conflict_resolved", { conflictId: input.conflictId, resolution: input.resolution });
  return { content: [{ type: "text", text: JSON.stringify({ success: true, resolution: input.resolution, arbitrationCreated: !!arbitration }) }] };
}
