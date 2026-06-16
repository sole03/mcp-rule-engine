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

import { AtomicOp, RuleSpec } from "../core/types.js";
import { evaluateRuleCandidate } from "../analysis/rule-generator.js";
import { MetricRepo } from "../data/metric-repo.js";

export type ConfirmAction = "accept" | "reject" | "edit" | "skip";

export interface ConfirmCard { title: string; ruleSpec: RuleSpec; actions: ConfirmAction[]; message: string; }

export async function buildConfirmCard(
  ops: AtomicOp[], language: string,
  distinctFiles: number, repeatCount: number, windowDays: number, metricRepo: MetricRepo,
): Promise<{ shouldShow: boolean; card?: ConfirmCard }> {
  const evalResult = evaluateRuleCandidate(ops, language, distinctFiles, repeatCount, windowDays);
  await metricRepo.track("confirm_mode_eval", { opsCount: ops.length, language, generated: evalResult.generate });
  if (!evalResult.generate || !evalResult.ruleCandidate) return { shouldShow: false };
  return {
    shouldShow: true,
    card: { title: "检测到新的编码规则候选", ruleSpec: evalResult.ruleCandidate, actions: ["accept", "reject", "edit", "skip"], message: `类型: ${evalResult.ruleCandidate.type}\n模式: ${evalResult.ruleCandidate.pattern}\n建议: ${evalResult.ruleCandidate.suggestion}\n置信度: ${evalResult.ruleCandidate.confidence}` },
  };
}
