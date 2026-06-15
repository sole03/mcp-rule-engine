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
 * @file Cognition Engine — type definitions.
 * These types are specific to the cognition engine pipeline.
 * Shared types consumed by tools live in ../types.js.
 */

import type {
  CognitionNodeData,
  CognitionEdgeData,
  CognitionTypeStr,
  EdgeRelationStr,
} from "../storage/cognition-types.js";

// ── Intent Recognition ────────────────────────────────────

export type IntentType = "REFACTOR" | "BUGFIX" | "BOILERPLATE";

export interface IntentResult {
  intent: IntentType;
  confidence: number; // 0.0 – 1.0
  reasoning: string[];
  /** Diff statistics used for classification. */
  stats: {
    addedLines: number;
    removedLines: number;
    filesChanged: number;
    nodeTypeChanges: string[];
  };
}

// ── Graph Traversal ───────────────────────────────────────

export interface TraversalOptions {
  /** Max BFS depth. Default 5. */
  maxDepth?: number;
  /** Minimum relevance score [0, 1] to include in results. */
  minRelevance?: number;
  /** Optional intent hint to bias edge weights. */
  intentHint?: IntentType;
  /** If set, only include nodes at these abstraction levels. */
  abstractionLevelFilter?: number[];
  /** Hard timeout in ms. Default 500. */
  maxDurationMs?: number;
}

export interface ScoredCognitionNode {
  node: CognitionNodeData;
  relevanceScore: number;
  /** Path trace: how this node was reached (edge trail). */
  trace: string[];
}

export interface TraversalResult {
  nodes: ScoredCognitionNode[];
  edges: CognitionEdgeData[];
  durationMs: number;
  truncated: boolean;
}

// ── AST Constraint Solving ────────────────────────────────

/** DSL constraint: must be JSON-serializable for storage. */
export interface AstConstraint {
  nodeType: string;
  fields: Record<string, FieldConstraint>;
}

export interface FieldConstraint {
  match?: string;
  exists?: boolean;
  childType?: string;
  childCount?: { min?: number; max?: number };
}

export interface ValidationFailure {
  nodeId: string;
  templateDsl: string;
  constraintPath: string;
  expected: string;
  actual: string;
}

export interface ValidationResult {
  isValid: boolean;
  failures: ValidationFailure[];
}

export type TransformOpType = "REPLACE" | "INSERT" | "DELETE";

export interface TransformOp {
  type: TransformOpType;
  path: string;
  value?: string;
  originalText?: string;
}

export interface TransformPatch {
  nodeId: string;
  operations: TransformOp[];
  description: string;
}
