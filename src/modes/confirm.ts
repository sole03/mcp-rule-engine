import { AtomicOp, RuleSpec } from "../types.js";
import { evaluateRuleCandidate } from "../engine/rule-generator.js";
import { MetricRepo } from "../storage/metric-repo.js";

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
