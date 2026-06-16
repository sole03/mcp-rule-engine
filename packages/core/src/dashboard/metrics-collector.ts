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
 * @file MetricsCollector — 认知负载指标聚合器
 *
 * 从所有子系统（MetricEvent, Rule, Proposal, ConflictRecord, CognitionNode/Edge,
 * Prisma 表）聚合 KPI 数据，生成 DashboardSnapshot。
 *
 * 设计原则：
 * - 只读查询，不产生副作用
 * - 单次 snapshot() 调用完成全量聚合
 * - 所有查询均带 LIMIT，防止 OOM
 * - 与存储后端解耦（通过 PrismaClient 注入）
 *
 * 当前桥接：通过 PrismaClient 访问数据库。未来可切换到 Repository 接口。
 */

import type { PrismaClient } from "@prisma/client";
import type {
  DashboardSnapshot,
  CognitionMetrics,
  AmygdalaMetrics,
  SelfHealMetrics,
  ArbitrationMetrics,
  GovernanceMetrics,
  ShadowMetrics,
  MigrationReport,
  Alert,
  AlertRule,
  AuditEvent,
} from "./types.js";

// ── Default Alert Rules ──

export const DEFAULT_ALERT_RULES: AlertRule[] = [
  {
    metric: "amygdala.fatigueLevel",
    threshold: 0,
    operator: "gt",
    severity: "CRITICAL",
    message: "Amygdala fatigue level critical — system under heavy stress",
  },
  {
    metric: "selfHeal.revertRate",
    threshold: 0.3,
    operator: "gt",
    severity: "WARN",
    message: "Self-heal revert rate exceeds 30% — check patch quality",
  },
  {
    metric: "selfHeal.safetyValveTripped",
    threshold: 0,
    operator: "gt",
    severity: "CRITICAL",
    message: "Self-heal safety valve tripped — manual intervention required",
  },
  {
    metric: "arbitration.conflictRate",
    threshold: 0.1,
    operator: "gt",
    severity: "CRITICAL",
    message: "Conflict rate exceeds 10% — consider rule freeze",
  },
  {
    metric: "governance.approvalRate",
    threshold: 0.5,
    operator: "lt",
    severity: "WARN",
    message: "Approval rate below 50% — review governance strictness",
  },
  {
    metric: "cognition.embeddedNodeRatio",
    threshold: 0.5,
    operator: "lt",
    severity: "INFO",
    message: "Embedding coverage below 50% — run embed warmup",
  },
];

// ── MetricsCollector ──

export class MetricsCollector {
  private alertRules: AlertRule[];

  constructor(
    private prisma: PrismaClient,
    alertRules?: AlertRule[],
  ) {
    this.alertRules = alertRules ?? DEFAULT_ALERT_RULES;
  }

  /**
   * 生成完整的认知健康快照。
   * 目标延迟：< 500ms (SQLite)。
   */
  async snapshot(): Promise<DashboardSnapshot> {
    const [cognition, amygdala, selfHeal, arbitration, governance] = await Promise.all([
      this.collectCognition(),
      this.collectAmygdala(),
      this.collectSelfHeal(),
      this.collectArbitration(),
      this.collectGovernance(),
    ]);

    const alerts = this.evaluateAlerts({
      cognition,
      amygdala,
      selfHeal,
      arbitration,
      governance,
    });

    return {
      timestamp: new Date().toISOString(),
      version: "1.0.0-alpha",
      cognition,
      amygdala,
      selfHeal,
      arbitration,
      governance,
      alerts,
    };
  }

  /**
   * 查询影子模式统计（Phase 3.1）。
   */
  async queryShadowMetrics(): Promise<ShadowMetrics> {
    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const [activeCount, totalHits, wouldBlockCount, expiringToday] = await Promise.all([
      this.prisma.rule.count({
        where: { shadowUntil: { not: null, gt: now } },
      }),
      this.prisma.shadowLog.count(),
      this.prisma.shadowLog.count({
        where: { wouldBlock: true },
      }),
      this.prisma.rule.count({
        where: { shadowUntil: { not: null, gt: now, lte: todayEnd } },
      }),
    ]);

    return { activeCount, totalHits, wouldBlockCount, expiringToday };
  }

  /**
   * 获取最近的审计事件。
   */
  async getEvents(limit = 50): Promise<AuditEvent[]> {
    const rows = await this.prisma.metricEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 200),
    });

    return rows.map(r => ({
      id: r.id,
      eventType: r.eventType,
      properties: safeParseJSON(r.properties),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * 获取当前活跃告警 (re-evaluate)。
   */
  async getAlerts(): Promise<Alert[]> {
    const snap = await this.snapshot();
    return snap.alerts;
  }

  // ── Private: Collectors ──

  private async collectCognition(): Promise<CognitionMetrics> {
    const [nodeCount, edgeCount] = await Promise.all([
      this.prisma.cognitionNode.count(),
      this.prisma.cognitionEdge.count(),
    ]);

    // 嵌入覆盖率 (embedded = has non-null embedding)
    const total = nodeCount;
    const embedded = total > 0
      ? await this.prisma.cognitionNode.count({ where: { embedding: { not: null } } } as any)
      : 0;

    // 遍历延迟分布 (从 MetricEvent 中提取)
    const traversalEvents = await this.prisma.metricEvent.findMany({
      where: { eventType: { in: ["cognition_query_completed", "cognition.traversal.completed"] } },
      select: { properties: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    let totalDuration = 0;
    let traversalCount = 0;
    let truncatedCount = 0;

    for (const ev of traversalEvents) {
      const p = safeParseJSON(ev.properties);
      if (typeof p?.durationMs === "number") {
        totalDuration += p.durationMs;
        traversalCount++;
      }
      if (p?.truncated === true) truncatedCount++;
    }

    // Intent 分布
    const intentEvents = await this.prisma.metricEvent.findMany({
      where: { eventType: "intent_recognized" },
      select: { properties: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const intentMap = new Map<string, number>();
    for (const ev of intentEvents) {
      const p = safeParseJSON(ev.properties);
      const intent: string = String(p?.intent ?? "UNKNOWN");
      intentMap.set(intent, (intentMap.get(intent) ?? 0) + 1);
    }
    const topIntentDistribution = Array.from(intentMap.entries())
      .map(([intent, count]) => ({ intent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      nodeCount,
      edgeCount,
      embeddedNodeRatio: total > 0 ? embedded / total : 0,
      avgTraversalMs: traversalCount > 0 ? Math.round(totalDuration / traversalCount) : 0,
      traversalTruncationRate: traversalEvents.length > 0 ? truncatedCount / traversalEvents.length : 0,
      topIntentDistribution,
    };
  }

  private async collectAmygdala(): Promise<AmygdalaMetrics> {
    const since24h = new Date(Date.now() - 24 * 3600 * 1000);

    const events = await this.prisma.metricEvent.findMany({
      where: { eventType: "amygdala_triggered", createdAt: { gte: since24h } },
      select: { properties: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    let totalRisk = 0;
    let riskCount = 0;
    const recentTriggers: AmygdalaMetrics["recentTriggers"] = [];

    for (const ev of events) {
      const p = safeParseJSON(ev.properties);
      if (typeof p?.riskScore === "number") {
        totalRisk += p.riskScore;
        riskCount++;
      }
      if (recentTriggers.length < 10) {
        recentTriggers.push({
          reason: String(p?.reason ?? "unknown"),
          riskScore: typeof p?.riskScore === "number" ? p.riskScore : 0,
          timestamp: ev.createdAt.toISOString(),
        });
      }
    }

    // 疲劳等级 (基于触发次数)
    const fatigueLevel = events.length >= 40 ? "CRITICAL"
      : events.length >= 20 ? "ELEVATED"
      : "NORMAL";

    return {
      triggeredCount24h: events.length,
      avgRiskScore: riskCount > 0 ? Math.round((totalRisk / riskCount) * 100) / 100 : 0,
      fatigueLevel,
      recentTriggers,
    };
  }

  private async collectSelfHeal(): Promise<SelfHealMetrics> {
    const all = await this.prisma.metricEvent.findMany({
      where: {
        eventType: { in: ["self_heal_attempt", "self_heal_success", "self_heal_revert"] },
      },
      select: { eventType: true, properties: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const attempts = all.filter(e => e.eventType === "self_heal_attempt").length;
    const successes = all.filter(e => e.eventType === "self_heal_success").length;
    const reverts = all.filter(e => e.eventType === "self_heal_revert").length;
    const total = attempts + successes + reverts;

    // 平均耗时与置信度
    let totalDuration = 0;
    let durationCount = 0;
    let totalConfidence = 0;
    let confidenceCount = 0;

    for (const ev of all) {
      const p = safeParseJSON(ev.properties);
      if (typeof p?.durationMs === "number") { totalDuration += p.durationMs; durationCount++; }
      if (typeof p?.confidence === "number") { totalConfidence += p.confidence; confidenceCount++; }
    }

    // 安全阀
    const valveEvents = await this.prisma.metricEvent.count({
      where: { eventType: "safety_valve_tripped", createdAt: { gte: new Date(Date.now() - 3600 * 1000) } },
    });

    // Top healed files
    const fileMap = new Map<string, number>();
    for (const ev of all) {
      const p = safeParseJSON(ev.properties);
      if (p?.filePath) fileMap.set(p.filePath as string, (fileMap.get(p.filePath as string) ?? 0) + 1);
    }
    const topHealedFiles = Array.from(fileMap.entries())
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalAttempts: total,
      successRate: total > 0 ? successes / total : 0,
      revertRate: total > 0 ? reverts / total : 0,
      avgDurationMs: durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
      avgConfidence: confidenceCount > 0 ? Math.round((totalConfidence / confidenceCount) * 100) / 100 : 0,
      safetyValveTripped: valveEvents > 0,
      topHealedFiles,
    };
  }

  private async collectArbitration(): Promise<ArbitrationMetrics> {
    // 冲突计数
    const totalConflicts = await this.prisma.conflictRecord.count();
    const resolvedConflicts = await this.prisma.conflictRecord.count({
      where: { resolution: { not: null } },
    });

    // 冲突率 (使用 rule count 作为基数)
    const ruleCount = await this.prisma.rule.count();
    const conflictRate = ruleCount > 0 ? totalConflicts / ruleCount : 0;

    // 仲裁裁决分布 (从 MetricEvent)
    const arbEvents = await this.prisma.metricEvent.findMany({
      where: { eventType: { in: ["conflict_detected", "conflict_resolved"] } },
      select: { properties: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    let autoResolved = 0;
    let manualRequired = 0;
    for (const ev of arbEvents) {
      const p = safeParseJSON(ev.properties);
      if (p?.verdict === "A_VALID" || p?.verdict === "B_VALID") autoResolved++;
      if (p?.verdict === "BOTH_VALID" || p?.verdict === "UNDECIDABLE") manualRequired++;
    }
    const totalArbEvents = autoResolved + manualRequired;

    // 申诉率
    const appealEvents = await this.prisma.metricEvent.count({
      where: { eventType: "appeal_raised" },
    });
    const appealAccepted = await this.prisma.metricEvent.count({
      where: { eventType: "appeal_resolved", properties: { contains: "ACCEPTED" } },
    });

    // Top conflict patterns
    const conflicts = await this.prisma.conflictRecord.findMany({
      select: { scopeKey: true },
      take: 500,
    });
    const patternMap = new Map<string, number>();
    for (const c of conflicts) {
      patternMap.set(c.scopeKey, (patternMap.get(c.scopeKey) ?? 0) + 1);
    }
    const topConflictPatterns = Array.from(patternMap.entries())
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalConflicts,
      conflictRate: Math.round(conflictRate * 1000) / 1000,
      autoResolveRate: totalArbEvents > 0 ? autoResolved / totalArbEvents : 0,
      humanRequiredRate: totalArbEvents > 0 ? manualRequired / totalArbEvents : 0,
      appealRate: conflictRate > 0 ? appealEvents / totalConflicts : 0,
      appealAcceptRate: appealEvents > 0 ? appealAccepted / appealEvents : 0,
      topConflictPatterns,
    };
  }

  private async collectGovernance(): Promise<GovernanceMetrics> {
    const activeRuleCount = await this.prisma.rule.count({ where: { status: "active" } });
    const totalRuleCount = await this.prisma.rule.count();

    const pendingProposalCount = await this.prisma.proposal.count({
      where: { status: "PENDING" },
    });

    // 审批率
    const approved = await this.prisma.proposal.count({ where: { status: "APPROVED" } });
    const rejected = await this.prisma.proposal.count({ where: { status: "REJECTED" } });
    const totalProposals = approved + rejected + pendingProposalCount
      + (await this.prisma.proposal.count({ where: { status: { in: ["EXPIRED", "OVERRIDDEN"] } } }));

    // 免疫统计 (从 MetricEvent)
    const immuneEvents = await this.prisma.metricEvent.findMany({
      where: { eventType: "immune_cycle_completed" },
      select: { properties: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    let immuneStats: GovernanceMetrics["immuneStats"] = {
      coldStartCount: 0,
      expiringCount: 0,
      coldStorageCount: 0,
      conflictRate: 0,
      conflictLocked: false,
    };
    if (immuneEvents.length > 0) {
      const latest = safeParseJSON(immuneEvents[0].properties);
      immuneStats = {
        coldStartCount: Number(latest?.coldStartImmune ?? 0),
        expiringCount: Number(latest?.expiringCount ?? 0),
        coldStorageCount: Number(latest?.coldStorageCount ?? 0),
        conflictRate: Number(latest?.conflictRate ?? 0),
        conflictLocked: latest?.conflictLocked === true,
      };
    }

    // Top matched policies
    const policyEvents = await this.prisma.metricEvent.findMany({
      where: { eventType: "policy_evaluated" },
      select: { properties: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const policyMap = new Map<string, number>();
    for (const ev of policyEvents) {
      const p = safeParseJSON(ev.properties);
      const ids = p?.matchedPolicyIds as string[] | undefined;
      if (Array.isArray(ids)) {
        for (const id of ids) policyMap.set(id, (policyMap.get(id) ?? 0) + 1);
      }
    }
    const topMatchedPolicies = Array.from(policyMap.entries())
      .map(([policyId, hits]) => ({ policyId, hits }))
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 10);

    // Rule efficacy (Dimension 1.1)
    const allRules = await this.prisma.rule.findMany({
      where: { status: "active" },
      select: { id: true, hitCount: true, falsePositiveCount: true, adoptedCount: true },
    });
    const ruleEfficacy = allRules.map(r => ({
      ruleId: r.id,
      hitCount: r.hitCount,
      falsePositiveCount: r.falsePositiveCount,
      adoptedCount: r.adoptedCount,
      fpRate: r.hitCount > 0 ? r.falsePositiveCount / r.hitCount : 0,
      adoptRate: r.hitCount > 0 ? r.adoptedCount / r.hitCount : 0,
    }));

    // Policy variant compare (Dimension 1.2)
    const policyVariantCompare = null; // populated by audit worker

    return {
      activeRuleCount,
      pendingProposalCount,
      approvalRate: totalProposals > 0 ? approved / totalProposals : 0,
      rejectionRate: totalProposals > 0 ? rejected / totalProposals : 0,
      immuneStats,
      topMatchedPolicies,
      ruleEfficacy,
      policyVariantCompare,
    };
  }

  // ── Private: Alerts ──

  private evaluateAlerts(snap: Omit<DashboardSnapshot, "alerts" | "timestamp" | "version">): Alert[] {
    const alerts: Alert[] = [];
    const now = new Date().toISOString();

    for (const rule of this.alertRules) {
      const value = this.getMetricValue(snap, rule.metric);
      const triggered = rule.operator === "gt" ? value > rule.threshold : value < rule.threshold;

      if (triggered) {
        alerts.push({
          id: `alert_${rule.metric.replace(/\./g, "_")}_${Date.now()}`,
          metric: rule.metric,
          severity: rule.severity,
          message: rule.message,
          currentValue: value,
          threshold: rule.threshold,
          operator: rule.operator,
          timestamp: now,
        });
      }
    }

    return alerts;
  }

  private getMetricValue(snap: Omit<DashboardSnapshot, "alerts" | "timestamp" | "version">, metric: string): number {
    const parts = metric.split(".");
    const [category, ...rest] = parts;

    switch (category) {
      case "amygdala": {
        if (rest[0] === "fatigueLevel") {
          const level = snap.amygdala.fatigueLevel;
          return level === "CRITICAL" ? 2 : level === "ELEVATED" ? 1 : 0;
        }
        return (snap.amygdala as any)[rest[0]] ?? 0;
      }
      case "selfHeal": {
        if (rest[0] === "safetyValveTripped") return snap.selfHeal.safetyValveTripped ? 1 : 0;
        return (snap.selfHeal as any)[rest[0]] ?? 0;
      }
      case "arbitration": {
        return (snap.arbitration as any)[rest[0]] ?? 0;
      }
      case "governance": {
        return (snap.governance as any)[rest[0]] ?? 0;
      }
      case "cognition": {
        return (snap.cognition as any)[rest[0]] ?? 0;
      }
      default:
        return 0;
    }
  }
}

// ── Helpers ──

function safeParseJSON(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
