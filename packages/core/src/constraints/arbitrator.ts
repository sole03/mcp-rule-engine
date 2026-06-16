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
 * @file ConstraintArbitrator — 多 Agent 约束仲裁器
 *
 * Phase 3 升级版：从纯文本冲突检测升级为：
 *   1. 确定性约束求解（编译所有契约 → 评估两个提案）
 *   2. 自动裁决（A_VALID / B_VALID → 无需人工）
 *   3. Blame 追踪（完整仲裁历史链）
 *   4. 申诉抗辩协议（Agent 可对裁决提出异议）
 *
 * 与现有 arbitrator.ts 保持向后兼容：保留 detectConflict / applyResolution，
 * 新增 arbitrateWithConstraints / raiseAppeal。
 */

import { compileConstraints } from "./dsl-compiler.js";
import type { ParsedConstraint } from "./dsl-compiler.js";
import { evaluateContracts, judgeProposals } from "./runtime.js";
import type { ConstraintVerdict } from "./runtime.js";
import { ALL_TEMPLATES } from "./templates/index.js";

// ── 冲突类型（与现有 arbitrator.ts 对齐）──

export interface ConflictCheck {
  requiresHumanReview?: boolean;
  hasConflict: boolean;
  reason?: string;
  scopeKey?: string;
}

export type ConflictResolution = "keep_a" | "keep_b" | "merge" | "skip";

export interface RuleSnapshot {
  id: string;
  type: string;
  language: string;
  pattern: string;
  suggestion: string;
  scope: string;
  tags: string[];
  createdBy?: string;
  createdAt?: string;
}

// ── Blame 追踪 ──

export interface BlameRecord {
  ruleId: string;
  createdBy: string;
  createdAt: Date;
  lastModifiedBy: string;
  lastModifiedAt: Date;
  arbitrationHistory: ArbitrationEvent[];
}

export interface ArbitrationEvent {
  conflictId: string;
  timestamp: Date;
  verdict: string;
  agentA: string;
  agentB: string;
  reviewedBy?: string;
  reviewedAt?: Date;
  appeal?: AppealRecord;
}

// ── 申诉协议 ──

export interface AppealRecord {
  appealId: string;
  conflictId: string;
  raisedBy: string;
  reason: "AST_FALSE_POSITIVE" | "CONTRACT_MISJUDGED" | "SEMANTIC_EQUIVALENT";
  evidence: AppealEvidence;
  proposedResolution: "KEEP_A" | "KEEP_B" | "MERGE" | "NEW";
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  reviewedBy?: string;
  reviewedAt?: Date;
  resolutionNote?: string;
}

export interface AppealEvidence {
  counterCode?: string;
  counterConstraint?: string;
  equivalentPattern?: string;
}

// ── 约束仲裁器 ──

export class ConstraintArbitrator {
  // ── Static: Human veto protocol (Phase 3.2) ──
  static pausedUntil: number = 0; // timestamp ms
  static pause(minutes: number): void { this.pausedUntil = Date.now() + minutes * 60_000; }
  static resume(): void { this.pausedUntil = 0; }
  static isPaused(): boolean { return Date.now() < this.pausedUntil; }

  private contracts: ParsedConstraint[];
  private blameLog: Map<string, BlameRecord> = new Map();
  private appealLog: Map<string, AppealRecord> = new Map();

  constructor(contracts?: ParsedConstraint[]) {
    // 默认加载所有内置模板
    if (contracts && contracts.length > 0) {
      this.contracts = contracts;
    } else {
      // 编译内置模板
      this.contracts = [];
      for (const tpl of ALL_TEMPLATES) {
        const parsed = compileConstraints(tpl);
        this.contracts.push(...parsed);
      }
    }
  }

  // ── 向后兼容：detectConflict (保留原逻辑) ──

  detectConflict(ruleA: RuleSnapshot, ruleB: RuleSnapshot): ConflictCheck {
    if (ruleA.type !== ruleB.type) return { hasConflict: false, requiresHumanReview: false };
    if (ruleA.language !== ruleB.language) return { hasConflict: false, requiresHumanReview: false };
    if (ruleA.pattern !== ruleB.pattern) return { hasConflict: false, requiresHumanReview: false };
    if (ruleA.suggestion === ruleB.suggestion) return { hasConflict: false, requiresHumanReview: false };
    return {
      hasConflict: true,
      reason: `same scope with different suggestions: "${ruleA.suggestion}" vs "${ruleB.suggestion}"`,
      scopeKey: `${ruleA.scope}:${ruleB.scope}:${ruleA.type}:${ruleA.language}:${ruleA.pattern}`,
    };
  }

  // ── 向后兼容：applyResolution ──

  applyResolution(
    ruleA: RuleSnapshot,
    ruleB: RuleSnapshot,
    resolution: ConflictResolution,
  ): RuleSnapshot | undefined {
    if (resolution === "keep_a") {
      return {
        ...ruleA,
        tags: Array.from(new Set([...ruleA.tags, ...ruleB.tags])),
      };
    }
    if (resolution === "keep_b") {
      return {
        ...ruleB,
        tags: Array.from(new Set([...ruleA.tags, ...ruleB.tags])),
      };
    }
    if (resolution === "merge") {
      return {
        id: `merged_${ruleA.id}_${ruleB.id}`,
        type: "convention",
        language: ruleA.language,
        pattern: ruleA.pattern,
        suggestion: `${ruleA.suggestion}\n// Alternative: ${ruleB.suggestion}`,
        scope: ruleA.scope,
        tags: Array.from(new Set([...ruleA.tags, ...ruleB.tags])),
      };
    }
    return undefined;
  }

  // ── Phase 3 核心：约束仲裁 ──

  /**
   * 用约束求解判定两个规则的冲突。
   *
   * 流程：
   *   1. detectConflict 初筛
   *   2. 若无冲突 → 直接返回
   *   3. judgeProposals 约束仲裁
   *   4. 记录 Blame 事件
   */
  arbitrateWithConstraints(
    ruleA: RuleSnapshot,
    ruleB: RuleSnapshot,
    agentAId: string = "agent-a",
    agentBId: string = "agent-b",
  ): {
    hasConflict: boolean;
    conflictId?: string;
    verdict?: ConstraintVerdict["result"];
    verdictReason?: string;
    requiresHumanReview: boolean;
    suggestion?: string;
  } {
    const conflict = this.detectConflict(ruleA, ruleB);
    if (!conflict.hasConflict) {
      return { hasConflict: false, requiresHumanReview: false };
    }

    const conflictId = `conflict_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 从规则描述构建提案文本（包含 pattern + suggestion + tags）
    const proposalA = buildProposalText(ruleA);
    const proposalB = buildProposalText(ruleB);

    // 约束求解判定
    const verdict = judgeProposals(proposalA, proposalB, this.contracts);

    // 记录 Blame
    const arbitrationEvent: ArbitrationEvent = {
      conflictId,
      timestamp: new Date(),
      verdict: verdict.result,
      agentA: agentAId,
      agentB: agentBId,
    };

    this.recordBlame(ruleA, arbitrationEvent);
    this.recordBlame(ruleB, arbitrationEvent);

    const requiresHumanReview =
      verdict.result === "BOTH_VALID" || verdict.result === "UNDECIDABLE";

    return {
      hasConflict: true,
      conflictId,
      verdict: verdict.result,
      verdictReason: verdict.reason,
      requiresHumanReview,
      suggestion: verdict.result === "A_VALID"
        ? ruleA.suggestion
        : verdict.result === "B_VALID"
          ? ruleB.suggestion
          : undefined,
    };
  }

  /**
   * 添加自定义约束（扩展契约库）。
   */
  addContract(dslSource: string): ParsedConstraint[] {
    const parsed = compileConstraints(dslSource);
    this.contracts.push(...parsed);
    return parsed;
  }

  /**
   * 重新加载全部约束（替换运行时）。
   */
  reloadContracts(contracts: ParsedConstraint[]): void {
    this.contracts = contracts;
  }

  /**
   * 获取当前所有激活的约束。
   */
  getActiveContracts(): ParsedConstraint[] {
    return [...this.contracts];
  }

  // ── 申诉协议 ──

  /**
   * Agent 对裁决提出申诉。
   */
  raiseAppeal(
    appeal: Omit<AppealRecord, "appealId" | "status" | "reviewedBy" | "reviewedAt" | "resolutionNote">,
  ): AppealRecord {
    const record: AppealRecord = {
      appealId: `appeal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ...appeal,
      status: "PENDING",
    };

    this.appealLog.set(record.appealId, record);

    // 更新关联的 Blame 记录
    const blameEntry = this.findBlameByConflict(record.conflictId);
    if (blameEntry) {
      const latestEvent = blameEntry.arbitrationHistory[blameEntry.arbitrationHistory.length - 1];
      if (latestEvent) {
        latestEvent.appeal = record;
      }
    }

    return record;
  }

  /**
   * 人类审查 → 接受或驳回申诉。
   */
  resolveAppeal(
    appealId: string,
    status: "ACCEPTED" | "REJECTED",
    reviewer: string,
    note?: string,
  ): AppealRecord | null {
    const record = this.appealLog.get(appealId);
    if (!record) return null;

    record.status = status;
    record.reviewedBy = reviewer;
    record.reviewedAt = new Date();
    if (note) record.resolutionNote = note;

    this.appealLog.set(appealId, record);
    return record;
  }

  /**
   * 获取所有待处理申诉。
   */
  getPendingAppeals(): AppealRecord[] {
    return Array.from(this.appealLog.values()).filter(a => a.status === "PENDING");
  }

  /**
   * 获取指定冲突的所有申诉历史。
   */
  getAppealHistory(conflictId: string): AppealRecord[] {
    return Array.from(this.appealLog.values()).filter(a => a.conflictId === conflictId);
  }

  // ── Blame 追踪 ──

  /**
   * 获取规则的完整仲裁历史。
   */
  getBlameChain(ruleId: string): BlameRecord | null {
    return this.blameLog.get(ruleId) ?? null;
  }

  /**
   * 获取所有有争议的规则。
   */
  getDisputedRules(): BlameRecord[] {
    return Array.from(this.blameLog.values()).filter(
      b => b.arbitrationHistory.length > 0,
    );
  }

  // ── 统计 ──

  /**
   * 仲裁统计（供 Phase 4 仪表盘使用）。
   */
  getStats(): {
    totalConflicts: number;
    autoResolved: number;
    manualRequired: number;
    appealCount: number;
    appealAcceptRate: number;
    contractsLoaded: number;
  } {
    const events = Array.from(this.blameLog.values()).flatMap(b => b.arbitrationHistory);
    const totalConflicts = new Set(events.map(e => e.conflictId)).size;

    const autoResolved = events.filter(
      e => e.verdict === "A_VALID" || e.verdict === "B_VALID",
    ).length;

    const manualRequired = events.filter(
      e => e.verdict === "BOTH_VALID" || e.verdict === "UNDECIDABLE",
    ).length;

    const appeals = Array.from(this.appealLog.values());
    const accepted = appeals.filter(a => a.status === "ACCEPTED").length;

    return {
      totalConflicts,
      autoResolved,
      manualRequired,
      appealCount: appeals.length,
      appealAcceptRate: appeals.length > 0 ? accepted / appeals.length : 0,
      contractsLoaded: this.contracts.length,
    };
  }

  /**
   * 重置所有内部状态（测试用）。
   */
  reset(): void {
    this.blameLog.clear();
    this.appealLog.clear();
  }

  // ── Private ──

  private recordBlame(rule: RuleSnapshot, event: ArbitrationEvent): void {
    const existing = this.blameLog.get(rule.id);
    if (existing) {
      existing.arbitrationHistory.push(event);
      existing.lastModifiedBy = event.agentA; // 最后修改方
      existing.lastModifiedAt = event.timestamp;
    } else {
      this.blameLog.set(rule.id, {
        ruleId: rule.id,
        createdBy: rule.createdBy ?? "unknown",
        createdAt: rule.createdAt ? new Date(rule.createdAt) : new Date(),
        lastModifiedBy: event.agentA,
        lastModifiedAt: event.timestamp,
        arbitrationHistory: [event],
      });
    }
  }

  private findBlameByConflict(conflictId: string): BlameRecord | null {
    for (const record of Array.from(this.blameLog.values())) {
      if (record.arbitrationHistory.some(e => e.conflictId === conflictId)) {
        return record;
      }
    }
    return null;
  }
}

// ── 辅助函数 ──

function buildProposalText(rule: RuleSnapshot): string {
  const parts: string[] = [];
  parts.push(`// Rule: ${rule.id}`);
  parts.push(`// Type: ${rule.type}, Language: ${rule.language}`);
  parts.push(`// Pattern: ${rule.pattern}`);
  parts.push(`${rule.suggestion}`);
  if (rule.tags.length > 0) {
    parts.push(`// Tags: ${rule.tags.join(", ")}`);
  }
  return parts.join("\n");
}
