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
 * @file Dashboard Types — 仪表盘核心类型定义
 *
 * DashboardSnapshot 是 Phase 4 仪表盘的统一数据模型。
 * 所有 KPI 聚合到此结构中，供 HTTP API 和 Web UI 消费。
 * 本文件协议无关，零外部依赖。
 */

// ── Snapshot ──

export interface DashboardSnapshot {
  timestamp: string;
  version: string;
  cognition: CognitionMetrics;
  amygdala: AmygdalaMetrics;
  selfHeal: SelfHealMetrics;
  arbitration: ArbitrationMetrics;
  governance: GovernanceMetrics;
  alerts: Alert[];
}

// ── Cognition ──

export interface CognitionMetrics {
  nodeCount: number;
  edgeCount: number;
  embeddedNodeRatio: number;
  avgTraversalMs: number;
  traversalTruncationRate: number;
  topIntentDistribution: { intent: string; count: number }[];
}

// ── Amygdala ──

export interface AmygdalaMetrics {
  triggeredCount24h: number;
  avgRiskScore: number;
  fatigueLevel: "NORMAL" | "ELEVATED" | "CRITICAL";
  recentTriggers: { reason: string; riskScore: number; timestamp: string }[];
}

// ── Self-Heal ──

export interface SelfHealMetrics {
  totalAttempts: number;
  successRate: number;
  revertRate: number;
  avgDurationMs: number;
  avgConfidence: number;
  safetyValveTripped: boolean;
  topHealedFiles: { path: string; count: number }[];
}

// ── Arbitration ──

export interface ArbitrationMetrics {
  totalConflicts: number;
  conflictRate: number;
  autoResolveRate: number;
  humanRequiredRate: number;
  appealRate: number;
  appealAcceptRate: number;
  topConflictPatterns: { pattern: string; count: number }[];
}

// ── Governance ──

export interface GovernanceMetrics {
  activeRuleCount: number;
  pendingProposalCount: number;
  approvalRate: number;
  rejectionRate: number;
  immuneStats: {
    coldStartCount: number;
    expiringCount: number;
    coldStorageCount: number;
    conflictRate: number;
    conflictLocked: boolean;
  };
  topMatchedPolicies: { policyId: string; hits: number }[];
  ruleEfficacy: RuleEfficacy[];
  policyVariantCompare: PolicyVariantCompare | null;
}

// ── Shadow Mode (Phase 3.1) ──

export interface ShadowMetrics {
  activeCount: number;
  totalHits: number;
  wouldBlockCount: number;
  expiringToday: number;
}

// ── Migration Report (Phase 3.3) ──

export interface MigrationReport {
  before: { count: number; avgFields: number };
  after: { count: number; avgFields: number };
  deltas: { countChange: number; coverageChange: number };
}

// ── Alerts ──

export interface Alert {
  id: string;
  metric: string;
  severity: "INFO" | "WARN" | "CRITICAL";
  message: string;
  currentValue: number;
  threshold: number;
  operator: "gt" | "lt";
  timestamp: string;
}

export interface AlertRule {
  metric: string;
  threshold: number;
  operator: "gt" | "lt";
  severity: "INFO" | "WARN" | "CRITICAL";
  message: string;
}

// ── Event Stream ──

export interface AuditEvent {
  id: string;
  eventType: string;
  properties: Record<string, unknown> | null;
  createdAt: string;
}

// ── Rule Efficacy (Dimension 1.1) ──

export interface RuleEfficacy {
  ruleId: string;
  hitCount: number;
  falsePositiveCount: number;
  adoptedCount: number;
  fpRate: number;
  adoptRate: number;
}

// ── Policy Variant A/B (Dimension 1.2) ──

export interface PolicyVariantCompare {
  variantId: string;
  basePolicyId: string;
  baseResult: { hitCount: number };
  variantResult: { hitCount: number };
}

// ── Rule Preview (Dimension 1.3) ──

export interface PreviewResult {
  ruleId: string;
  filePath: string;
  before: string;
  after: string;
  diff: string;
}


// ── ROI Audit (Dimension 4.1) ──

/**
 * 全量 ROI 审计报告。
 * 由 RoiAuditor.generateReport() 生成，汇总所有模块的 ROI 评分。
 */
export interface RoiReport {
  /** 报告生成时间 (ISO 8601) */
  generatedAt: string;
  /** 所有模块的 ROI 评估 */
  modules: ModuleRoi[];
  /** 低价值模块数量 */
  lowValueCount: number;
  /** 总模块数 */
  totalModules: number;
  /** 治理建议文字 */
  recommendation: string;
}

/**
 * 单个模块的 ROI 评估结果 (re-export for dashboard consumers)。
 * 主定义位于 audit/types.ts。
 */
export interface ModuleRoi {
  /** 模块路径 */
  modulePath: string;
  /** 源文件行数 */
  lineCount: number;
  /** 最后修改时间 (ISO 8601) */
  lastModified: string;
  /** 关联测试文件数量 */
  testCount: number;
  /** 被调用次数 */
  invocationCount: number;
  /** ROI 评分 (0-1) */
  roiScore: number;
  /** 价值判定 */
  verdict: "HIGH_VALUE" | "MEDIUM_VALUE" | "LOW_VALUE";
}

// ── Satisfaction Tracking (Dimension 4.2) ──

/**
 * 满意度聚合指标 (re-export for dashboard consumers)。
 * 主定义位于 audit/types.ts。
 */
export interface SatisfactionMetrics {
  /** 最近 2 周的满意度记录 */
  recentScores: SatisfactionEntry[];
  /** 平均满意度评分 */
  averageScore: number;
  /** 趋势方向 */
  trend: "IMPROVING" | "STABLE" | "DECLINING";
  /** 是否需要关注 */
  needsAttention: boolean;
}

/**
 * 单次开发者满意度记录 (re-export for dashboard consumers)。
 */
export interface SatisfactionEntry {
  /** 满意度评分 (1-5) */
  score: 1 | 2 | 3 | 4 | 5;
  /** 可选反馈文字 */
  feedback?: string;
  /** 记录时间戳 (ISO 8601) */
  timestamp: string;
  /** 提交来源 */
  source: string;
}
