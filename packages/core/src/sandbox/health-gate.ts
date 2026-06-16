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
 * @file HealthGate — 复合健康度门控
 *
 * 在每次自愈循环执行前进行多维健康度检查：
 * - 内存占用百分比
 * - 遍历延迟 P99
 * - 回滚率（revert / total attempts）
 * - 疲劳等级（安全阀反馈）
 *
 * 任一指标超标即拒绝本轮自愈，防止系统在劣化状态下继续操作。
 */

import type { HealthGateResult, HealthMetrics } from "./types.js";

export class HealthGate {
  /** 最大内存占用百分比阈值。默认 85% */
  static readonly MAX_MEMORY_PERCENT = 85;
  /** 最大遍历延迟 P99 阈值 (ms)。默认 2000ms */
  static readonly MAX_TRAVERSAL_P99_MS = 2000;
  /** 最大回滚率阈值。默认 0.3 (30%) */
  static readonly MAX_REVERT_RATE = 0.3;

  /**
   * 检查健康度指标是否允许自愈。
   *
   * 检查顺序：
   *   1. 内存占用
   *   2. 遍历延迟
   *   3. 回滚率
   *   4. 疲劳等级
   *
   * @returns HealthGateResult — allowed=true 表示可以通过门控
   */
  check(metrics: HealthMetrics): HealthGateResult {
    // 内存超标
    if (metrics.memoryUsagePercent > HealthGate.MAX_MEMORY_PERCENT) {
      return {
        allowed: false,
        reason: `Memory ${metrics.memoryUsagePercent}% > ${HealthGate.MAX_MEMORY_PERCENT}%`,
        metrics,
      };
    }

    // 遍历延迟超标
    if (metrics.traversalLatencyP99Ms > HealthGate.MAX_TRAVERSAL_P99_MS) {
      return {
        allowed: false,
        reason: `Traversal p99 ${metrics.traversalLatencyP99Ms}ms > ${HealthGate.MAX_TRAVERSAL_P99_MS}ms`,
        metrics,
      };
    }

    // 回滚率超标
    if (metrics.revertRate > HealthGate.MAX_REVERT_RATE) {
      return {
        allowed: false,
        reason: `Revert rate ${(metrics.revertRate * 100).toFixed(1)}% > ${HealthGate.MAX_REVERT_RATE * 100}%`,
        metrics,
      };
    }

    // 安全阀疲劳 CRITICAL
    if (metrics.fatigueLevel === "CRITICAL") {
      return {
        allowed: false,
        reason: "Safety valve fatigue CRITICAL",
        metrics,
      };
    }

    return { allowed: true, metrics };
  }
}
