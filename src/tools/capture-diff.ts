import { RuleRepo } from "../storage/rule-repo.js";
import { DiffLogRepo } from "../storage/diff-log-repo.js";
import { MetricRepo } from "../storage/metric-repo.js";
import { computeDiffWithFallback } from "../engine/parsers.js";
import { processSilent } from "../modes/silent.js";
import { buildConfirmCard } from "../modes/confirm.js";
import { CaptureDiffInput, RULE_GENERATION_THRESHOLDS } from "../types.js";

function simpleHash(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) { hash = ((hash << 5) - hash) + s.charCodeAt(i); hash |= 0; }
  return hash.toString(16);
}

export async function handleCaptureDiff(input: CaptureDiffInput, ruleRepo: RuleRepo, diffLogRepo: DiffLogRepo, metricRepo: MetricRepo, mode: "silent" | "confirm") {
  const fileExtension = input.filePath.split(".").pop() ?? "";
  const originalHash = simpleHash(input.originalContent);
  const modifiedHash = simpleHash(input.modifiedContent);
  const diffResult = await computeDiffWithFallback(input.originalContent, input.modifiedContent, input.language);
  await diffLogRepo.create({ filePath: input.filePath, fileExtension, language: input.language, projectId: input.projectId, originalHash, modifiedHash, diffContent: JSON.stringify(diffResult.operations), astStatus: diffResult.status, diffType: diffResult.operations[0]?.type ?? "update", operations: JSON.stringify(diffResult.operations) });
  const distinctFiles = await diffLogRepo.countDistinctFiles(input.language, originalHash, RULE_GENERATION_THRESHOLDS.repeatWindowDays);
  const repeatCount = await diffLogRepo.countByPattern(input.language, originalHash, RULE_GENERATION_THRESHOLDS.repeatWindowDays);
  if (mode === "silent") {
    const result = await processSilent(diffResult.operations, input.language, distinctFiles, repeatCount, RULE_GENERATION_THRESHOLDS.repeatWindowDays, metricRepo);
    if (result.generatedRule && result.ruleSpec) { await ruleRepo.create({ ...result.ruleSpec, projectId: input.projectId }); await metricRepo.track("rule_auto_generated", { language: input.language }); }
    return { content: [{ type: "text", text: JSON.stringify({ status: diffResult.status, opCount: diffResult.operations.length, notification: result.notification ?? null }) }] };
  } else {
    const card = await buildConfirmCard(diffResult.operations, input.language, distinctFiles, repeatCount, RULE_GENERATION_THRESHOLDS.repeatWindowDays, metricRepo);
    return { content: [{ type: "text", text: JSON.stringify({ status: diffResult.status, opCount: diffResult.operations.length, confirmCard: card.card ?? null }) }] };
  }
}
