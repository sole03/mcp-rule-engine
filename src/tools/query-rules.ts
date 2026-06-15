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

import { existsSync, readFileSync } from "fs";
import { RuleRepo } from "../storage/rule-repo.js";
import { MetricRepo } from "../storage/metric-repo.js";
import { matchRules } from "../legacy-engine/rule-matcher.js";
import { truncateRules } from "../legacy-engine/token-controller.js";
import { QueryRulesInput, MatchContext, TOKEN_LIMITS } from "../types.js";

/** Generate a <rules_enforcement> block for system prompt injection (P2 risk mitigation). */
function generateEnforcementBlock(rules: { type: string; pattern: string; suggestion: string }[]): string {
  if (rules.length === 0) return "";
  const lines = rules.map(r => `- [${r.type}] "${r.pattern}" → "${r.suggestion}"`);
  return `<rules_enforcement>\n${lines.join("\n")}\n</rules_enforcement>`;
}

export async function handleQueryRules(input: QueryRulesInput, ruleRepo: RuleRepo, metricRepo: MetricRepo) {
  const startTime = performance.now();
  const ext = input.filePath.split(".").pop() ?? "";
  // Read file content for pattern matching; silently continue if file is unavailable
  let fileContent = "";
  try {
    if (existsSync(input.filePath)) {
      fileContent = readFileSync(input.filePath, "utf-8");
    }
  } catch { /* non-critical: content-based matching will be skipped */ }
  const ctx: MatchContext = { language: input.language, filePath: input.filePath, fileExtension: "." + ext, projectId: input.projectId, ruleTags: input.tags, fileContent };
  const rules = await ruleRepo.queryByMatch(input.language, "." + ext, input.projectId, input.tags);
  const result = matchRules(rules, ctx, { topK: 10 });
  if (input.taskId) {
    const sess = truncateRules(result.rules.map(s => s.rule), 2000, input.taskId);
    result.rules = result.rules.filter(sr => sess.rules.some(s => s.id === sr.rule.id));
    result.totalTokens = sess.totalTokens;
    result.truncated = sess.truncated;
  }
  for (const sr of result.rules) await ruleRepo.incrementMatchCount(sr.rule.id);
  const durationMs = performance.now() - startTime;
  await metricRepo.track("query_rules", { language: input.language, candidates: rules.length, returned: result.rules.length, durationMs });
  // Build enforcement block for system prompt injection (P2)
  const enforcement = generateEnforcementBlock(result.rules.map(sr => ({ type: sr.rule.type, pattern: sr.rule.pattern, suggestion: sr.rule.suggestion })));
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        rules: result.rules.map(sr => ({ id: sr.rule.id, type: sr.rule.type, pattern: sr.rule.pattern, suggestion: sr.rule.suggestion, score: sr.score, matchReasons: sr.matchReasons })),
        totalTokens: result.totalTokens,
        truncated: result.truncated,
        queryDurationMs: durationMs,
        enforcement,
      }),
    }],
  };
}
