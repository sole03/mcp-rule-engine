import { Rule, ScoredRule, MatchContext, MatchResult, DEFAULT_WEIGHTS, SCOPE_PRIORITIES } from "../types.js";
import { truncateRules } from "./token-controller.js";

export function computeScore(rule: Rule, context: MatchContext): number {
  if (rule.language !== "*" && rule.language !== context.language) return 0;
  const now = context.currentTime ?? new Date();
  const { typeWeight, timeWeight, matchWeight, timeDecayLambda } = DEFAULT_WEIGHTS;
  const typeValue = rule.type === "replace" ? 1.0 : rule.type === "restructure" ? 0.8 : 0.6;
  const hoursSinceCreation = (now.getTime() - rule.createdAt.getTime()) / 3600000;
  const timeValue = Math.exp(-timeDecayLambda * hoursSinceCreation);
  let matchValue = 0;
  const path = context.filePath.toLowerCase();
  const contextTags = context.ruleTags ?? [];
  if (rule.tags) {
    for (const tag of rule.tags) {
      if (path.includes(tag.toLowerCase())) matchValue += 1;
    }
    for (const tag of contextTags) {
      if (rule.tags.some(t => t.toLowerCase() === tag.toLowerCase())) matchValue += 1;
    }
  }
  const priorityBonus = SCOPE_PRIORITIES[rule.scope ?? "project"] ?? 0.5;
  const score = (typeWeight * typeValue) + (timeWeight * timeValue) + (matchWeight * (matchValue / Math.max(matchValue, 1)));
  return score * priorityBonus;
}

export interface MatchOptions { topK?: number; maxTokens?: number; }

export function matchRules(rules: Rule[], context: MatchContext, options: MatchOptions = {}): MatchResult {
  const startTime = performance.now();
  const topK = options.topK ?? 10;
  const scored: ScoredRule[] = rules.map(rule => {
    const score = computeScore(rule, context);
    const matchReasons: string[] = [];
    if (rule.language === context.language || rule.language === "*") matchReasons.push("language_match");
    if (rule.tags?.some(t => context.filePath.toLowerCase().includes(t.toLowerCase()))) matchReasons.push("path_match");
    return { rule, score, matchReasons };
  }).filter(s => s.score > 0);
  scored.sort((a, b) => b.score - a.score);
  const topScored = scored.slice(0, topK);
  const { rules: selected, totalTokens, truncated } = truncateRules(topScored.map(s => s.rule), options.maxTokens ?? 2000);
  const resultMap = new Map(topScored.map(s => [s.rule.id, s]));
  const finalScored: ScoredRule[] = selected.map(r => resultMap.get(r.id)).filter((s): s is ScoredRule => s !== undefined);
  return { rules: finalScored, totalTokens, truncated, queryDurationMs: performance.now() - startTime };
}
