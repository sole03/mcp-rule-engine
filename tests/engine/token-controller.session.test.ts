import { describe, it, expect, beforeEach } from "vitest";
import { truncateRules, getSessionTokens, clearSession } from "../../src/engine/token-controller.js";
import { Rule } from "../../src/types.js";

function makeRule(id: string, patternLen = 20): Rule {
  return {
    id, type: "replace", pattern: "x".repeat(patternLen), suggestion: "y".repeat(patternLen),
    language: "typescript", priority: 1.0, scope: "project", confidence: "high",
    source: "auto", status: "active", matchCount: 0,
    createdAt: new Date(), updatedAt: new Date(),
  };
}

describe("Token Controller — Session Tracking", () => {
  beforeEach(() => {
    clearSession("test-task");
    clearSession("other-task");
  });

  it("should return 0 for unknown taskId", () => {
    expect(getSessionTokens("nonexistent")).toBe(0);
  });

  it("should track usage across multiple calls with same taskId", () => {
    const rules1 = [makeRule("1", 10)];
    const rules2 = [makeRule("2", 10)];
    const r1 = truncateRules(rules1, 2000, "test-task");
    const r2 = truncateRules(rules2, 2000, "test-task");
    expect(r1.truncated).toBe(false);
    expect(r2.truncated).toBe(false);
    expect(getSessionTokens("test-task")).toBeGreaterThan(0);
  });

  it("should enforce budget across calls within same session", () => {
    // Create many rules that together would exceed 2000 tokens
    const bigRules: Rule[] = [];
    for (let i = 0; i < 100; i++) {
      bigRules.push(makeRule(String(i), 200));
    }
    const r1 = truncateRules(bigRules, 2000, "test-task");
    expect(r1.truncated).toBe(true);
    expect(r1.totalTokens).toBeLessThanOrEqual(2000);

    // Second call should see remaining budget
    const r2 = truncateRules(bigRules, 2000, "test-task");
    expect(r2.truncated).toBe(true);
    // The sum should not exceed 2000
    expect(r1.totalTokens + r2.totalTokens).toBeLessThanOrEqual(2000);
  });

  it("should isolate budgets between different taskIds", () => {
    const rules = [makeRule("1", 100), makeRule("2", 100), makeRule("3", 100)];
    truncateRules(rules, 2000, "task-a");
    truncateRules(rules, 2000, "task-b");
    expect(getSessionTokens("task-a")).toBeGreaterThan(0);
    expect(getSessionTokens("task-b")).toBeGreaterThan(0);
  });

  it("should clear session data", () => {
    truncateRules([makeRule("1", 10)], 2000, "test-task");
    expect(getSessionTokens("test-task")).toBeGreaterThan(0);
    clearSession("test-task");
    expect(getSessionTokens("test-task")).toBe(0);
  });
});
