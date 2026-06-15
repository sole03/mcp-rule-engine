import { Rule, TOKEN_LIMITS } from "../types.js";

export function estimateTokens(text: string): number {
  const bytes = new TextEncoder().encode(text).length;
  return Math.ceil(bytes / 3.5);
}

function formatRule(r: Rule): string {
  const tagsStr = r.tags?.length ? " [" + r.tags.join(", ") + "]" : "";
  const extStr = r.fileExtensions?.length ? " (files: " + r.fileExtensions.join(", ") + ")" : "";
  return `[${r.type}] ${r.pattern} → ${r.suggestion}${extStr}${tagsStr}${r.priority !== 1.0 ? " priority:" + r.priority : ""}`;
}

export function truncateRules(rules: Rule[], maxTokens: number = TOKEN_LIMITS.maxInjectionTokens) {
  let totalTokens = 0;
  const selected: Rule[] = [];
  const budget = Math.min(maxTokens, TOKEN_LIMITS.maxInjectionTokens);
  for (const rule of rules) {
    const formatted = formatRule(rule);
    const tokens = estimateTokens(formatted);
    if (tokens > TOKEN_LIMITS.maxSingleRuleTokens) continue;
    if (totalTokens + tokens > budget) break;
    selected.push(rule);
    totalTokens += tokens;
  }
  return { rules: selected, totalTokens, truncated: selected.length < rules.length };
}
