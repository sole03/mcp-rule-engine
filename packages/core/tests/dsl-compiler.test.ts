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
 * @file DSL Compiler Tests
 *
 * Tests for:
 * - compileConstraints / compileSingleConstraint
 * - emitConstraintDSL (round-trip)
 * - wrapAstConstraints
 * - Edge cases: empty input, invalid blocks, regex patterns
 */

import { describe, it, expect } from "vitest";
import {
  compileConstraints,
  compileSingleConstraint,
  emitConstraintDSL,
  wrapAstConstraints,
} from "../src/constraints/dsl-compiler.js";
import type { AstConstraint } from "../src/constraints/dsl-compiler.js";

// ── Sample DSL ──

const SAMPLE_DSL = `
@constraint ban-eval
  .language    = "typescript"
  .nodeType    = "call_expression"
  .field.function.match      = "eval"
  .severity    = REJECT
  .scope       = GLOBAL
  .evidence    = "CWE-95"
  .message     = "eval() is forbidden"
  .dependsOn   = ["base-security"]
  .conflicts   = ["allow-eval"]

@constraint max-params
  .language    = "typescript"
  .nodeType    = "function_declaration"
  .field.parameters.childCount = { min: 0, max: 4 }
  .severity    = WARN
  .scope       = PROJECT
  .message     = "Too many parameters"
  .appliesTo   = "src/**"
`;

describe("DSL Compiler", () => {
  describe("compileConstraints", () => {
    it("parses multiple constraints from DSL source", () => {
      const results = compileConstraints(SAMPLE_DSL);
      expect(results).toHaveLength(2);
    });

    it("parses constraint name from @constraint directive", () => {
      const results = compileConstraints(SAMPLE_DSL);
      expect(results[0].name).toBe("ban-eval");
      expect(results[1].name).toBe("max-params");
    });

    it("parses language", () => {
      const results = compileConstraints(SAMPLE_DSL);
      expect(results[0].language).toBe("typescript");
    });

    it("parses severity (REJECT/WARN)", () => {
      const results = compileConstraints(SAMPLE_DSL);
      expect(results[0].severity).toBe("REJECT");
      expect(results[1].severity).toBe("WARN");
    });

    it("parses scope (GLOBAL/PROJECT)", () => {
      const results = compileConstraints(SAMPLE_DSL);
      expect(results[0].scope).toBe("GLOBAL");
      expect(results[1].scope).toBe("PROJECT");
    });

    it("parses evidence string", () => {
      const results = compileConstraints(SAMPLE_DSL);
      expect(results[0].evidence).toBe("CWE-95");
    });

    it("parses message string", () => {
      const results = compileConstraints(SAMPLE_DSL);
      expect(results[0].message).toBe("eval() is forbidden");
    });

    it("parses dependsOn array", () => {
      const results = compileConstraints(SAMPLE_DSL);
      expect(results[0].dependsOn).toEqual(["base-security"]);
    });

    it("parses conflicts array", () => {
      const results = compileConstraints(SAMPLE_DSL);
      expect(results[0].conflicts).toEqual(["allow-eval"]);
    });

    it("parses appliesTo path pattern", () => {
      const results = compileConstraints(SAMPLE_DSL);
      expect(results[1].appliesTo).toBe("src/**");
    });

    it("parses nodeType", () => {
      const results = compileConstraints(SAMPLE_DSL);
      expect(results[0].constraints[0].nodeType).toBe("call_expression");
    });

    it("parses field.match constraint", () => {
      const results = compileConstraints(SAMPLE_DSL);
      expect(results[0].constraints[0].fields.function.match).toBe("eval");
    });

    it("parses field.childCount constraint", () => {
      const results = compileConstraints(SAMPLE_DSL);
      const cc = results[1].constraints[0].fields.parameters.childCount;
      expect(cc).toEqual({ min: 0, max: 4 });
    });

    it("parses field.exists constraint", () => {
      const dsl = `
@constraint has-return
  .nodeType    = "function_declaration"
  .field.returnType.exists     = true
  .severity    = WARN
  .scope       = PROJECT
  .message     = "Missing return type"
`;
      const results = compileConstraints(dsl);
      expect(results[0].constraints[0].fields.returnType.exists).toBe(true);
    });

    it("parses field.childType constraint", () => {
      const dsl = `
@constraint child-check
  .nodeType    = "block"
  .field.statements.childType  = "expression_statement"
  .severity    = WARN
  .scope       = PROJECT
  .message     = "Check"
`;
      const results = compileConstraints(dsl);
      expect(results[0].constraints[0].fields.statements.childType).toBe("expression_statement");
    });

    it("returns empty array for empty input", () => {
      expect(compileConstraints("")).toEqual([]);
    });

    it("returns empty array for input without @constraint", () => {
      expect(compileConstraints("just some text\nno constraints here")).toEqual([]);
    });

    it("handles quoted strings with spaces", () => {
      const dsl = `
@constraint test
  .nodeType    = "call_expression"
  .field.name.match      = "some value with spaces"
  .severity    = REJECT
  .scope       = GLOBAL
  .message     = "A message with spaces"
`;
      const results = compileConstraints(dsl);
      expect(results[0].constraints[0].fields.name.match).toBe("some value with spaces");
      expect(results[0].message).toBe("A message with spaces");
    });

    it("parses regex match pattern", () => {
      const dsl = `
@constraint regex-test
  .nodeType    = "identifier"
  .field.name.match      = "/^(api|secret|token)/i"
  .severity    = REJECT
  .scope       = GLOBAL
  .message     = "regex test"
`;
      const results = compileConstraints(dsl);
      expect(results[0].constraints[0].fields.name.match).toBe("/^(api|secret|token)/i");
    });
  });

  describe("compileSingleConstraint", () => {
    it("returns first constraint from single block", () => {
      const dsl = `
@constraint single
  .nodeType    = "identifier"
  .field.name.match      = "test"
  .severity    = REJECT
  .scope       = GLOBAL
  .message     = "single test"
`;
      const result = compileSingleConstraint(dsl);
      expect(result?.name).toBe("single");
    });

    it("returns null for empty input", () => {
      expect(compileSingleConstraint("")).toBeNull();
    });
  });

  describe("emitConstraintDSL", () => {
    it("round-trips a ParsedConstraint back to DSL", () => {
      const results = compileConstraints(SAMPLE_DSL);
      const dsl = emitConstraintDSL(results[0]);

      // Re-parse and check key fields preserved
      const reparsed = compileConstraints(dsl);
      expect(reparsed[0].name).toBe("ban-eval");
      expect(reparsed[0].severity).toBe("REJECT");
      expect(reparsed[0].scope).toBe("GLOBAL");
      expect(reparsed[0].evidence).toBe("CWE-95");
      expect(reparsed[0].dependsOn).toEqual(["base-security"]);
    });

    it("emits field constraints correctly", () => {
      const results = compileConstraints(SAMPLE_DSL);
      const dsl = emitConstraintDSL(results[1]);
      expect(dsl).toContain("childCount = { min: 0, max: 4 }");
    });
  });

  describe("wrapAstConstraints", () => {
    it("wraps raw AstConstraint[] into ParsedConstraint", () => {
      const astConstraints: AstConstraint[] = [{
        nodeType: "call_expression",
        fields: { function: { match: "eval" } },
      }];
      const wrapped = wrapAstConstraints("ban-eval", astConstraints, {
        severity: "REJECT",
        scope: "GLOBAL",
        message: "eval is forbidden",
      });
      expect(wrapped.name).toBe("ban-eval");
      expect(wrapped.constraints).toHaveLength(1);
      expect(wrapped.constraints[0].nodeType).toBe("call_expression");
      expect(wrapped.severity).toBe("REJECT");
    });
  });
});

// ── Template round-trip tests ──

import { SECURITY_TEMPLATES } from "../src/constraints/templates/security.js";

describe("Template round-trip", () => {
  it("all SECURITY_TEMPLATES compile without errors", () => {
    for (const tpl of SECURITY_TEMPLATES) {
      const results = compileConstraints(tpl);
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.name).toBeTruthy();
        expect(r.constraints.length).toBeGreaterThan(0);
      }
    }
  });
});
