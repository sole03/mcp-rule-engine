/**
 * Copyright 2026 熊高锐
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { RuleRepo } from "../storage/rule-repo.js";
import { DiffLogRepo } from "../storage/diff-log-repo.js";
import { MetricRepo } from "../storage/metric-repo.js";
import { computeDiffWithFallback } from "../legacy-engine/parsers.js";
import { processSilent } from "../modes/silent.js";
import { buildConfirmCard } from "../modes/confirm.js";
import { CaptureDiffInput, RULE_GENERATION_THRESHOLDS } from "../types.js";

function simpleHash(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) { hash = ((hash << 5) - hash) + s.charCodeAt(i); hash |= 0; }
  return hash.toString(16);
}

export async function handleCaptureDiff(input: CaptureDiffInput, ruleRepo: RuleRepo, diffLogRepo: DiffLogRepo, metricRepo: MetricRepo, mode: "silent" | "confirm") {
  const startTime = performance.now();
  const fileExtension = input.filePath.split(".").pop() ?? "";
  const originalHash = simpleHash(input.originalContent);
  const modifiedHash = simpleHash(input.modifiedContent);
  const diffResult = await computeDiffWithFallback(input.originalContent, input.modifiedContent, input.language);
  await diffLogRepo.create({ filePath: input.filePath, fileExtension, language: input.language, projectId: input.projectId, originalHash, modifiedHash, diffContent: JSON.stringify(diffResult.operations), astStatus: diffResult.status, diffType: diffResult.operations[0]?.type ?? "update", operations: JSON.stringify(diffResult.operations) });
  const distinctFiles = await diffLogRepo.countDistinctFiles(input.language, originalHash, RULE_GENERATION_THRESHOLDS.repeatWindowDays);
  const repeatCount = await diffLogRepo.countByPattern(input.language, originalHash, RULE_GENERATION_THRESHOLDS.repeatWindowDays);
  // Check rule limits before generating rules (P1)
  const limitInfo = await ruleRepo.getLimitInfo(input.projectId);
  const warnings: string[] = [];
  if (limitInfo.reached) {
    warnings.push(`规则库已达上限：全局 ${limitInfo.globalCount}/${limitInfo.globalMax}，项目 ${limitInfo.projectCount}/${limitInfo.projectMax}。建议归档或导出旧规则。`);
  }
  const durationMs = performance.now() - startTime;
  await metricRepo.track("capture_diff", { language: input.language, opCount: diffResult.operations.length, astStatus: diffResult.status, durationMs });
  if (mode === "silent") {
    const result = await processSilent(diffResult.operations, input.language, distinctFiles, repeatCount, RULE_GENERATION_THRESHOLDS.repeatWindowDays, metricRepo);
    if (!limitInfo.reached && result.generatedRule && result.ruleSpec) {
      await ruleRepo.create({ ...result.ruleSpec, projectId: input.projectId });
      await metricRepo.track("rule_auto_generated", { language: input.language, source: "capture_diff" });
    }
    // Fallback: even when no high-confidence rule is generated, capture a low-confidence
    // candidate into the rule repo so the cognition graph can learn from this diff.
    if (!result.generatedRule && diffResult.operations.length > 0) {
      const fallbackOp = diffResult.operations[0];
      const fallbackSpec = {
        type: (fallbackOp.type === "MOVE" ? "restructure" : "replace") as any,
        pattern: fallbackOp.originalText ?? "",
        suggestion: fallbackOp.modifiedText ?? "",
        language: input.language,
        confidence: "low" as any,
      };
      if (fallbackSpec.pattern && fallbackSpec.suggestion) {
        try { await ruleRepo.create({ ...fallbackSpec, projectId: input.projectId }); }
        catch { /* best-effort; rule may conflict */ }
      }
    }
    return { content: [{ type: "text", text: JSON.stringify({ status: diffResult.status, opCount: diffResult.operations.length, notification: result.notification ?? "fallback: low-confidence rule captured", warnings: warnings.length > 0 ? warnings : undefined }) }] };
  } else {
    const card = await buildConfirmCard(diffResult.operations, input.language, distinctFiles, repeatCount, RULE_GENERATION_THRESHOLDS.repeatWindowDays, metricRepo);
    return { content: [{ type: "text", text: JSON.stringify({ status: diffResult.status, opCount: diffResult.operations.length, confirmCard: card.card ?? null, warnings: warnings.length > 0 ? warnings : undefined }) }] };
  }
}
