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
import { detectConflict, applyResolution } from "../../src/governance/arbitrator.js";
import { Rule } from "../../src/core/types.js";

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
