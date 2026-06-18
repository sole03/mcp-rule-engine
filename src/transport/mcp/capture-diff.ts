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

import type { IRuleRepository } from "../../data/repository-interfaces.js";
import type { IDiffLogRepository } from "../../data/repository-interfaces.js";
import type { IMetricRepository } from "../../data/repository-interfaces.js";
import { computeDiffWithFallback } from "../../analysis/parsers.js";
import { processSilent } from "../../guards/silent-mode.js";
import { buildConfirmCard } from "../../guards/confirm-mode.js";
import { CaptureDiffInput, RULE_GENERATION_THRESHOLDS } from "../../core/types.js";
import { CognitionRepository } from "../../data/cognition-repository.js";
import { recognizeIntent } from "../../core/intent-recognizer.js";
import type { IntentResult } from "../../core/cognition-types.js";

function simpleHash(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) { hash = ((hash << 5) - hash) + s.charCodeAt(i); hash |= 0; }
  return hash.toString(16);
}

/**
 * Persist the full cognition closure for every capture_diff:
 *    PATTERN node  → (modified content hash)
 *    INTENT node   → (intent recognition result)
 *    INTENT ──CAUSES──→ PATTERN edge
 * Best-effort: failures never block the diff pipeline.
 */
async function upsertCognitionClosure(
  filePath: string,
  language: string,
  projectId: string | undefined,
  modifiedHash: string,
  originalHash: string,
  modifiedContent: string,
  diffOpCount: number,
  ruleGenerated: boolean,
  diffStatus: string,
) {
  try {
    const repo = new CognitionRepository();

    // ── PATTERN node (existing logic) ──
    const existing = await repo.findNodesBySemanticHash(modifiedHash);
    const patternPayload = {
      filePath,
      language,
      projectId: projectId ?? null,
      diffOpCount,
      ruleGenerated,
      diffStatus,
      lastSeen: new Date().toISOString(),
    };
    const patternMeta = {
      source: "capture_diff",
      diffRetentionDays: RULE_GENERATION_THRESHOLDS.repeatWindowDays,
      occurrences: (existing?.[0]?.metadata as any)?.occurrences
        ? (existing![0].metadata as any).occurrences + 1 : 1,
    };
    const patternNode = await repo.createNodeWithEdges({
      type: "PATTERN",
      semanticHash: modifiedHash,
      abstractionLevel: 0,
      payload: patternPayload,
      metadata: patternMeta,
    });

    // ── INTENT node ──
    // Build a minimal unified diff for intent recognition
    const diffLines = modifiedContent.split("\n");
    const diffText = [
      "diff --git a/" + filePath + " b/" + filePath,
      "@@ -0,0 +" + diffLines.length + " @@",
      ...diffLines.map(l => "+" + l),
    ].join("\n");
    const intentResult: IntentResult = await recognizeIntent(diffText, filePath);

    const intentHash = simpleHash(filePath + ":" + intentResult.intent + ":" + modifiedHash);
    const intentPayload = {
      filePath,
      language,
      projectId: projectId ?? null,
      intent: intentResult.intent,
      confidence: intentResult.confidence,
      reasoning: intentResult.reasoning,
      stats: intentResult.stats,
      lastSeen: new Date().toISOString(),
    };
    const intentMeta = {
      source: "capture_diff",
      confidence: intentResult.confidence,
      reasoning: intentResult.reasoning,
    };
    const intentNode = await repo.createNodeWithEdges({
      type: "INTENT",
      semanticHash: intentHash,
      abstractionLevel: 1, // FUNCTION level — bridges code to goal
      payload: intentPayload,
      metadata: intentMeta,
    });

    // ── INTENT ──CAUSES──→ PATTERN edge ──
    await repo.createEdge({
      sourceId: intentNode.id,
      targetId: patternNode.id,
      relation: "CAUSES",
      weight: intentResult.confidence,
      metadata: { source: "capture_diff", intent: intentResult.intent },
    });
  } catch {
    // Best-effort: cognition closure upsert should never block the diff pipeline
  }
}

export async function handleCaptureDiff(input: CaptureDiffInput, ruleRepo: IRuleRepository, diffLogRepo: IDiffLogRepository, metricRepo: IMetricRepository, mode: "silent" | "confirm") {
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
    warnings.push("规则库已达上限：全局 " + limitInfo.globalCount + "/" + limitInfo.globalMax + "，项目 " + limitInfo.projectCount + "/" + limitInfo.projectMax + "。建议归档或导出旧规则。");
  }
  const durationMs = performance.now() - startTime;
  await metricRepo.track("capture_diff", { language: input.language, opCount: diffResult.operations.length, astStatus: diffResult.status, durationMs });

  let ruleWasGenerated = false;
  let confirmCard: any = null;

  if (mode === "silent") {
    const result = await processSilent(diffResult.operations, input.language, distinctFiles, repeatCount, RULE_GENERATION_THRESHOLDS.repeatWindowDays, metricRepo);
    if (!limitInfo.reached && result.generatedRule && result.ruleSpec) {
      await ruleRepo.create({ ...result.ruleSpec, projectId: input.projectId });
      await metricRepo.track("rule_auto_generated", { language: input.language, source: "capture_diff" });
      ruleWasGenerated = true;
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
  } else {
    const card = await buildConfirmCard(diffResult.operations, input.language, distinctFiles, repeatCount, RULE_GENERATION_THRESHOLDS.repeatWindowDays, metricRepo);
    confirmCard = card.card ?? null;
  }

  // Persist full cognition closure for every diff (fire-and-forget, best-effort)
  upsertCognitionClosure(input.filePath, input.language, input.projectId, modifiedHash, originalHash, input.modifiedContent, diffResult.operations.length, ruleWasGenerated, diffResult.status).catch(() => {});

  if (mode === "silent") {
    return { content: [{ type: "text", text: JSON.stringify({ status: diffResult.status, opCount: diffResult.operations.length, notification: ruleWasGenerated ? "rule generated" : "diff captured", warnings: warnings.length > 0 ? warnings : undefined }) }] };
  } else {
    return { content: [{ type: "text", text: JSON.stringify({ status: diffResult.status, opCount: diffResult.operations.length, confirmCard, warnings: warnings.length > 0 ? warnings : undefined }) }] };
  }
}
