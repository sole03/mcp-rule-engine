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
 * @file CanaryController — 渐进式交付与自动回滚
 *
 * 实现金丝雀发布流程：5% → 20% → 50% → 100%
 * 每个阶段达到 minSuccessRate 才推进，否则回滚。
 */

export interface CanaryStage {
  percentage: number;      // 5, 20, 50, 100
  durationHours: number;
  minSuccessRate: number;  // minimum success rate to proceed (0.0-1.0)
}

export type CanaryStatus =
  | "IDLE"
  | `ROLLING_${number}%`
  | "PAUSED"
  | "ROLLED_BACK"
  | "COMPLETED";

export interface CanaryState {
  id: string;
  status: CanaryStatus;
  currentStage: number;
  totalStages: number;
  startedAt: string;
  lastAdvanceAt: string;
  metrics: {
    fpRate: number;
    adoptRate: number;
    healthGatePassed: boolean;
  }[];
}

export const DEFAULT_CANARY_STAGES: CanaryStage[] = [
  { percentage: 5, durationHours: 24, minSuccessRate: 0.8 },
  { percentage: 20, durationHours: 24, minSuccessRate: 0.85 },
  { percentage: 50, durationHours: 48, minSuccessRate: 0.9 },
  { percentage: 100, durationHours: 0, minSuccessRate: 0.95 },
];

export class CanaryController {
  private state: CanaryState | null = null;

  /**
   * 启动金丝雀发布。
   */
  start(rolloutId: string, stages?: CanaryStage[]): CanaryState {
    const resolvedStages = stages ?? DEFAULT_CANARY_STAGES;

    this.state = {
      id: rolloutId,
      status: `ROLLING_${resolvedStages[0].percentage}%` as CanaryStatus,
      currentStage: 0,
      totalStages: resolvedStages.length,
      startedAt: new Date().toISOString(),
      lastAdvanceAt: new Date().toISOString(),
      metrics: [],
    };

    return this.state;
  }

  /**
   * 推进到下一阶段 (由定时器或 CI 调用)。
   */
  advance(metrics: {
    fpRate: number;
    adoptRate: number;
    healthGatePassed: boolean;
  }): {
    promoted: boolean;
    newStatus: CanaryStatus;
    reason: string;
  } {
    if (!this.state) {
      return {
        promoted: false,
        newStatus: "IDLE",
        reason: "No canary rollout in progress",
      };
    }

    if (this.state.status === "ROLLED_BACK") {
      return {
        promoted: false,
        newStatus: "ROLLED_BACK",
        reason: "Canary has already been rolled back",
      };
    }

    if (this.state.status === "COMPLETED") {
      return {
        promoted: false,
        newStatus: "COMPLETED",
        reason: "Canary has already completed",
      };
    }

    const stages = DEFAULT_CANARY_STAGES;
    const currentStageDef = stages[this.state.currentStage];
    if (!currentStageDef) {
      return {
        promoted: false,
        newStatus: "COMPLETED",
        reason: "No stage definition found — completing",
      };
    }

    // Record metrics snapshot
    this.state.metrics.push({ ...metrics });
    this.state.lastAdvanceAt = new Date().toISOString();

    const successRate = 1 - metrics.fpRate;

    // Health gate must pass AND success rate must meet minimum
    if (!metrics.healthGatePassed) {
      this.state.status = "ROLLED_BACK";
      return {
        promoted: false,
        newStatus: "ROLLED_BACK",
        reason: `Health gate failed — rolling back`,
      };
    }

    if (successRate < currentStageDef.minSuccessRate) {
      this.state.status = "ROLLED_BACK";
      return {
        promoted: false,
        newStatus: "ROLLED_BACK",
        reason: `Success rate ${(successRate * 100).toFixed(1)}% below minimum ${(currentStageDef.minSuccessRate * 100).toFixed(1)}%`,
      };
    }

    // Advance to next stage
    const nextStage = this.state.currentStage + 1;

    if (nextStage >= stages.length) {
      this.state.status = "COMPLETED";
      this.state.currentStage = stages.length - 1;
      return {
        promoted: true,
        newStatus: "COMPLETED",
        reason: "All canary stages completed",
      };
    }

    this.state.currentStage = nextStage;
    this.state.status = `ROLLING_${stages[nextStage].percentage}%` as CanaryStatus;

    return {
      promoted: true,
      newStatus: this.state.status,
      reason: `Advanced to stage ${nextStage + 1}/${stages.length} (${stages[nextStage].percentage}%)`,
    };
  }

  /**
   * 强制回滚。
   */
  rollback(reason: string): CanaryState {
    if (!this.state) {
      throw new Error("No canary rollout in progress — cannot rollback");
    }

    this.state.status = "ROLLED_BACK";
    return this.state;
  }

  /**
   * 获取当前金丝雀状态。
   */
  getState(): CanaryState | null {
    return this.state;
  }

  /**
   * 检查某个 repository ID 是否落在当前金丝雀百分比范围内。
   *
   * 使用确定性哈希：hash(repoId) % 100 < percentage
   */
  isInCanary(repoId: string): boolean {
    if (!this.state) return false;

    const stages = DEFAULT_CANARY_STAGES;
    const currentStage = stages[this.state.currentStage];
    if (!currentStage) return false;

    const hash = djb2Hash(repoId);
    return hash % 100 < currentStage.percentage;
  }

  /**
   * 标记为已完成。
   */
  complete(): CanaryState {
    if (!this.state) {
      throw new Error("No canary rollout in progress — cannot complete");
    }

    this.state.status = "COMPLETED";
    return this.state;
  }
}

/**
 * djb2 哈希算法 — 简单、确定性、适合百分比分桶。
 */
function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i); // hash * 33 + c
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}
