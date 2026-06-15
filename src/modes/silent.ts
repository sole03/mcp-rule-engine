import { AtomicOp, RuleSpec } from "../types.js";
import { evaluateRuleCandidate } from "../engine/rule-generator.js";
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
