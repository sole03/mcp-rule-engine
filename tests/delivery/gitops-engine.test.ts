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

import { GitOpsEngine } from "../../packages/core/src/delivery/gitops-engine.js";
import type { DashboardSnapshot, ShadowMetrics } from "../../packages/core/src/dashboard/types.js";
import { describe, it, expect } from "vitest";

function makeCleanSnapshot(overrides?: Partial<DashboardSnapshot>): DashboardSnapshot {
  return {
    timestamp: "2026-01-15T10:00:00Z",
    version: "1.0.0",
    cognition: {
      nodeCount: 120,
      edgeCount: 250,
      embeddedNodeRatio: 0.65,
      avgTraversalMs: 12.3,
      traversalTruncationRate: 0.02,
      topIntentDistribution: [],
    },
    amygdala: {
      triggeredCount24h: 5,
      avgRiskScore: 0.15,
      fatigueLevel: "NORMAL",
      recentTriggers: [],
    },
    selfHeal: {
      totalAttempts: 40,
      successRate: 0.85,
      revertRate: 0.05,
      avgDurationMs: 200,
      avgConfidence: 0.8,
      safetyValveTripped: false,
      topHealedFiles: [],
    },
    arbitration: {
      totalConflicts: 10,
      conflictRate: 0.03,
      autoResolveRate: 0.7,
      humanRequiredRate: 0.3,
      appealRate: 0.05,
      appealAcceptRate: 0.5,
      topConflictPatterns: [],
    },
    governance: {
      activeRuleCount: 8,
      pendingProposalCount: 2,
      approvalRate: 0.75,
      rejectionRate: 0.25,
      immuneStats: {
        coldStartCount: 0,
        expiringCount: 0,
        coldStorageCount: 0,
        conflictRate: 0,
        conflictLocked: false,
      },
      topMatchedPolicies: [],
      ruleEfficacy: [
        { ruleId: "R001", hitCount: 50, falsePositiveCount: 2, adoptedCount: 40, fpRate: 0.04, adoptRate: 0.80 },
        { ruleId: "R002", hitCount: 30, falsePositiveCount: 3, adoptedCount: 22, fpRate: 0.10, adoptRate: 0.73 },
      ],
      policyVariantCompare: null,
    },
    alerts: [],
    ...overrides,
  };
}

function makeShadowMetrics(overrides?: Partial<ShadowMetrics>): ShadowMetrics {
  return {
    activeCount: 3,
    totalHits: 120,
    wouldBlockCount: 7,
    expiringToday: 1,
    ...overrides,
  };
}

const dummyOptions = {
  repoOwner: "test-org",
  repoName: "test-repo",
  baseBranch: "main",
  headBranch: "gitops/auto-pr-001",
};

describe("GitOpsEngine", () => {
  // ── 1. buildProposalPR basic ──
  it("buildProposalPR generates body with expected sections", () => {
    const engine = new GitOpsEngine(dummyOptions);
    const snapshot = makeCleanSnapshot();
    const shadow = makeShadowMetrics();

    const pr = engine.buildProposalPR(snapshot, shadow, "[GitOps] Auto PR", "Test rationale text");

    expect(pr.body).toContain("## Rationale");
    expect(pr.body).toContain("Test rationale text");
    expect(pr.body).toContain("## Evidence Chain");
    expect(pr.body).toContain("| Rule ID | Hit Count | FP Rate | Adopt Rate |");
    expect(pr.body).toContain("## Shadow Metrics");
    expect(pr.body).toContain("| Active Shadow Rules");
    expect(pr.body).toContain("## Risk Assessment");
    expect(pr.body).toContain("Auto-calculated Risk Level");
    expect(pr.body).toContain("## Metrics Summary");
    expect(pr.body).toContain("## System Topology");
    expect(pr.body).toContain("```mermaid");
    expect(pr.body).toContain("Cognition");
    expect(pr.body).toContain("Amygdala");
    expect(pr.body).toContain("SelfHeal");
    expect(pr.body).toContain("## Affected Files");
  });

  // ── 2. risk HIGH ──
  it("returns HIGH risk when any rule fpRate > 0.2", () => {
    const engine = new GitOpsEngine(dummyOptions);
    const snapshot = makeCleanSnapshot({
      governance: {
        ...makeCleanSnapshot().governance,
        ruleEfficacy: [
          { ruleId: "R-HIGH", hitCount: 10, falsePositiveCount: 5, adoptedCount: 2, fpRate: 0.35, adoptRate: 0.20 },
        ],
      },
    });
    const shadow = makeShadowMetrics();

    const pr = engine.buildProposalPR(snapshot, shadow, "test", "rationale");

    expect(pr.body).toContain("**Auto-calculated Risk Level: HIGH**");
    expect(pr.labels).toContain("risk:high");
  });

  // ── 3. risk LOW ──
  it("returns LOW risk for clean snapshot with all nominal metrics", () => {
    const engine = new GitOpsEngine(dummyOptions);
    const snapshot = makeCleanSnapshot();
    const shadow = makeShadowMetrics();

    const pr = engine.buildProposalPR(snapshot, shadow, "test", "rationale");

    expect(pr.body).toContain("**Auto-calculated Risk Level: LOW**");
    expect(pr.labels).toContain("risk:low");
  });

  // ── 4. PR title ──
  it("buildProposalPR returns the correct title", () => {
    const engine = new GitOpsEngine(dummyOptions);
    const snapshot = makeCleanSnapshot();
    const shadow = makeShadowMetrics();
    const title = "[GitOps] Release v2.3.1";

    const pr = engine.buildProposalPR(snapshot, shadow, title, "Rationale here");

    expect(pr.title).toBe(title);
  });

  // ── 5. labels and assignees ──
  it("PrDescription contains labels and assignees", () => {
    const engine = new GitOpsEngine(dummyOptions);
    const snapshot = makeCleanSnapshot();
    const shadow = makeShadowMetrics();

    const pr = engine.buildProposalPR(snapshot, shadow, "T", "R");

    expect(pr.labels).toBeInstanceOf(Array);
    expect(pr.labels).toContain("gitops");
    expect(pr.assignees).toBeInstanceOf(Array);
    // assignees is always empty array per current implementation
    expect(pr.assignees).toEqual([]);
  });
});
