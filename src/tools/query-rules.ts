import { RuleRepo } from "../storage/rule-repo.js";
import { MetricRepo } from "../storage/metric-repo.js";
import { matchRules } from "../engine/rule-matcher.js";
import { QueryRulesInput, MatchContext } from "../types.js";

export async function handleQueryRules(input: QueryRulesInput, ruleRepo: RuleRepo, metricRepo: MetricRepo) {
  const fileExtension = input.filePath.split(".").pop() ?? "";
  const context: MatchContext = { language: input.language, filePath: input.filePath, fileExtension: "." + fileExtension, projectId: input.projectId, ruleTags: input.tags };
  const rules = await ruleRepo.queryByMatch(input.language, "." + fileExtension, input.projectId, input.tags);
  const result = matchRules(rules, context, { topK: 10 });
  for (const sr of result.rules) await ruleRepo.incrementMatchCount(sr.rule.id);
  await metricRepo.track("query_rules", { language: input.language, candidates: rules.length, returned: result.rules.length });
  return { content: [{ type: "text", text: JSON.stringify({ rules: result.rules.map(sr => ({ id: sr.rule.id, type: sr.rule.type, pattern: sr.rule.pattern, suggestion: sr.rule.suggestion, score: sr.score, matchReasons: sr.matchReasons })), totalTokens: result.totalTokens, truncated: result.truncated }) }] };
}
