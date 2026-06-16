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
 * @file Merlion Bridge — 轻量级异常检测桥接
 *
 * 使用纯 Node.js 实现统计异常检测：
 * - Z-score 基线 (滚动窗口均值/标准差)
 * - EMA 动态基线自适应
 * - 季节性分解 (7天桶)
 *
 * 零外部依赖，纯原生实现。
 */

import type { DashboardSnapshot } from "../dashboard/types.js";

// ── Types ──

export interface AnomalyScore {
  timestamp: string;
  metric: string;
  value: number;
  zScore: number;
  severity: "NORMAL" | "WARN" | "CRITICAL";
  baselineMean: number;
  baselineStddev: number;
}

export interface SeasonalityResult {
  dailyPattern: number[];  // 24 hour buckets (avg value per hour)
  weeklyPattern: number[]; // 7 day buckets (avg value per day-of-week)
  trend: "UP" | "DOWN" | "STABLE";
  conceptDrift: boolean;
}

// ── Stats Helpers ──

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[], m: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function linearRegression(xs: number[], ys: number[]): { slope: number; intercept: number } {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: mean(ys) };
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((sum, x, i) => sum + x * ys[i], 0);
  const sumXX = xs.reduce((sum, x) => sum + x * x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

// ── EMA ──

function computeEma(values: number[], alpha: number): number {
  if (values.length === 0) return 0;
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = alpha * values[i] + (1 - alpha) * ema;
  }
  return ema;
}

// ── MerlionBridge ──

export class MerlionBridge {
  private windowSize: number;
  private metricHistory: Map<string, number[]>;
  private metricTimestamps: Map<string, string[]>;
  private emaAlpha: number;

  constructor(windowSize: number = 168, emaAlpha: number = 0.1) {
    this.windowSize = windowSize;
    this.emaAlpha = emaAlpha;
    this.metricHistory = new Map();
    this.metricTimestamps = new Map();
  }

  /** Push a metric data point, get anomaly score */
  feed(metric: string, value: number, timestamp: string): AnomalyScore {
    // Maintain rolling window
    if (!this.metricHistory.has(metric)) {
      this.metricHistory.set(metric, []);
      this.metricTimestamps.set(metric, []);
    }

    const history = this.metricHistory.get(metric)!;
    history.push(value);
    if (history.length > this.windowSize) {
      history.shift();
    }

    const tStamps = this.metricTimestamps.get(metric)!;
    tStamps.push(timestamp);
    if (tStamps.length > this.windowSize) {
      tStamps.shift();
    }

    // Compute EMA baseline
    const ema = computeEma(history, this.emaAlpha);
    const windowMean = mean(history);
    const windowStd = stddev(history, windowMean);

    // Z-score against EMA-smoothed baseline
    const zScore = windowStd === 0 ? 0 : (value - ema) / windowStd;

    let severity: "NORMAL" | "WARN" | "CRITICAL";
    const absZ = Math.abs(zScore);
    if (absZ > 3) {
      severity = "CRITICAL";
    } else if (absZ > 2) {
      severity = "WARN";
    } else {
      severity = "NORMAL";
    }

    return {
      timestamp,
      metric,
      value,
      zScore,
      severity,
      baselineMean: ema,
      baselineStddev: windowStd,
    };
  }

  /** Batch feed from a DashboardSnapshot */
  feedSnapshot(snapshot: DashboardSnapshot): AnomalyScore[] {
    const results: AnomalyScore[] = [];
    const ts = snapshot.timestamp;

    // Cognition metrics
    results.push(this.feed("cognition.nodeCount", snapshot.cognition.nodeCount, ts));
    results.push(this.feed("cognition.edgeCount", snapshot.cognition.edgeCount, ts));
    results.push(this.feed("cognition.embeddedNodeRatio", snapshot.cognition.embeddedNodeRatio, ts));
    results.push(this.feed("cognition.avgTraversalMs", snapshot.cognition.avgTraversalMs, ts));
    results.push(this.feed("cognition.traversalTruncationRate", snapshot.cognition.traversalTruncationRate, ts));

    // Amygdala metrics
    results.push(this.feed("amygdala.triggeredCount24h", snapshot.amygdala.triggeredCount24h, ts));
    results.push(this.feed("amygdala.avgRiskScore", snapshot.amygdala.avgRiskScore, ts));

    // Self-heal metrics
    results.push(this.feed("selfHeal.totalAttempts", snapshot.selfHeal.totalAttempts, ts));
    results.push(this.feed("selfHeal.successRate", snapshot.selfHeal.successRate, ts));
    results.push(this.feed("selfHeal.revertRate", snapshot.selfHeal.revertRate, ts));
    results.push(this.feed("selfHeal.avgDurationMs", snapshot.selfHeal.avgDurationMs, ts));
    results.push(this.feed("selfHeal.avgConfidence", snapshot.selfHeal.avgConfidence, ts));

    // Arbitration metrics
    results.push(this.feed("arbitration.totalConflicts", snapshot.arbitration.totalConflicts, ts));
    results.push(this.feed("arbitration.conflictRate", snapshot.arbitration.conflictRate, ts));
    results.push(this.feed("arbitration.autoResolveRate", snapshot.arbitration.autoResolveRate, ts));
    results.push(this.feed("arbitration.humanRequiredRate", snapshot.arbitration.humanRequiredRate, ts));
    results.push(this.feed("arbitration.appealRate", snapshot.arbitration.appealRate, ts));
    results.push(this.feed("arbitration.appealAcceptRate", snapshot.arbitration.appealAcceptRate, ts));

    // Governance metrics
    results.push(this.feed("governance.activeRuleCount", snapshot.governance.activeRuleCount, ts));
    results.push(this.feed("governance.pendingProposalCount", snapshot.governance.pendingProposalCount, ts));
    results.push(this.feed("governance.approvalRate", snapshot.governance.approvalRate, ts));
    results.push(this.feed("governance.rejectionRate", snapshot.governance.rejectionRate, ts));

    return results;
  }

  /** Analyze seasonal patterns for a metric */
  analyzeSeasonality(metric: string): SeasonalityResult {
    const history = this.metricHistory.get(metric);
    if (!history || history.length < 24) {
      return {
        dailyPattern: new Array(24).fill(0),
        weeklyPattern: new Array(7).fill(0),
        trend: "STABLE",
        conceptDrift: false,
      };
    }

    const tStamps = this.metricTimestamps.get(metric)!;

    // Daily pattern: 24 hour buckets
    const hourlyBuckets: number[][] = new Array(24).fill(null).map(() => []);
    for (let i = 0; i < history.length; i++) {
      const d = new Date(tStamps[i]);
      const hour = d.getHours();
      hourlyBuckets[hour].push(history[i]);
    }
    const dailyPattern = hourlyBuckets.map((bucket) => (bucket.length > 0 ? mean(bucket) : 0));

    // Weekly pattern: 7 day buckets (0=Sunday, ..., 6=Saturday)
    const weeklyBuckets: number[][] = new Array(7).fill(null).map(() => []);
    for (let i = 0; i < history.length; i++) {
      const d = new Date(tStamps[i]);
      const dow = d.getDay();
      weeklyBuckets[dow].push(history[i]);
    }
    const weeklyPattern = weeklyBuckets.map((bucket) => (bucket.length > 0 ? mean(bucket) : 0));

    // Trend: linear regression over time indices
    const xs = history.map((_, i) => i);
    const { slope } = linearRegression(xs, history);

    let trend: "UP" | "DOWN" | "STABLE";
    const thresholdRatio = history.length > 0
      ? Math.abs(slope * history.length) / (mean(history) || 1)
      : 0;
    if (thresholdRatio > 0.1) {
      trend = slope > 0 ? "UP" : "DOWN";
    } else {
      trend = "STABLE";
    }

    // Concept drift: check if recent values are systematically different from older ones
    const mid = Math.floor(history.length / 2);
    const earlyMean = mean(history.slice(0, mid));
    const lateMean = mean(history.slice(mid));
    const overallStd = stddev(history, mean(history));
    const driftMagnitude = overallStd > 0 ? Math.abs(lateMean - earlyMean) / overallStd : 0;
    const conceptDrift = driftMagnitude > 1.5;

    return { dailyPattern, weeklyPattern, trend, conceptDrift };
  }
}
