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

import { CanaryController, DEFAULT_CANARY_STAGES } from "../../packages/core/src/delivery/canary-controller.js";
import { describe, it, expect } from "vitest";

function healthyMetrics() {
  return { fpRate: 0.05, adoptRate: 0.90, healthGatePassed: true };
}

function highFpRateMetrics() {
  return { fpRate: 0.25, adoptRate: 0.60, healthGatePassed: true };
}

function healthGateFailedMetrics() {
  return { fpRate: 0.05, adoptRate: 0.90, healthGatePassed: false };
}

describe("CanaryController", () => {
  // ── 1. full rollout ──
  it("completes full rollout after advancing through all stages with healthy metrics", () => {
    const controller = new CanaryController();
    const state = controller.start("rollout-1");

    expect(state.status).toBe("ROLLING_5%");
    expect(state.currentStage).toBe(0);

    // Advance through all 4 stages
    let result;
    for (let i = 0; i < 3; i++) {
      result = controller.advance(healthyMetrics());
      expect(result.promoted).toBe(true);
    }

    // 4th (last) advance should complete
    result = controller.advance(healthyMetrics());
    expect(result.promoted).toBe(true);
    expect(result.newStatus).toBe("COMPLETED");
  });

  // ── 2. fpRate blocks advancement ──
  it("stays at current stage when fpRate is too high", () => {
    const controller = new CanaryController();
    controller.start("rollout-2");

    const result = controller.advance(highFpRateMetrics());

    expect(result.promoted).toBe(false);
    expect(result.newStatus).toBe("ROLLED_BACK");
    expect(result.reason).toContain("Success rate");
  });

  // ── 3. healthGate failure ──
  it("rolls back after healthGate failure", () => {
    const controller = new CanaryController();
    controller.start("rollout-3");

    // First healthGate failure rolls back immediately
    const result = controller.advance(healthGateFailedMetrics());

    expect(result.promoted).toBe(false);
    expect(result.newStatus).toBe("ROLLED_BACK");
    expect(result.reason).toContain("Health gate failed");
  });

  // ── 4. rollback ──
  it("rollback sets status to ROLLED_BACK", () => {
    const controller = new CanaryController();
    controller.start("rollout-4");

    // Advance once to make some progress
    controller.advance(healthyMetrics());

    const state = controller.rollback("Manual intervention");
    expect(state.status).toBe("ROLLED_BACK");
  });

  // ── 5. isInCanary deterministic ──
  it("isInCanary returns consistent results for same repoId", () => {
    const controller = new CanaryController();
    controller.start("rollout-5");

    const first = controller.isInCanary("repo-abc");
    const second = controller.isInCanary("repo-abc");
    const third = controller.isInCanary("repo-abc");

    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  // ── 6. empty state ──
  it("getState returns null before start", () => {
    const controller = new CanaryController();
    expect(controller.getState()).toBeNull();
  });

  // ── 7. default stages ──
  it("uses DEFAULT_CANARY_STAGES when no stages provided", () => {
    const controller = new CanaryController();
    const state = controller.start("rollout-7");

    expect(state.totalStages).toBe(DEFAULT_CANARY_STAGES.length);
    expect(state.status).toBe(`ROLLING_${DEFAULT_CANARY_STAGES[0].percentage}%`);
  });
});
