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
 * @file Cognition Engine — unified entry point.
 *
 * The cognition engine replaces the legacy rule-matcher with a
 * three-component pipeline:
 *
 *   1. IntentRecognizer — classifies diff type (REFACTOR / BUGFIX / BOILERPLATE)
 *   2. GraphTraverser  — weighted BFS over cognition graph
 *   3. AstConstraintSolver — transforms templates into AST-level checks
 *
 * Usage:
 *   import { analyzeCodeContext } from "./index.js";
 *   const result = await analyzeCodeContext(lang, path, content);
 */

export { recognizeIntent } from "./intent-recognizer.js";
export type { IntentResult, IntentType } from "./cognition-types.js";

export { GraphTraverser } from "./graph-traverser.js";
export type { TraversalOptions, TraversalResult, ScoredCognitionNode } from "./cognition-types.js";

export {
  solveConstraints,
  parseConstraintDsl,
  bindConstraints,
  validateConstraints,
  generatePatchFromFailures,
} from "./ast-constraint-solver.js";
export type { AstConstraint, FieldConstraint, ValidationResult, TransformPatch } from "./cognition-types.js";

import { recognizeIntent } from "./intent-recognizer.js";
import { GraphTraverser } from "./graph-traverser.js";
import { solveConstraints } from "./ast-constraint-solver.js";
import type { TraversalResult, ValidationResult, TransformPatch, IntentResult } from "./cognition-types.js";

/**
 * Full pipeline: analyze diff → traverse graph → solve AST constraints.
 * The one-shot entry point for the cognition engine.
 */
export async function analyzeCodeContext(
  diffContent: string,
  filePath: string,
  language: string,
  fileContent: string,
): Promise<{
  intent: IntentResult;
  traversal: TraversalResult;
  constraints: {
    validations: ValidationResult[];
    patches: TransformPatch[];
    boundValues: Record<string, string>;
  };
  durationMs: number;
}> {
  const startTime = performance.now();

  // Stage 1: Intent Recognition
  const intent = await recognizeIntent(diffContent, filePath);

  // Stage 2: Graph Traversal (biased by recognized intent)
  const traverser = new GraphTraverser();
  const traversal = await traverser.traverse(language, filePath, diffContent, {
    intentHint: intent.intent,
    maxDepth: intent.intent === "REFACTOR" ? 5 : 3,
  });

  // Stage 3: AST Constraint Solving
  const nodeDataList = traversal.nodes.map((sn) => sn.node);
  const constraints = await solveConstraints(nodeDataList, fileContent, language);

  return {
    intent,
    traversal,
    constraints,
    durationMs: performance.now() - startTime,
  };
}
