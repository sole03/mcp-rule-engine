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
 * @file Shapley Attributor — 特征贡献归因
 *
 * 使用简化的 Shapley 值近似计算多维异常中各维度的贡献度。
 * 策略：计算每个维度的边际贡献 (实际值 - 基线值)，归一化后排序。
 *
 * 零外部依赖，纯原生实现。
 */

// ── Types ──

export interface DimensionBreakdown {
  dimension: string;
  contribution: number;
  rawValue: number;
  direction: "HIGHER" | "LOWER" | "NEUTRAL";
}

export interface AttributionResult {
  timestamp: string;
  metric: string;
  anomalyScore: number;
  dimensions: DimensionBreakdown[];
}

// ── ShapleyAttributor ──

export class ShapleyAttributor {
  /**
   * Given an anomaly''s multi-dimensional breakdown, calculate Shapley value approximations.
   *
   * Strategy (simplified Shapley):
   * 1. For each dimension, compute marginal contribution = actual - baseline
   * 2. Normalize all absolute marginal contributions to sum to 1.0
   * 3. Sort by absolute contribution (highest first)
   *
   * @param metric      Name of the metric being attributed
   * @param dimensions  Actual values: { "team:frontend": 12, "team:backend": 3, ... }
   * @param baseline    Expected/baseline values for each dimension
   * @param timestamp   ISO 8601 timestamp
   */
  attribute(
    metric: string,
    dimensions: Record<string, number>,
    baseline: Record<string, number>,
    timestamp: string
  ): AttributionResult {
    const totalBaseline = Object.values(baseline).reduce((a, b) => a + b, 0);
    const totalActual = Object.values(dimensions).reduce((a, b) => a + b, 0);
    const anomalyScore = totalBaseline > 0
      ? (totalActual - totalBaseline) / totalBaseline
      : 0;

    // Step 1: Compute marginal contributions for each dimension
    const breakdowns: { dimension: string; marginal: number; rawValue: number }[] = [];

    for (const dim of Object.keys({ ...dimensions, ...baseline })) {
      const actualVal = dimensions[dim] ?? 0;
      const baselineVal = baseline[dim] ?? 0;
      const marginal = actualVal - baselineVal;
      breakdowns.push({ dimension: dim, marginal, rawValue: actualVal });
    }

    // Step 2: Normalize contributions
    const totalAbsMarginal = breakdowns.reduce((sum, b) => sum + Math.abs(b.marginal), 0);

    const dimensionBreakdowns: DimensionBreakdown[] = breakdowns.map((b) => {
      const contribution = totalAbsMarginal > 0
        ? b.marginal / totalAbsMarginal
        : 0;

      let direction: "HIGHER" | "LOWER" | "NEUTRAL";
      if (Math.abs(b.marginal) < 1e-9) {
        direction = "NEUTRAL";
      } else if (b.marginal > 0) {
        direction = "HIGHER";
      } else {
        direction = "LOWER";
      }

      return {
        dimension: b.dimension,
        contribution,
        rawValue: b.rawValue,
        direction,
      };
    });

    // Step 3: Sort by absolute contribution (highest first)
    dimensionBreakdowns.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

    return {
      timestamp,
      metric,
      anomalyScore,
      dimensions: dimensionBreakdowns,
    };
  }
}
