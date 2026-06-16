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
 * @file Constraint Validator — Trust & Governance Layer
 * Reuses Phase 3 AstTemplate DSL parser for dual-mode validation.
 */
import { parseConstraintDsl, validateConstraints } from "./ast-constraint-solver.js";
import { CognitionRepository } from "../data/cognition-repository.js";

export type ValidationMode = "REJECT" | "WARN";
export type RuleLevel = "GLOBAL" | "PROJECT";

export interface ConstraintViolation {
  ruleId: string;
  ruleLevel: RuleLevel;
  mode: ValidationMode;
  constraintPath: string;
  expected: string;
  actual: string;
  message: string;
}

export interface ValidationReport {
  passed: boolean;
  violations: ConstraintViolation[];
  hardBlocks: number;
  softWarnings: number;
}

/** Validate code content against constraints. */
export async function validateCode(codeContent: string, language: string, projectId?: string): Promise<ValidationReport> {
  const repo = new CognitionRepository();
  const violations: ConstraintViolation[] = [];
  const hash = simpleHash("NEGATIVE_CONSTRAINT:" + language);
  const negativeNodes = await repo.findNodesBySemanticHash(hash);
  let hardBlocks = 0;
  let softWarnings = 0;
  for (const node of negativeNodes) {
    if (!node.astTemplate) continue;
    const constraints = parseConstraintDsl(node.astTemplate.templateDsl);
    if (constraints.length === 0) continue;
    const { ast } = await import("../analysis/parsers.js").then(m => m.parseToAST(codeContent, language));
    const result = validateConstraints(constraints, node.id, node.astTemplate.templateDsl, ast);
    if (!result.isValid) {
      for (const f of result.failures) {
        violations.push({ ruleId: node.id, ruleLevel: "GLOBAL", mode: "REJECT", constraintPath: f.constraintPath, expected: f.expected, actual: f.actual, message: "Hard block: " + f.constraintPath });
        hardBlocks++;
      }
    }
  }
  return { passed: hardBlocks === 0, violations, hardBlocks, softWarnings };
}

function simpleHash(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) { hash = ((hash << 5) - hash) + s.charCodeAt(i); hash |= 0; }
  return Math.abs(hash).toString(16);
}
