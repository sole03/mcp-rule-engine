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
 * @file Audit Types — 治理审计与满意度追踪核心类型定义
 *
 * 为 ROI 审计器 (RoiAuditor) 和满意度追踪器 (SatisfactionTracker)
 * 提供统一的类型契约。所有类型均为纯数据接口，零外部依赖。
 */

// ── Module ROI ──

/**
 * 单个模块的 ROI 评估结果。
 * roiScore 由 invocationCount、testCount、近期活跃度加权计算得出。
 */
export interface ModuleRoi {
  /** 模块路径，如 "sandbox/cow-sandbox" */
  modulePath: string;
  /** 源文件行数 */
  lineCount: number;
  /** 最后修改时间 (ISO 8601) */
  lastModified: string;
  /** 关联测试文件数量 */
  testCount: number;
  /** 被调用次数 (从 MetricEvent 估算) */
  invocationCount: number;
  /** ROI 评分 (0-1，越高越好) */
  roiScore: number;
  /** 价值判定 */
  verdict: "HIGH_VALUE" | "MEDIUM_VALUE" | "LOW_VALUE";
}

// ── ROI Report ──

/**
 * 全量 ROI 审计报告。
 * 汇总所有模块的 ROI 评分并给出治理建议。
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

// ── Satisfaction ──

/**
 * 单次开发者满意度记录。
 * 通过 MCP 工具 developer_satisfaction、CLI 或 Dashboard 提交。
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

/**
 * 满意度聚合指标。
 * 基于最近 2 周的 SatisfactionEntry 计算得出。
 */
export interface SatisfactionMetrics {
  /** 最近 2 周的满意度记录 */
  recentScores: SatisfactionEntry[];
  /** 平均满意度评分 */
  averageScore: number;
  /** 趋势方向 */
  trend: "IMPROVING" | "STABLE" | "DECLINING";
  /** 是否需要关注 (avg < 3 持续 2 周以上) */
  needsAttention: boolean;
}
