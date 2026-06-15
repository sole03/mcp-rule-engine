import { describe, it, expect } from "vitest";
import { estimateTokens, truncateRules } from "../../src/engine/token-controller.js";
import { Rule } from "../../src/types.js";

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
