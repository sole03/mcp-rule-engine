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

import { AtomicOp, RuleSpec } from "../types.js";
import { evaluateRuleCandidate } from "../legacy-engine/rule-generator.js";
import { MetricRepo } from "../storage/metric-repo.js";

export interface SilentModeResult { generatedRule: boolean; ruleSpec?: RuleSpec; notification?: string; }

export async function processSilent(
  ops: AtomicOp[], language: string,
  distinctFiles: number, repeatCount: number, windowDays: number, metricRepo: MetricRepo,
): Promise<SilentModeResult> {
  const evalResult = evaluateRuleCandidate(ops, language, distinctFiles, repeatCount, windowDays);
  await metricRepo.track("silent_mode_process", { opsCount: ops.length, language, generated: evalResult.generate });
  if (!evalResult.generate) return { generatedRule: false };
  return { generatedRule: true, ruleSpec: evalResult.ruleCandidate, notification: `已学习新规则: ${evalResult.ruleCandidate!.type} — ${evalResult.ruleCandidate!.pattern}` };
}
