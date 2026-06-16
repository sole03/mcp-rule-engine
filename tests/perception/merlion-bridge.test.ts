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

import { describe, it, expect } from "vitest";
import { MerlionBridge } from "../../packages/core/src/perception/merlion-bridge.js";
import type { DashboardSnapshot } from "../../packages/core/src/dashboard/types.js";

// ── Helpers ──

function iso(offsetMinutes = 0): string {
  const d = new Date(Date.UTC(2026, 5, 15, 10, 0, 0));
  d.setMinutes(d.getMinutes() + offsetMinutes);
  return d.toISOString();
}

function makeSnapshot(overrides: Partial<DashboardSnapshot> = {}): DashboardSnapshot {
  const ts = iso();
  return {
    timestamp: ts,
    version: "1.0.0",
    cognition: {
      nodeCount: 42,
      edgeCount: 128,
      embeddedNodeRatio: 0.75,
      avgTraversalMs: 12.5,
      traversalTruncationRate: 0.02,
      topIntentDistribution: [],
      ...overrides.cognition,
    },
    amygdala: {
      triggeredCount24h: 3,
      avgRiskScore: 0.15,
      fatigueLevel: "NORMAL",
      recentTriggers: [],
      ...overrides.amygdala,
    },
    selfHeal: {
      totalAttempts: 5,
      successRate: 0.8,
      revertRate: 0.2,
      avgDurationMs: 400,
      avgConfidence: 0.85,
      safetyValveTripped: false,
      topHealedFiles: [],
      ...overrides.selfHeal,
    },
    arbitration: {
      totalConflicts: 10,
      conflictRate: 0.1,
      autoResolveRate: 0.6,
      humanRequiredRate: 0.3,
      appealRate: 0.1,
      appealAcceptRate: 0.5,
      topConflictPatterns: [],
      ...overrides.arbitration,
    },
    governance: {
      activeRuleCount: 20,
      pendingProposalCount: 2,
      approvalRate: 0.9,
      rejectionRate: 0.1,
      immuneStats: {
        coldStartCount: 0,
        expiringCount: 0,
        coldStorageCount: 0,
        conflictRate: 0,
        conflictLocked: false,
      },
      topMatchedPolicies: [],
      ruleEfficacy: [],
      policyVariantCompare: null,
      ...overrides.governance,
    },
    alerts: [],
    ...overrides,
  } as DashboardSnapshot;
}

// ── Tests ──

describe("MerlionBridge", () => {
  describe("feed()", () => {
    it("sinusoidal normal: all zScores should be NORMAL (<2)", () => {
      const bridge = new MerlionBridge(168, 0.1);
      const results = [];
      for (let i = 0; i < 100; i++) {
        const value = Math.sin(i * 0.1);
        results.push(bridge.feed("sin", value, iso(i)));
      }
      for (const r of results) {
        expect(Math.abs(r.zScore)).toBeLessThan(2);
        expect(r.severity).toBe("NORMAL");
      }
    });

    it("step anomaly: spike after stable values triggers WARN or CRITICAL", () => {
      const bridge = new MerlionBridge(168, 0.1);
      // Feed 50 values around mean 10 with small jitter so stddev > 0
      for (let i = 0; i < 50; i++) {
        const value = i % 2 === 0 ? 9.5 : 10.5;
        bridge.feed("step", value, iso(i));
      }
      // Spike to 100
      const spike = bridge.feed("step", 100, iso(50));
      expect(Math.abs(spike.zScore)).toBeGreaterThan(2);
      expect(["WARN", "CRITICAL"]).toContain(spike.severity);
    });

    it("sparse data: single point has zScore 0", () => {
      const bridge = new MerlionBridge();
      const result = bridge.feed("sparse", 42, iso());
      expect(result.zScore).toBe(0);
      expect(result.severity).toBe("NORMAL");
    });

    it("ema convergence: feeding same value converges baseline", () => {
      const bridge = new MerlionBridge(168, 0.1);
      const value = 7;
      for (let i = 0; i < 100; i++) {
        bridge.feed("ema", value, iso(i));
      }
      const final = bridge.feed("ema", value, iso(100));
      expect(final.baselineMean).toBeCloseTo(value, 0);
      expect(final.baselineStddev).toBeCloseTo(0, 1);
    });
  });

  describe("feedSnapshot()", () => {
    it("returns 22 anomaly scores for a valid snapshot", () => {
      const bridge = new MerlionBridge();
      const snapshot = makeSnapshot();
      const results = bridge.feedSnapshot(snapshot);
      expect(results).toHaveLength(22);
      for (const r of results) {
        expect(r).toHaveProperty("metric");
        expect(r).toHaveProperty("zScore");
        expect(r).toHaveProperty("severity");
      }
    });
  });

  describe("analyzeSeasonality()", () => {
    it("trend UP for linearly increasing values", () => {
      const bridge = new MerlionBridge(168, 0.1);
      for (let i = 0; i < 100; i++) {
        bridge.feed("trend", i + 1, iso(i));
      }
      const result = bridge.analyzeSeasonality("trend");
      expect(result.trend).toBe("UP");
    });

    it("conceptDrift true when early and late halves differ", () => {
      const bridge = new MerlionBridge(168, 0.1);
      // Early half: mean ≈ 10
      for (let i = 0; i < 50; i++) {
        bridge.feed("drift", 10, iso(i));
      }
      // Late half: mean ≈ 50
      for (let i = 50; i < 100; i++) {
        bridge.feed("drift", 50, iso(i));
      }
      const result = bridge.analyzeSeasonality("drift");
      expect(result.conceptDrift).toBe(true);
    });

    it("returns empty patterns for unknown metric", () => {
      const bridge = new MerlionBridge();
      const result = bridge.analyzeSeasonality("nonexistent");
      expect(result.dailyPattern).toHaveLength(24);
      expect(result.weeklyPattern).toHaveLength(7);
      expect(result.trend).toBe("STABLE");
      expect(result.conceptDrift).toBe(false);
    });
  });
});
