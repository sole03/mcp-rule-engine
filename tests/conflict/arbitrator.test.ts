import { describe, it, expect } from "vitest";
import { detectConflict, applyResolution } from "../../src/conflict/arbitrator.js";
import { Rule } from "../../src/types.js";

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return { id: "1", type: "replace", pattern: "foo", suggestion: "bar", language: "typescript", priority: 1.0, scope: "project", confidence: "high", source: "auto", status: "active", matchCount: 0, createdAt: new Date(), updatedAt: new Date(), ...overrides };
}

describe("Conflict Arbitrator", () => {
  it("detects conflict for same type/lang but different suggestions", () => {
    expect(detectConflict(makeRule({ id: "1", pattern: "oldFn", suggestion: "newFn" }), makeRule({ id: "2", pattern: "oldFn", suggestion: "renamedFn" })).hasConflict).toBe(true);
  });
  it("no conflict for different languages", () => {
    expect(detectConflict(makeRule({ id: "1", language: "go" }), makeRule({ id: "2", language: "python" })).hasConflict).toBe(false);
  });
  it("no conflict for different types", () => {
    expect(detectConflict(makeRule({ id: "1", type: "replace" }), makeRule({ id: "2", type: "restructure" })).hasConflict).toBe(false);
  });
  it("creates arbitration rule for keep_a", () => {
    const arb = applyResolution(makeRule({ id: "1", scope: "project" }), makeRule({ id: "2", scope: "user" }), "keep_a");
    expect(arb).toBeDefined();
    expect(arb!.source).toBe("arbitration");
  });
  it("creates merge convention rule", () => {
    const arb = applyResolution(makeRule({ pattern: "oldFn()", suggestion: "newFn()" }), makeRule({ pattern: "oldFn()", suggestion: "safeFn()" }), "merge");
    expect(arb).toBeDefined();
    expect(arb!.type).toBe("convention");
    expect(arb!.confidence).toBe("medium");
  });
});
