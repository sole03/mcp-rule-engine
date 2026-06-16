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
 * @file GitOpsEngine — 将 DashboardSnapshot 转换为 PR-ready Markdown 报告
 *
 * 生成结构化的 PR 描述，包含：
 *   1. Rationale — 人工变更理由
 *   2. Evidence Chain — 规则有效性排序表
 *   3. Shadow Metrics — 影子规则统计
 *   4. Risk Assessment — 基于 fpRate/revertRate 的自动风险评估
 *   5. Mermaid Topology — 认知系统健康状态图
 *   6. Affected Files — 占位符 (CI 填入)
 */

import type { DashboardSnapshot, ShadowMetrics } from "../dashboard/types.js";

export interface PrDescription {
  title: string;
  body: string;
  labels: string[];
  assignees: string[];
}

export interface GitOpsOptions {
  repoOwner: string;
  repoName: string;
  baseBranch: string;
  headBranch: string;
}

export class GitOpsEngine {
  constructor(private options: GitOpsOptions) {}

  /**
   * 从当前系统状态生成 PR 描述。
   */
  buildProposalPR(
    snapshot: DashboardSnapshot,
    shadowMetrics: ShadowMetrics,
    title: string,
    rationale: string,
  ): PrDescription {
    const riskLevel = this.computeRiskLevel(snapshot);

    const body = [
      "## Rationale",
      "",
      rationale,
      "",
      "## Evidence Chain",
      "",
      this.formatRuleEfficacy(snapshot),
      "",
      "## Shadow Metrics",
      "",
      this.formatShadowMetrics(shadowMetrics),
      "",
      "## Risk Assessment",
      "",
      `**Auto-calculated Risk Level: ${riskLevel}**`,
      "",
      `- FP Rate threshold: > 20% → HIGH`,
      `- Revert Rate threshold: > 10% → HIGH`,
      `- Current self-heal revert rate: ${(snapshot.selfHeal.revertRate * 100).toFixed(1)}%`,
      "",
      "## Metrics Summary",
      "",
      this.formatMetricsTable(snapshot),
      "",
      "## System Topology",
      "",
      this.generateTopologyDiagram(snapshot),
      "",
      "## Affected Files",
      "",
      "<!-- CI will populate affected file paths here -->",
      "_Pending CI analysis..._",
    ].join("\n");

    const labels = this.computeLabels(riskLevel, snapshot);

    return {
      title,
      body,
      labels,
      assignees: [],
    };
  }

  // ── Private: Formatters ──

  private formatMetricsTable(snapshot: DashboardSnapshot): string {
    const c = snapshot.cognition;
    const a = snapshot.amygdala;
    const s = snapshot.selfHeal;
    const arb = snapshot.arbitration;
    const g = snapshot.governance;

    return [
      "| Subsystem | Metric | Value |",
      "| --- | --- | --- |",
      `| Cognition | Node Count | ${c.nodeCount} |`,
      `| Cognition | Edge Count | ${c.edgeCount} |`,
      `| Cognition | Embedded Node Ratio | ${(c.embeddedNodeRatio * 100).toFixed(1)}% |`,
      `| Cognition | Avg Traversal | ${c.avgTraversalMs.toFixed(1)}ms |`,
      `| Amygdala | Triggers (24h) | ${a.triggeredCount24h} |`,
      `| Amygdala | Avg Risk Score | ${a.avgRiskScore.toFixed(2)} |`,
      `| Amygdala | Fatigue Level | ${a.fatigueLevel} |`,
      `| Self-Heal | Success Rate | ${(s.successRate * 100).toFixed(1)}% |`,
      `| Self-Heal | Revert Rate | ${(s.revertRate * 100).toFixed(1)}% |`,
      `| Self-Heal | Avg Duration | ${s.avgDurationMs.toFixed(1)}ms |`,
      `| Self-Heal | Safety Valve | ${s.safetyValveTripped ? "TRIPPED" : "OK"} |`,
      `| Arbitration | Conflict Rate | ${(arb.conflictRate * 100).toFixed(1)}% |`,
      `| Arbitration | Auto-Resolve Rate | ${(arb.autoResolveRate * 100).toFixed(1)}% |`,
      `| Governance | Active Rules | ${g.activeRuleCount} |`,
      `| Governance | Approval Rate | ${(g.approvalRate * 100).toFixed(1)}% |`,
      `| Governance | Rejection Rate | ${(g.rejectionRate * 100).toFixed(1)}% |`,
    ].join("\n");
  }

  private formatRuleEfficacy(snapshot: DashboardSnapshot): string {
    const rules = [...snapshot.governance.ruleEfficacy]
      .sort((a, b) => b.adoptRate - a.adoptRate);

    if (rules.length === 0) {
      return "_No active rules with efficacy data._";
    }

    const header = "| Rule ID | Hit Count | FP Rate | Adopt Rate |";
    const sep = "| --- | ---: | ---: | ---: |";
    const rows = rules.map(r =>
      `| ${r.ruleId} | ${r.hitCount} | ${(r.fpRate * 100).toFixed(1)}% | ${(r.adoptRate * 100).toFixed(1)}% |`
    );

    return [header, sep, ...rows].join("\n");
  }

  private formatShadowMetrics(metrics: ShadowMetrics): string {
    return [
      "| Metric | Value |",
      "| --- | ---: |",
      `| Active Shadow Rules | ${metrics.activeCount} |`,
      `| Total Hits | ${metrics.totalHits} |`,
      `| Would-Block Count | ${metrics.wouldBlockCount} |`,
      `| Expiring Today | ${metrics.expiringToday} |`,
    ].join("\n");
  }

  private generateTopologyDiagram(snapshot: DashboardSnapshot): string {
    const cHealth = snapshot.cognition.embeddedNodeRatio >= 0.5 ? "HEALTHY" : "DEGRADED";
    const aHealth = snapshot.amygdala.fatigueLevel === "CRITICAL" ? "CRITICAL"
      : snapshot.amygdala.fatigueLevel === "ELEVATED" ? "WARNING" : "HEALTHY";
    const sHealth = snapshot.selfHeal.safetyValveTripped ? "TRIPPED"
      : snapshot.selfHeal.successRate >= 0.7 ? "HEALTHY" : "DEGRADED";
    const arbHealth = snapshot.arbitration.conflictRate <= 0.1 ? "HEALTHY" : "DEGRADED";
    const gHealth = snapshot.governance.approvalRate >= 0.5 ? "HEALTHY" : "DEGRADED";

    return [
      "```mermaid",
      "graph TD",
      `    Cognition["Cognition Engine<br/>(${cHealth})"]`,
      `    Amygdala["Amygdala<br/>(${aHealth})"]`,
      `    SelfHeal["Self-Heal Loop<br/>(${sHealth})"]`,
      `    Arbitration["Arbitration<br/>(${arbHealth})"]`,
      `    Governance["Governance<br/>(${gHealth})"]`,
      `    Cognition --> Amygdala`,
      `    Cognition --> SelfHeal`,
      `    SelfHeal --> Arbitration`,
      `    Arbitration --> Governance`,
      `    Governance --> Cognition`,
      `    Amygdala --> SelfHeal`,
      "```",
    ].join("\n");
  }

  // ── Private: Risk & Labels ──

  private computeRiskLevel(snapshot: DashboardSnapshot): "HIGH" | "MEDIUM" | "LOW" {
    // Check rules for fpRate > 20%
    for (const rule of snapshot.governance.ruleEfficacy) {
      if (rule.fpRate > 0.2) return "HIGH";
    }

    // Check self-heal revert rate > 10%
    if (snapshot.selfHeal.revertRate > 0.1) return "HIGH";

    // Medium: arbitration conflict rate > 5% or safety valve tripped
    if (
      snapshot.arbitration.conflictRate > 0.05 ||
      snapshot.selfHeal.safetyValveTripped ||
      snapshot.amygdala.fatigueLevel !== "NORMAL"
    ) {
      return "MEDIUM";
    }

    return "LOW";
  }

  private computeLabels(riskLevel: string, snapshot: DashboardSnapshot): string[] {
    const labels: string[] = ["gitops", `risk:${riskLevel.toLowerCase()}`];

    if (snapshot.selfHeal.safetyValveTripped) labels.push("safety-valve-tripped");
    if (snapshot.amygdala.fatigueLevel === "CRITICAL") labels.push("fatigue-critical");
    if (snapshot.arbitration.conflictRate > 0.1) labels.push("high-conflict");

    return labels;
  }
}
