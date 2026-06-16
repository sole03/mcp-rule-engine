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

import { describe, it, expect, beforeEach } from "vitest";
import { RegoCompiler, type RegoPolicy, type CompileOptions } from "../../packages/core/src/proposal/rego-compiler.js";
import type { ParsedConstraint, AstConstraint } from "../../packages/core/src/constraints/dsl-compiler.js";

function makeTemplate(overrides?: Partial<ParsedConstraint>): ParsedConstraint {
  const ast: AstConstraint = {
    nodeType: "CallExpression",
    fields: {
      callee: { match: "eval" },
    },
  };
  return {
    name: "no-eval",
    constraints: [ast],
    severity: "REJECT",
    scope: "GLOBAL",
    message: "eval() is forbidden",
    dependsOn: [],
    conflicts: [],
    ...overrides,
  };
}

describe("RegoCompiler", () => {
  let compiler: RegoCompiler;

  beforeEach(() => {
    compiler = new RegoCompiler();
  });

  // --- 1. compile security template ---
  it("compiles a SECURITY category template", () => {
    const template = makeTemplate();
    const policy = compiler.compile(template, { category: "security" });

    expect(policy.package).toBe("mcp.cognition.security");
    expect(policy.rawRego).toContain("package mcp.cognition.security");
    expect(policy.rawRego).toContain(`"key": "security/no-eval"`);
    expect(policy.rawRego).toContain(`input.nodeType == "CallExpression"`);
    expect(policy.rawRego).toContain(`input.fields["callee"] == "eval"`);
    expect(policy.rawRego).toContain(`"severity": "critical"`);
  });

  // --- 2. compile architecture template ---
  it("compiles an ARCHITECTURE category template", () => {
    const template = makeTemplate({ name: "no-console" });
    const policy = compiler.compile(template, { category: "architecture" });

    expect(policy.package).toBe("mcp.cognition.architecture");
    expect(policy.rawRego).toContain("package mcp.cognition.architecture");
    expect(policy.rawRego).toContain(`"key": "architecture/no-console"`);
  });

  // --- 3. fromDSL (uses DSL syntax, not JSON) ---
  it("parses and compiles from a DSL string", () => {
    const dslSource = `@constraint no-debugger
  .nodeType    = "DebuggerStatement"
  .severity    = REJECT
  .scope       = GLOBAL
  .message     = "debugger statement is forbidden"`;

    const policy = compiler.fromDSL(dslSource, { category: "security" });

    expect(policy.rawRego).toContain(`"key": "security/no-debugger"`);
    expect(policy.rawRego).toContain(`input.nodeType == "DebuggerStatement"`);
    expect(policy.category).toBe("security");
  });

  // --- 4. validate valid Rego ---
  it("validates a valid Rego policy string", () => {
    const template = makeTemplate({ name: "test-rule" });
    const policy = compiler.compile(template);

    const result = compiler.validate(policy.rawRego);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  // --- 5. validate invalid Rego ---
  it("rejects an invalid Rego string", () => {
    const result = compiler.validate("not a valid rego policy at all");

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // --- 6. listPolicies ---
  it("lists all compiled policies via listPolicies()", () => {
    const t1 = makeTemplate({ name: "rule-a" });
    const t2 = makeTemplate({ name: "rule-b" });

    compiler.compile(t1);
    compiler.compile(t2);

    const policies = compiler.listPolicies();
    expect(policies).toHaveLength(2);
  });

  // --- 7. severity mapping ---
  it("maps severity REJECT → critical on the RegoPolicy", () => {
    const template = makeTemplate({ name: "critical-rule", severity: "REJECT" });
    const policy = compiler.compile(template);

    expect(policy.severity).toBe("critical");
    expect(policy.rawRego).toContain(`"severity": "critical"`);
  });
});
