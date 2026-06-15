import { RuleRepo } from "../storage/rule-repo.js";
import { ListRulesInput } from "../types.js";

export async function handleListRules(input: ListRulesInput, ruleRepo: RuleRepo) {
  const rules = await ruleRepo.list({ language: input.language, scope: input.scope, status: input.status, projectId: input.projectId, limit: input.limit, offset: input.offset });
  return { content: [{ type: "text", text: JSON.stringify({ rules: rules.map(r => ({ id: r.id, type: r.type, pattern: r.pattern, suggestion: r.suggestion, language: r.language, scope: r.scope, priority: r.priority, status: r.status, matchCount: r.matchCount, createdAt: r.createdAt })), total: rules.length }) }] };
}
