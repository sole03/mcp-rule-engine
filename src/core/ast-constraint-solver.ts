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
 * @file AST Constraint Solver
 * Transforms cognition AstTemplate DSL into executable AST constraints.
 * Outputs structured validation results and transform patches.
 * NEVER generates natural language — all output is machine-readable.
 *
 * Reuses: legacy-engine/ast-node.ts (computeSignature), legacy-engine/parsers.ts (parseToAST)
 */

import { computeSignature } from "../analysis/ast-node.js";
import { parseToAST } from "../analysis/parsers.js";
import type { ASTNode, NodeSignature } from "./types.js";
import type { CognitionNodeData } from "../data/cognition-types.js";
import type { AstConstraint, FieldConstraint, ValidationResult, ValidationFailure, TransformPatch, TransformOp } from "./cognition-types.js";

// ── DSL Parser ────────────────────────────────────────────

/**
 * Parse templateDsl JSON string into AstConstraint array.
 */
export function parseConstraintDsl(dsl: string): AstConstraint[] {
  try {
    const parsed = JSON.parse(dsl);
    if (Array.isArray(parsed)) return parsed as AstConstraint[];
    if (parsed && typeof parsed === "object" && parsed.nodeType) {
      return [parsed as AstConstraint];
    }
    return [];
  } catch {
    // If plain text, try line-based DSL format:
    //   NODE:FunctionDeclaration
    //   FIELD:name MATCH:{{placeholder}}
    //   FIELD:returnType EXISTS:true
    return parseLineBasedDsl(dsl);
  }
}

function parseLineBasedDsl(dsl: string): AstConstraint[] {
  const constraints: AstConstraint[] = [];
  let current: AstConstraint | null = null;

  for (const line of dsl.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("NODE:")) {
      if (current) constraints.push(current);
      current = { nodeType: trimmed.slice(5).trim(), fields: {} };
    } else if (trimmed.startsWith("FIELD:") && current) {
      const rest = trimmed.slice(6);
      const matchMatcher = rest.match(/^(\S+)\s+MATCH:(.+)$/);
      const existsMatcher = rest.match(/^(\S+)\s+EXISTS:(true|false)$/);
      const childTypeMatcher = rest.match(/^(\S+)\s+CHILD_TYPE:(.+)$/);

      if (matchMatcher) {
        current.fields[matchMatcher[1]] = { match: matchMatcher[2] };
      } else if (existsMatcher) {
        current.fields[existsMatcher[1]] = { exists: existsMatcher[2] === "true" };
      } else if (childTypeMatcher) {
        current.fields[childTypeMatcher[1]] = { childType: childTypeMatcher[2] };
      }
    }
  }
  if (current) constraints.push(current);
  return constraints;
}

// ── Constraint Binding ────────────────────────────────────

export interface BindingResult {
  bound: AstConstraint[];
  /** Map of placeholder → bound value */
  bindings: Record<string, string>;
}

/**
 * Bind {{placeholder}} values in a constraint to actual AST node text.
 * Walks the AST to find nodes matching each constraint's nodeType,
 * then extracts text values for placeholders.
 */
export function bindConstraints(
  constraints: AstConstraint[],
  ast: ASTNode,
): BindingResult {
  const bindings: Record<string, string> = {};

  const bound: AstConstraint[] = constraints.map((c) => ({
    ...c,
    fields: Object.fromEntries(
      Object.entries(c.fields).map(([key, fc]) => {
        const boundFc = { ...fc };
        if (fc.match && fc.match.includes("{{")) {
          const placeholder = fc.match.match(/\{\{(.+?)\}\}/)?.[1];
          if (placeholder) {
            const actualValue = extractFieldValue(ast, c.nodeType, key);
            if (actualValue) {
              bindings[placeholder] = actualValue;
              boundFc.match = fc.match.replace(/\{\{(.+?)\}\}/, actualValue);
            }
          }
        }
        return [key, boundFc];
      }),
    ),
  }));

  return { bound, bindings };
}

/**
 * Extract a field value from an AST node.
 * Simplified: checks node type match, then children for field values.
 */
function extractFieldValue(ast: ASTNode, nodeType: string, field: string): string | null {
  const matchingNodes = findNodesByType(ast, nodeType);
  if (matchingNodes.length === 0) return null;

  const node = matchingNodes[0];
  // Check if any child's type matches the field name
  for (const child of node.children) {
    if (child.type === field) {
      return child.text;
    }
  }
  // Fallback: return node text itself
  return field === "name" ? node.text : null;
}

function findNodesByType(node: ASTNode, type: string): ASTNode[] {
  const results: ASTNode[] = [];
  if (node.type === type) results.push(node);
  for (const child of node.children) {
    results.push(...findNodesByType(child, type));
  }
  return results;
}

// ── Constraint Validation ─────────────────────────────────

/**
 * Validate an AST against a set of bound constraints.
 *
 * @param constraints  Parsed + bound AstConstraint array
 * @param nodeId       Source cognition node ID (for traceability)
 * @param templateDsl  Original template DSL string
 * @param ast          Target AST to validate
 * @returns Structured validation result
 */
export function validateConstraints(
  constraints: AstConstraint[],
  nodeId: string,
  templateDsl: string,
  ast: ASTNode,
): ValidationResult {
  const failures: ValidationFailure[] = [];

  for (const constraint of constraints) {
    const matchingNodes = findNodesByType(ast, constraint.nodeType);

    if (matchingNodes.length === 0) {
      failures.push({
        nodeId,
        templateDsl,
        constraintPath: '$.type',
        expected: constraint.nodeType,
        actual: `(no matching node)`,
      });
      continue;
    }

    for (const matchingNode of matchingNodes) {
      for (const [fieldName, fieldConstraint] of Object.entries(constraint.fields)) {
        const result = checkFieldConstraint(fieldName, fieldConstraint, matchingNode);
        if (result) {
          failures.push({ nodeId, templateDsl, ...result });
        }
      }
    }
  }

  return {
    isValid: failures.length === 0,
    failures,
  };
}

function checkFieldConstraint(
  fieldName: string,
  fc: FieldConstraint,
  node: ASTNode,
): Omit<ValidationFailure, "nodeId" | "templateDsl"> | null {
  // Check existence
  if (fc.exists !== undefined) {
    const exists = node.children.some((c) => c.type === fieldName);
    if (fc.exists && !exists) {
      return {
        constraintPath: '$.children.',
        expected: 'exists: true',
        actual: `(child "${fieldName}" not found)`,
      };
    }
  }

  // Check match (literal or bound placeholder)
  if (fc.match) {
    const actual = node.text;
    if (actual !== fc.match) {
      return {
        constraintPath: '$.text',
        expected: fc.match,
        actual,
      };
    }
  }

  // Check child type
  if (fc.childType) {
    const hasChild = node.children.some((c) => c.type === fc.childType);
    if (!hasChild) {
      return {
        constraintPath: '$.children.' + fieldName,
        expected: fc.childType,
        actual: `(child "${fc.childType}" not found)`,
      };
    }
  }

  // Check child count
  if (fc.childCount) {
    const count = node.children.length;
    if (fc.childCount.min !== undefined && count < fc.childCount.min) {
      return {
          constraintPath: '$.children.length',
          expected: '>= ' + fc.childCount.min,
        actual: String(count),
      };
    }
    if (fc.childCount.max !== undefined && count > fc.childCount.max) {
      return {
        constraintPath: '$.children.length',
        expected: '<= ' + fc.childCount.max,
        actual: String(count),
      };
    }
  }

  return null;
}

// ── Transform Patch Generation ────────────────────────────

/**
 * Generate a transform patch from validation failures.
 * Creates operations that would fix the validation failures.
 */
export function generatePatchFromFailures(
  failures: ValidationFailure[],
  ast: ASTNode,
): TransformPatch[] {
  const patches: Map<string, TransformPatch> = new Map();

  for (const failure of failures) {
    const nodeId = failure.nodeId;
    if (!patches.has(nodeId)) {
      patches.set(nodeId, { nodeId, operations: [], description: "" });
    }

    const patch = patches.get(nodeId)!;
    const ops: TransformOp[] = [];

    if (failure.actual.includes("(no matching node)")) {
      ops.push({
        type: "INSERT",
        path: "$",
        value: failure.expected,
        originalText: undefined,
      });
    } else if (failure.constraintPath === "$.text") {
      ops.push({
        type: "REPLACE",
        path: "$.text",
        value: failure.expected,
        originalText: failure.actual,
      });
    }

    patch.operations.push(...ops);
    const briefDesc = `${failure.constraintPath}: "${failure.actual}" → "${failure.expected}"`;
    patch.description = patch.description
      ? `${patch.description}; `
      : briefDesc;
  }

  return [...patches.values()];
}

// ── High-level API ────────────────────────────────────────

/**
 * Run the full constraint-solving pipeline:
 *   1. Parse templateDSL from cognition nodes
 *   2. Parse file content to AST
 *   3. Bind {{placeholder}} values
 *   4. Validate constraints
 *   5. Generate transform patches
 *
 * @param cognitionNodes  Nodes with astTemplate to check
 * @param fileContent     Source code to validate against
 * @param language        Language for AST parsing
 * @returns Validation + patch results
 */
export async function solveConstraints(
  cognitionNodes: CognitionNodeData[],
  fileContent: string,
  language: string,
): Promise<{
  validations: ValidationResult[];
  patches: TransformPatch[];
  boundValues: Record<string, string>;
}> {
  const allValidations: ValidationResult[] = [];
  const allPatches: TransformPatch[] = [];
  const allBindings: Record<string, string> = {};

  const { ast } = await parseToAST(fileContent, language);

  for (const node of cognitionNodes) {
    if (!node.astTemplate) continue;

    const constraints = parseConstraintDsl(node.astTemplate.templateDsl);
    if (constraints.length === 0) continue;

    const { bound, bindings } = bindConstraints(constraints, ast);
    Object.assign(allBindings, bindings);

    const validation = validateConstraints(bound, node.id, node.astTemplate.templateDsl, ast);
    allValidations.push(validation);

    if (!validation.isValid) {
      const patches = generatePatchFromFailures(validation.failures, ast);
      allPatches.push(...patches);
    }
  }

  return {
    validations: allValidations,
    patches: allPatches,
    boundValues: allBindings,
  };
}


