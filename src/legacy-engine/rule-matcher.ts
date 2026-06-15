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

/**
 * @deprecated LEGACY ENGINE MODULE — Preserved for reference only.
 * Do NOT modify. The new cognition-engine module replaces this entire subsystem.
 * See src/cognition-engine/ for the replacement.
 */

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
  const content = context.fileContent?.toLowerCase() ?? "";
  const contextTags = context.ruleTags ?? [];
  if (rule.tags) {
    for (const tag of rule.tags) {
      if (path.includes(tag.toLowerCase())) matchValue += 1;
    }
    for (const tag of contextTags) {
      if (rule.tags.some(t => t.toLowerCase() === tag.toLowerCase())) matchValue += 1;
    }
  }
  // Content-based pattern matching: if rule pattern appears in file content, strong signal
  if (content && rule.pattern) {
    const patternLower = rule.pattern.toLowerCase();
    if (content.includes(patternLower)) {
      matchValue += 2;
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
    // New match reason for content-based pattern matching
    if (context.fileContent && rule.pattern && context.fileContent.toLowerCase().includes(rule.pattern.toLowerCase())) {
      matchReasons.push("content_match");
    }
    return { rule, score, matchReasons };
  }).filter(s => s.score > 0);
  scored.sort((a, b) => b.score - a.score);
  const topScored = scored.slice(0, topK);
  const { rules: selected, totalTokens, truncated } = truncateRules(topScored.map(s => s.rule), options.maxTokens ?? 2000);
  const resultMap = new Map(topScored.map(s => [s.rule.id, s]));
  const finalScored: ScoredRule[] = selected.map(r => resultMap.get(r.id)).filter((s): s is ScoredRule => s !== undefined);
  return { rules: finalScored, totalTokens, truncated, queryDurationMs: performance.now() - startTime };
}
