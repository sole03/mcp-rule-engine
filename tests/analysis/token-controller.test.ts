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
import { estimateTokens, truncateRules } from "../../src/analysis/token-controller.js";
import { Rule } from "../../src/core/types.js";

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return { id: "1", type: "replace", pattern: "foo", suggestion: "bar", language: "typescript", priority: 1.0, scope: "project", confidence: "high", source: "auto", status: "active", matchCount: 0, createdAt: new Date(), updatedAt: new Date(), ...overrides };
}

describe("Token Controller", () => {
  it("estimates tokens for ASCII text", () => {
    expect(estimateTokens("hello world foo bar")).toBeGreaterThan(0);
    expect(estimateTokens("hello world foo bar")).toBeLessThan(50);
  });
  it("keeps all rules when under limit", () => {
    const result = truncateRules([makeRule()], 2000);
    expect(result.rules).toHaveLength(1);
    expect(result.truncated).toBe(false);
  });
  it("truncates when over limit", () => {
    const rules: Rule[] = [];
    for (let i = 0; i < 100; i++) {
      rules.push(makeRule({ id: String(i), pattern: "x".repeat(80), suggestion: "y".repeat(80) }));
    }
    const result = truncateRules(rules, 500);
    expect(result.truncated).toBe(true);
    expect(result.totalTokens).toBeLessThanOrEqual(550);
  });
  it("returns empty for empty input", () => {
    const result = truncateRules([], 2000);
    expect(result.rules).toHaveLength(0);
    expect(result.totalTokens).toBe(0);
  });
});

