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
 * @file AST Constraint Solver unit tests.
 */

import { describe, it, expect } from "vitest";
import {
  parseConstraintDsl,
  bindConstraints,
  validateConstraints,
  generatePatchFromFailures,
} from "../../src/core/ast-constraint-solver.js";
import type { ASTNode } from "../../src/core/types.js";

function makeNode(type: string, text: string, children: ASTNode[] = []): ASTNode {
  return { type, text, startByte: 0, endByte: text.length, children };
}

const SAMPLE_AST: ASTNode = makeNode("program", "code", [
  makeNode("function_declaration", "function foo() { return 1; }", [
    makeNode("identifier", "foo"),
    makeNode("formal_parameters", "()", []),
    makeNode("body", "{ return 1; }", [
      makeNode("return_statement", "return 1;", []),
    ]),
  ]),
]);

const VALID_JSON_DSL = JSON.stringify([{
  nodeType: "function_declaration",
  fields: {
    name: { match: "{{name}}" },
    body: { exists: true },
  },
}]);

describe("AST Constraint Solver", () => {
  describe("parseConstraintDsl", () => {
    it("parses valid JSON DSL", () => {
      const result = parseConstraintDsl(VALID_JSON_DSL);
      expect(result.length).toBe(1);
      expect(result[0].nodeType).toBe("function_declaration");
      expect(result[0].fields.body.exists).toBe(true);
    });

    it("parses line-based DSL", () => {
      const dsl = ["NODE:function_declaration", "FIELD:name MATCH:name", "FIELD:body EXISTS:true"].join("\n");
      const result = parseConstraintDsl(dsl);
      expect(result.length).toBe(1);
      expect(result[0].nodeType).toBe("function_declaration");
    });

    it("returns empty for empty input", () => {
      expect(parseConstraintDsl("")).toEqual([]);
      expect(parseConstraintDsl("invalid")).toEqual([]);
    });
  });

  describe("bindConstraints", () => {
    it("binds placeholder values from AST", () => {
      const constraints = [{
        nodeType: "function_declaration",
        fields: { name: { match: "{{name}}" } },
      }];
      const result = bindConstraints(constraints, SAMPLE_AST);
      expect(result.bound.length).toBe(1);
      expect(result.bound[0].fields.name.match).toBeDefined();
    });
  });

  describe("validateConstraints", () => {
    it("returns valid for matching AST", () => {
      const constraints = [{
        nodeType: "function_declaration",
        fields: { body: { exists: true } },
      }];
      const result = validateConstraints(constraints, "node-1", "{}", SAMPLE_AST);
      expect(result.isValid).toBe(true);
      expect(result.failures.length).toBe(0);
    });

    it("returns failures for non-matching AST", () => {
      const constraints = [{
        nodeType: "class_declaration",
        fields: {},
      }];
      const result = validateConstraints(constraints, "node-2", "{}", SAMPLE_AST);
      expect(result.isValid).toBe(false);
      expect(result.failures.length).toBe(1);
      expect(result.failures[0].expected).toBe("class_declaration");
    });

    it("detects missing child type", () => {
      const constraints = [{
        nodeType: "function_declaration",
        fields: { return_type: { childType: "type_annotation" } },
      }];
      const result = validateConstraints(constraints, "node-3", "{}", SAMPLE_AST);
      expect(result.isValid).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
    });

    it("detects child count violation", () => {
      const constraints = [{
        nodeType: "function_declaration",
        fields: { children: { childCount: { max: 2 } } },
      }];
      const result = validateConstraints(constraints, "node-4", "{}", SAMPLE_AST);
      // function_declaration has 3 children, exceeding max:2
      expect(result.isValid).toBe(false);
    });
  });

  describe("generatePatchFromFailures", () => {
    it("generates patches for failures", () => {
      const failures = [{
        nodeId: "node-1",
        templateDsl: "{}",
        constraintPath: "$.type",
        expected: "class_declaration",
        actual: "(no matching node)",
      }];
      const patches = generatePatchFromFailures(failures, SAMPLE_AST);
      expect(patches.length).toBeGreaterThan(0);
      expect(patches[0].nodeId).toBe("node-1");
      expect(patches[0].operations.length).toBeGreaterThan(0);
    });
  });
});
