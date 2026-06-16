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
 * @file Repository Interfaces
 * Abstract contracts for all storage backends. Every repository must implement
 * its corresponding interface. This enables pluggable storage (SQLite, Postgres,
 * in-memory for tests) without changing business logic.
 */

import type {
  CognitionNodeData,
  CognitionEdgeData,
  AstTemplateData,
  SubgraphResult,
  CognitionNodeInput,
  CognitionEdgeInput,
  AstTemplateInput,
  EdgeRelationStr,
} from "./cognition-types.js";

import type { Rule, RuleScope, RuleStatus, RuleSpec, ConflictResolution } from "../core/types.js";

// ── Cognition Repository ──────────────────────────────────

export interface ICognitionRepository {
  createNodeWithEdges(
    nodeInput: CognitionNodeInput,
    edgeInputs?: CognitionEdgeInput[],
  ): Promise<CognitionNodeData>;

  findNodesBySemanticHash(hash: string): Promise<CognitionNodeData[]>;

  getSubgraph(rootNodeId: string, maxDepth?: number): Promise<SubgraphResult>;

  getSubgraphBatch(rootNodeIds: string[]): Promise<SubgraphResult>;

  updateEdgeWeight(edgeId: string, delta: number): Promise<CognitionEdgeData>;

  createAstTemplate(input: AstTemplateInput): Promise<AstTemplateData>;

  findNodeById(id: string): Promise<CognitionNodeData | null>;

  findEdgesByRelation(relation: EdgeRelationStr): Promise<CognitionEdgeData[]>;

  deleteNode(id: string): Promise<void>;

  recordFeedbackEvent(
    nodeId: string,
    edgeId?: string,
    outcome?: string,
    comment?: string,
  ): Promise<{ feedbackId: string }>;

  resolveFeedbackEvent(
    feedbackId: string,
    outcome: string,
    edgeId?: string,
    weightDelta?: number,
  ): Promise<void>;
}

// ── Rule Repository ───────────────────────────────────────

export interface IRuleRepository {
  create(spec: RuleSpec & { projectId?: string }): Promise<Rule>;

  batchCreate(specs: (RuleSpec & { projectId?: string })[]): Promise<Rule[]>;

  findById(id: string): Promise<Rule | null>;

  updateStatus(id: string, status: RuleStatus): Promise<Rule>;

  incrementMatchCount(id: string): Promise<void>;

  countByScope(scope: RuleScope): Promise<number>;

  isLimitReached(): Promise<boolean>;

  getLimitInfo(projectId?: string): Promise<{
    reached: boolean;
    globalCount: number;
    globalMax: number;
    projectCount: number;
    projectMax: number;
  }>;

  findConflicting(type: string, language: string, pattern: string): Promise<Rule[]>;

  updateContent(
    id: string,
    data: { pattern?: string; suggestion?: string; category?: string; editedBy?: string },
  ): Promise<Rule>;

  getRuleVersions(ruleId: string): Promise<{
    id: string;
    ruleId: string;
    pattern: string;
    suggestion: string | null;
    editedBy: string | null;
    createdAt: Date;
  }[]>;

  queryByMatch(
    language: string,
    fileExtension: string,
    projectId?: string,
    tags?: string[],
  ): Promise<Rule[]>;

  list(filters: {
    language?: string;
    scope?: RuleScope;
    status?: RuleStatus;
    projectId?: string;
    limit?: number;
    offset?: number;
  }): Promise<Rule[]>;
}

// ── Diff Log Repository ───────────────────────────────────

export interface DiffLogRecord {
  id: string;
  ruleId?: string;
  filePath: string;
  fileExtension: string;
  language: string;
  projectId?: string;
  originalHash: string;
  modifiedHash: string;
  diffContent: string;
  astStatus?: string;
  diffType: string;
  operations?: string;
  createdAt: Date;
}

export interface IDiffLogRepository {
  create(data: {
    filePath: string;
    fileExtension: string;
    language: string;
    projectId?: string;
    originalHash: string;
    modifiedHash: string;
    diffContent: string;
    astStatus?: string;
    diffType: string;
    operations?: string;
    ruleId?: string;
  }): Promise<DiffLogRecord>;

  countByPattern(language: string, patternHash: string, sinceDays: number): Promise<number>;

  countDistinctFiles(language: string, patternHash: string, sinceDays: number): Promise<number>;
}

// ── Conflict Repository ───────────────────────────────────

export interface ConflictRecord {
  id: string;
  ruleAId: string;
  ruleBId: string;
  scopeKey: string;
  resolution?: ConflictResolution;
  batchChoice?: string;
  resolvedAt?: Date;
  createdAt: Date;
}

export interface IConflictRepository {
  findById(id: string): Promise<ConflictRecord | null>;

  findExisting(ruleAId: string, ruleBId: string): Promise<ConflictRecord | null>;

  create(data: { ruleAId: string; ruleBId: string; scopeKey: string }): Promise<ConflictRecord>;

  resolve(id: string, resolution: ConflictResolution): Promise<void>;

  setBatchChoice(id: string, choice: string): Promise<void>;
}

// ── Metric Repository ─────────────────────────────────────

export interface IMetricRepository {
  track(eventType: string, properties?: Record<string, unknown>): Promise<void>;

  count(eventType: string, sinceMinutes?: number): Promise<number>;
}
