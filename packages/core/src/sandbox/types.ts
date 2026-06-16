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
 * @file Sandbox Types — 自愈沙箱子系统自包含类型
 *
 * 内联来自旧 src/core/types.ts / src/core/cognition-types.ts /
 * src/data/cognition-types.ts 的接口定义。
 * 零外部依赖 — packages/core 不再桥接旧 src/。
 */

// ── AST Node ──

export interface ASTNode {
  type: string;
  text: string;
  startByte: number;
  endByte: number;
  children: ASTNode[];
}

// ── Transform Patch ──

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

// ── Validation ──

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

// ── Cognition Node (slotted into sandbox) ──

export type CognitionTypeStr = "INTENT" | "CONSTRAINT" | "HEURISTIC" | "PATTERN";

export interface AstTemplateData {
  id: string;
  nodeId: string;
  language: string;
  templateDsl: string;
  validationSchema: Record<string, unknown> | null;
  createdAt: Date;
}

export interface CognitionNodeData {
  id: string;
  type: CognitionTypeStr;
  semanticHash: string;
  abstractionLevel: number;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  astTemplate: AstTemplateData | null;
}

// ── Parser function type (injected, not imported) ──

export interface ParserResult {
  ast: ASTNode;
  language: string;
  parseSuccess: boolean;
}

export type ParseToASTFn = (code: string, language: string) => Promise<ParserResult>;

// ── Constraint Solver function types (injected) ──

export interface ConstraintSolverResult {
  validations: ValidationResult[];
  patches: TransformPatch[];
  boundValues: Record<string, string>;
}

export type SolveConstraintsFn = (
  cognitionNodes: CognitionNodeData[],
  fileContent: string,
  language: string,
) => Promise<ConstraintSolverResult>;

export type GeneratePatchFn = (
  failures: ValidationFailure[],
  ast: ASTNode | null,
) => TransformPatch[];

export type GeneratePatchWithConfidenceFn = (
  failures: ValidationFailure[],
  ast: ASTNode | null,
) => { patches: TransformPatch[]; confidence: number };

// ── Repository function types (injected) ──

export interface ISandboxCognitionRepo {
  updateEdgeWeight(edgeId: string, delta: number): Promise<unknown>;
  resolveFeedbackEvent(feedbackId: string, outcome: string, edgeId?: string, weightDelta?: number): Promise<void>;
  track(eventType: string, props?: Record<string, unknown>): Promise<void>;
}

// ── Health Gate (维度 2.1) ──

/**
 * 健康度指标快照 — 每次门控检查时采集的多维指标。
 * 由 MetricsCollector 或 eventBus 提供。
 */
export interface HealthMetrics {
  /** process.memoryUsage().heapUsed / heapTotal */
  memoryUsagePercent: number;
  /** 从 MetricsCollector 或 eventBus 获取的 P99 遍历延迟 (ms) */
  traversalLatencyP99Ms: number;
  /** self-heal revert / total attempts 回滚率 */
  revertRate: number;
  /** 安全阀疲劳等级 */
  fatigueLevel: "NORMAL" | "ELEVATED" | "CRITICAL";
}

/** 健康度门控检查结果 */
export interface HealthGateResult {
  /** 是否允许本轮自愈 */
  allowed: boolean;
  /** 拒绝原因（仅 allowed=false 时有值） */
  reason?: string;
  /** 检查时使用的指标快照 */
  metrics: HealthMetrics;
}

// ── Atomic Patch (维度 2.2) ──

/**
 * 原子模式下的单 Patch 执行明细。
 * atomicMode=true 时每个 ValidationFailure 独立 snapshot → apply → validate → commit/revert。
 */
export interface AtomicPatchResult {
  /** 关联的约束节点 ID */
  nodeId: string;
  /** 该原子 patch 的最终状态 */
  status: "APPLIED" | "REVERTED" | "FAILED";
  /** 应用的 patch（用于审计追踪） */
  patch: TransformPatch;
}

// ── Escape Mode (维度 2.3) ──

/** 逃生模式结果 — 跳过沙箱全流程，直接返回 patches + confidence */
export interface EscapeModeResult {
  /** 生成的 patches */
  patches: TransformPatch[];
  /** 置信度 (0-1) */
  confidence: number;
}
