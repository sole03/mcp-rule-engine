import { RuleRepo } from "../storage/rule-repo.js";
import { MetricRepo } from "../storage/metric-repo.js";
import { ConfirmRuleInput } from "../types.js";

export async function handleConfirmRule(input: ConfirmRuleInput, ruleRepo: RuleRepo, metricRepo: MetricRepo) {
  const rule = await ruleRepo.findById(input.ruleId);
  if (!rule) return { content: [{ type: "text", text: JSON.stringify({ error: "Rule not found" }) }], isError: true };
  switch (input.action) {
    case "accept": await ruleRepo.updateStatus(input.ruleId, "active"); break;
    case "reject": await ruleRepo.updateStatus(input.ruleId, "archived"); break;
    case "edit": {
      // Persist the edited pattern and/or suggestion
      const updated = await ruleRepo.updateContent(input.ruleId, {
        pattern: input.editedPattern,
        suggestion: input.editedSuggestion,
      });
      // Read back and verify the update was actually persisted
      const verified = await ruleRepo.findById(input.ruleId);
      if (input.editedPattern !== undefined && verified?.pattern !== input.editedPattern) {
        return {
          content: [{ type: "text", text: JSON.stringify({
            error: "Edit verification failed: pattern was not persisted",
            ruleId: input.ruleId,
            expectedPattern: input.editedPattern,
            actualPattern: verified?.pattern,
          }) }],
          isError: true,
        };
      }
      if (input.editedSuggestion !== undefined && verified?.suggestion !== input.editedSuggestion) {
        return {
          content: [{ type: "text", text: JSON.stringify({
            error: "Edit verification failed: suggestion was not persisted",
            ruleId: input.ruleId,
            expectedSuggestion: input.editedSuggestion,
            actualSuggestion: verified?.suggestion,
          }) }],
          isError: true,
        };
      }
      break;
    }
    case "skip": break;
  }
  await metricRepo.track("rule_confirmed", { ruleId: input.ruleId, action: input.action });
  return { content: [{ type: "text", text: JSON.stringify({ success: true, ruleId: input.ruleId, action: input.action }) }] };
}
