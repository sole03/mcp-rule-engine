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

import { describe, it, expect } from "vitest";
import { matchRules, computeScore } from "../../src/analysis/rule-matcher.js";
import { Rule, MatchContext } from "../../src/core/types.js";

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return { id: "1", type: "replace", pattern: "foo", suggestion: "bar", language: "typescript", priority: 1.0, scope: "project", confidence: "high", source: "auto", status: "active", matchCount: 3, tags: ["api", "utils"], createdAt: new Date(Date.now() - 86400000 * 2), updatedAt: new Date(), lastUsedAt: new Date(), ...overrides };
}

describe("Rule Matcher", () => {
  it("scores higher for exact language match", () => {
    expect(computeScore(makeRule({ language: "typescript" }), { language: "typescript", filePath: "utils.ts", fileExtension: ".ts" })).toBeGreaterThan(0);
  });
  it("scores zero for non-matching language", () => {
    expect(computeScore(makeRule({ language: "python" }), { language: "typescript", filePath: "utils.ts", fileExtension: ".ts" })).toBe(0);
  });
  it("scores wildcard for all languages", () => {
    expect(computeScore(makeRule({ language: "*" }), { language: "go", filePath: "main.go", fileExtension: ".go" })).toBeGreaterThan(0);
  });
  it("decays score over time", () => {
    const ctx: MatchContext = { language: "typescript", filePath: "utils.ts", fileExtension: ".ts" };
    const oldScore = computeScore(makeRule({ createdAt: new Date(Date.now() - 86400000 * 30), matchCount: 0 }), ctx);
    const newScore = computeScore(makeRule({ createdAt: new Date(), matchCount: 0 }), ctx);
    expect(newScore).toBeGreaterThan(oldScore);
  });
  it("returns top-K rules sorted by score", () => {
    const result = matchRules([
      makeRule({ id: "1", language: "typescript", matchCount: 10 }),
      makeRule({ id: "2", language: "typescript", matchCount: 5 }),
      makeRule({ id: "3", language: "typescript", matchCount: 1 }),
      makeRule({ id: "4", language: "python" }),
    ], { language: "typescript", filePath: "app.ts", fileExtension: ".ts" }, { topK: 2 });
    expect(result.rules).toHaveLength(2);
    expect(result.rules[0].score).toBeGreaterThanOrEqual(result.rules[1].score);
  });
  it("includes match reasons", () => {
    const result = matchRules([makeRule({ language: "typescript", tags: ["api"] })], { language: "typescript", filePath: "api/route.ts", fileExtension: ".ts", ruleTags: ["api"] }, { topK: 5 });
    expect(result.rules[0].matchReasons.length).toBeGreaterThan(0);
  });
});

