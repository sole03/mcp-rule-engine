import { RuleRepo } from "../storage/rule-repo.js";
import { MetricRepo } from "../storage/metric-repo.js";
import { ConfirmRuleInput } from "../types.js";

export async function handleConfirmRule(input: ConfirmRuleInput, ruleRepo: RuleRepo, metricRepo: MetricRepo) {
  const rule = await ruleRepo.findById(input.ruleId);
  if (!rule) return { content: [{ type: "text", text: JSON.stringify({ error: "Rule not found" }) }], isError: true };
  switch (input.action) {
    case "accept": await ruleRepo.updateStatus(input.ruleId, "active"); break;
    case "reject": await ruleRepo.updateStatus(input.ruleId, "archived"); break;
    case "edit": await ruleRepo.updateStatus(input.ruleId, "active"); break;
    case "skip": break;
  }
  await metricRepo.track("rule_confirmed", { ruleId: input.ruleId, action: input.action });
  return { content: [{ type: "text", text: JSON.stringify({ success: true, ruleId: input.ruleId, action: input.action }) }] };
}
