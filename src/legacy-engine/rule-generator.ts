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

/**
 * @deprecated LEGACY ENGINE MODULE — Preserved for reference only.
 * Do NOT modify. The new cognition-engine module replaces this entire subsystem.
 * See src/cognition-engine/ for the replacement.
 */

import { AtomicOp, RuleConfidence, RuleSpec, RULE_GENERATION_THRESHOLDS } from "../types.js";

export interface RuleCandidateEval {
  generate: boolean;
  ruleCandidate?: RuleSpec & { confidence?: RuleConfidence };
  reason: string;
  confidence: RuleConfidence;
}

export function evaluateRuleCandidate(
  ops: AtomicOp[], language: string,
  distinctFiles: number, repeatCount: number, windowDays: number,
): RuleCandidateEval {
  if (ops.length === 0) {
    return { generate: false, reason: "no operations", confidence: "medium" };
  }
  const meetsFileThreshold = distinctFiles >= RULE_GENERATION_THRESHOLDS.minDistinctFiles;
  const meetsRepeatThreshold = repeatCount >= RULE_GENERATION_THRESHOLDS.minRepeatsInDays;
  if (!meetsFileThreshold && !meetsRepeatThreshold) {
    return { generate: false, reason: `below threshold: ${distinctFiles} files (need ${RULE_GENERATION_THRESHOLDS.minDistinctFiles}), ${repeatCount} repeats (need ${RULE_GENERATION_THRESHOLDS.minRepeatsInDays})`, confidence: "medium" };
  }
  const updateOps = ops.filter(o => o.type === "UPDATE");
  const moveOps = ops.filter(o => o.type === "MOVE");
  let ruleType: RuleSpec["type"] = "replace";
  if (moveOps.length > 0 && moveOps.length >= updateOps.length) ruleType = "restructure";
  if (ops.every(o => o.type === "INSERT" || o.type === "DELETE")) {
    return { generate: false, reason: "only insert/delete ops with insufficient pattern", confidence: "low" };
  }
  const dominantUpdate = updateOps.length > 0 ? updateOps[0] : ops[0];
  const pattern = dominantUpdate.originalText ?? "";
  const suggestion = dominantUpdate.modifiedText ?? "";
  let confidence: RuleConfidence = "high";
  if (ops.length > 3) confidence = "low";
  else if (ops.some(o => o.type === "INSERT" || o.type === "DELETE")) confidence = "medium";
  return {
    generate: true,
    ruleCandidate: { type: ruleType, pattern, suggestion, language, confidence },
    reason: `meets threshold: ${distinctFiles} files, ${repeatCount} repeats`,
    confidence,
  };
}
