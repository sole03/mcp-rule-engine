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
 * @file Tests for Policy-as-Code engine
 */
import { describe, it, expect, beforeEach } from "vitest";
import { PolicyEngine, resetPolicyEngine } from "../../src/governance/policy-engine.js"
import { evaluateCondition } from "../../src/governance/condition-evaluator.js";
import type { JsonPolicy, PolicyCondition } from "../../src/governance/governance-types.js";

describe("PolicyEngine", () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    resetPolicyEngine();
    engine = new PolicyEngine();
  });

  it("loads and retrieves policies", () => {
    const policy: JsonPolicy = {
      id: "test-1", name: "Test Policy", description: "A test policy",
      scope: "project", severity: "WARN", status: "active", priority: 100,
      conditions: [{ type: "tool_name", toolNames: ["capture_diff"] }],
      actions: [{ type: "log_warning" }],
    };
    engine.loadPolicies([policy]);
    expect(engine.getActivePolicies()).toHaveLength(1);
  });

  it("filters paused policies from active", () => {
    engine.loadPolicies([
      { id: "a", name: "A", description: "", scope: "global", severity: "WARN", status: "active", priority: 1, conditions: [], actions: [] },
      { id: "b", name: "B", description: "", scope: "global", severity: "WARN", status: "paused", priority: 1, conditions: [], actions: [] },
    ]);
    expect(engine.getActivePolicies()).toHaveLength(1);
  });

  it("sorts active policies by priority descending", () => {
    engine.loadPolicies([
      { id: "low", name: "L", description: "", scope: "global", severity: "WARN", status: "active", priority: 10, conditions: [], actions: [] },
      { id: "high", name: "H", description: "", scope: "global", severity: "WARN", status: "active", priority: 200, conditions: [], actions: [] },
    ]);
    const active = engine.getActivePolicies();
    expect(active[0].id).toBe("high");
  });

  it("evaluates tool_name condition", () => {
    engine.loadPolicies([{
      id: "tool-policy", name: "Tool", description: "", scope: "global", severity: "WARN", status: "active", priority: 100,
      conditions: [{ type: "tool_name", toolNames: ["capture_diff"] }],
      actions: [{ type: "require_approval" }],
    }]);
    const result = engine.evaluate({ toolName: "capture_diff" });
    expect(result.requiresApproval).toBe(true);
  });

  it("skips policy when condition does not match", () => {
    engine.loadPolicies([{
      id: "tool-policy", name: "Tool", description: "", scope: "global", severity: "WARN", status: "active", priority: 100,
      conditions: [{ type: "tool_name", toolNames: ["capture_diff"] }],
      actions: [{ type: "require_approval" }],
    }]);
    const result = engine.evaluate({ toolName: "list_rules" });
    expect(result.matchedPolicies).toHaveLength(0);
  });

  it("blocks when policy has reject action", () => {
    engine.loadPolicies([{
      id: "block", name: "Block", description: "", scope: "global", severity: "BLOCK", status: "active", priority: 200,
      conditions: [], actions: [{ type: "reject" }],
    }]);
    expect(engine.evaluate({ toolName: "any" }).allowed).toBe(false);
  });

  it("upserts and removes policies", () => {
    const p: JsonPolicy = { id: "x", name: "X", description: "", scope: "global", severity: "WARN", status: "active", priority: 1, conditions: [], actions: [] };
    engine.upsertPolicy(p);
    expect(engine.getAllPolicies()).toHaveLength(1);
    engine.removePolicy("x");
    expect(engine.getAllPolicies()).toHaveLength(0);
  });

  it("needsApproval quick check", () => {
    engine.loadPolicies([{
      id: "appr", name: "A", description: "", scope: "global", severity: "WARN", status: "active", priority: 100,
      conditions: [{ type: "tool_name", toolNames: ["capture_diff"] }],
      actions: [{ type: "require_approval" }],
    }]);
    expect(engine.needsApproval({ toolName: "capture_diff" })).toBe(true);
    expect(engine.needsApproval({ toolName: "list_rules" })).toBe(false);
  });
});

describe("evaluateCondition", () => {
  it("matches file extension", () => {
    const c: PolicyCondition = { type: "file_ext", extensions: [".ts"] };
    expect(evaluateCondition(c, { toolName: "t", filePath: "src/a.ts" })).toBe(true);
    expect(evaluateCondition(c, { toolName: "t", filePath: "src/a.py" })).toBe(false);
  });

  it("matches file path pattern", () => {
    const c: PolicyCondition = { type: "file_path_match", pathPattern: "^src/" };
    expect(evaluateCondition(c, { toolName: "t", filePath: "src/a.ts" })).toBe(true);
    expect(evaluateCondition(c, { toolName: "t", filePath: "tests/a.ts" })).toBe(false);
  });

  it("matches composite AND", () => {
    const c: PolicyCondition = { type: "composite", operator: "AND", conditions: [
      { type: "tool_name", toolNames: ["capture_diff"] },
      { type: "file_ext", extensions: [".ts"] },
    ]};
    expect(evaluateCondition(c, { toolName: "capture_diff", filePath: "a.ts" })).toBe(true);
    expect(evaluateCondition(c, { toolName: "capture_diff", filePath: "a.py" })).toBe(false);
  });

  it("matches composite OR", () => {
    const c: PolicyCondition = { type: "composite", operator: "OR", conditions: [
      { type: "tool_name", toolNames: ["a"] },
      { type: "tool_name", toolNames: ["b"] },
    ]};
    expect(evaluateCondition(c, { toolName: "a" })).toBe(true);
    expect(evaluateCondition(c, { toolName: "c" })).toBe(false);
  });
});
