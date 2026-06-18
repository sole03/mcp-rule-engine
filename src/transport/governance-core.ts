/**
 * Copyright 2026 熊高锐
 *
 * Licensed under the Apache License, Version 2.0
 */

/**
 * @file Governance Core
 * Pure-function facade over the Rule Governance Platform.
 *
 * Each exit (CLI, HTTP, MCP, CI) creates ONE GovernanceCore with its own
 * PrismaClient and optional overrides. No global state inside the core.
 *
 * Internal modules retain their singletons for backward compatibility;
 * GovernanceCore delegates to them. Future: migrate singletons to DI.
 */

import { disconnectPrisma } from "../data/client.js"
import { getPrismaClient } from "../data/client.js";
import { RuleRepo } from "../data/rule-repo.js";
import { DiffLogRepo } from "../data/diff-log-repo.js";
import { ConflictRepo } from "../data/conflict-repo.js";
import { MetricRepo } from "../data/metric-repo.js";
import { PolicyEngine, getPolicyEngine } from "../governance/policy-engine.js";
import { RuleImmuneEngine } from "../governance/rule-immune.js";
import { ApprovalWorkflowService } from "../governance/approval-workflow.js";
import { VectorStore } from "../adapters/embedding/vector-store.js";
import { EmbeddingService } from "../adapters/embedding/openai-adapter.js";
import { logger } from "../telemetry/logger.js";

import type { RuleSpec, RuleStatus, RuleScope } from "../core/types.js";
import type { ApprovalConfig, ApprovalRequest } from "../governance/approval-workflow.js";
import type { ImmuneCheckResult } from "../governance/rule-immune.js";

// ── Core ──────────────────────────────────────────────────

export class GovernanceCore {
  ruleRepo = new RuleRepo();
  diffLogRepo = new DiffLogRepo();
  metricRepo = new MetricRepo();
  conflictRepo = new ConflictRepo(this.ruleRepo);
  policyEngine = getPolicyEngine();
  immuneEngine = new RuleImmuneEngine();
  workflowService = new ApprovalWorkflowService();
  vectorStore = new VectorStore();

  /**
   * Each exit can pass overrides.
   * E.g., CI mode might inject a fresh PrismaClient, Dashboard might set policies.
   */
  constructor(opts?: {
    policies?: Array<{ id: string; name: string; description: string; severity: string; priority: number; conditions: Array<Record<string, unknown>>; actions: Array<{ type: string }>; status: string }>;
  }) {
    if (opts?.policies) {
      this.policyEngine.loadPolicies(opts.policies as any);
    }
  }

  // ── Rule CRUD ──────────────────────────────────────────

  async createRule(spec: RuleSpec & { projectId?: string }) {
    return this.ruleRepo.create(spec);
  }

  async listRules(filters: { language?: string; scope?: string; status?: string; projectId?: string; limit?: number; offset?: number }) {
    return this.ruleRepo.list(filters as any);
  }

  async getRuleCount() {
    const prisma = getPrismaClient();
    return prisma.rule.count({ where: { status: "active" } });
  }

  // ── Immune ──────────────────────────────────────────────

  async runImmuneCycle(): Promise<ImmuneCheckResult> {
    return this.immuneEngine.runCycle();
  }

  async getImmuneStats() {
    return this.immuneEngine.getStats();
  }

  // ── Workflow ────────────────────────────────────────────

  async submitApproval(proposalId: string, config: ApprovalConfig): Promise<ApprovalRequest> {
    return this.workflowService.submitRequest(proposalId, config);
  }

  async castApprovalVote(approvalId: string, reviewerId: string, decision: "APPROVED" | "REJECTED", comment?: string): Promise<ApprovalRequest> {
    return this.workflowService.castVote(approvalId, reviewerId, decision, comment);
  }

  async listPendingApprovals(reviewerId: string): Promise<ApprovalRequest[]> {
    return this.workflowService.listPendingForReviewer(reviewerId);
  }

  // ── Policy ──────────────────────────────────────────────

  evaluatePolicy(ctx: { toolName: string; filePath?: string; language?: string; contentHash?: string; diffSize?: number; projectId?: string; metadata?: Record<string, unknown> }) {
    return this.policyEngine.evaluate(ctx as any);
  }

  // ── Cognition ───────────────────────────────────────────

  async cognitionStats() {
    const prisma = getPrismaClient();
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    const [nodeCount, edgeCount, embeddedCount] = await Promise.all([
      prisma.cognitionNode.count(),
      prisma.cognitionEdge.count(),
      prisma.cognitionNode.count({ where: { metadata: { contains: "embedding" } } }),
    ]);
    return { nodeCount, edgeCount, embeddedNodes: embeddedCount, timestamp: new Date().toISOString() };
  }

  // ── Proposal ────────────────────────────────────────────

  async getProposalStats() {
    const prisma = getPrismaClient();
    const [active, expired, total] = await Promise.all([
      prisma.proposal.count({ where: { status: "PENDING", expiresAt: { gt: new Date() } } }),
      prisma.proposal.count({ where: { status: "EXPIRED" } }),
      prisma.proposal.count(),
    ]);
    return { active, expired, total };
  }

  // ── Health ──────────────────────────────────────────────

  async health() {
    const stats = await this.getImmuneStats();
    return { status: "ok", version: "1.0.0-alpha.4", uptime: process.uptime(), immuneStats: stats };
  }

  // ── Cleanup ─────────────────────────────────────────────

  async shutdown() {
    await disconnectPrisma();
    logger.info("governance core shutdown");
  }
}
