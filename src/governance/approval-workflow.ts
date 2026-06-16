/**
 * Copyright 2026 熊高锐
 *
 * Licensed under the Apache License, Version 2.0
 */

import { getPrismaClient } from "../data/client.js";
import { logger } from "../telemetry/logger.js";

export type ApprovalStage = "PENDING" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "ESCALATED" | "EXPIRED" | "CANCELLED";
export type ReviewStrategy = "ANY" | "ALL" | "QUORUM";

export interface ApprovalConfig {
  reviewStrategy: ReviewStrategy;
  quorumSize?: number;
  reviewers: string[];
  fallbackReviewer?: string;
  ttlMs: number;
  autoRejectOnTimeout?: boolean;
  webhooks?: string[];
  metadata?: Record<string, unknown>;
}

export interface ApprovalRequest {
  id: string; proposalId: string; stage: ApprovalStage;
  contextHash: string; toolName: string;
  payload: Record<string, unknown> | null;
  config: ApprovalConfig;
  votes: ReviewerVote[];
  assignedTo: string | null;
  expiresAt: Date; resolvedAt: Date | null;
  createdAt: Date; updatedAt: Date;
}

export interface ReviewerVote {
  reviewerId: string;
  decision: "APPROVED" | "REJECTED" | "PENDING";
  comment: string | null; votedAt: Date | null;
}

const DEFAULT_TTL = 5 * 60 * 1000;

import type { PrismaClient } from "@prisma/client";
export class ApprovalWorkflowService {
  private prisma: PrismaClient;
  constructor(prisma?: PrismaClient) { this.prisma = prisma ?? getPrismaClient(); }
  async submitRequest(proposalId: string, config: ApprovalConfig): Promise<ApprovalRequest> {
    const prisma = this.prisma;
    const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } });
    if (!proposal) throw new Error("Proposal not found: " + proposalId);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (config.ttlMs ?? DEFAULT_TTL));
    const assignedTo = config.reviewers[0] ?? null;
    const votes: ReviewerVote[] = config.reviewers.map(rid => ({ reviewerId: rid, decision: "PENDING", comment: null, votedAt: null }));
    const stage = config.reviewers.length > 0 ? "PENDING_REVIEW" : "PENDING";
    const row = await prisma.approvalRequest.create({ data: {
      proposalId, stage, contextHash: proposal.contextHash, toolName: proposal.toolName,
      payload: proposal.payload, configJson: JSON.stringify(config), votesJson: JSON.stringify(votes),
      assignedTo, expiresAt
    }});
    logger.info({ approvalId: row.id, proposalId, stage, reviewerCount: config.reviewers.length }, "approval request created");
    await this.dispatchWebhooks(row.id, "PENDING_REVIEW");
    return toApprovalRequest(row);
  }

  async castVote(approvalId: string, reviewerId: string, decision: "APPROVED" | "REJECTED", comment?: string): Promise<ApprovalRequest> {
    const prisma = this.prisma;
    const row = await prisma.approvalRequest.findUnique({ where: { id: approvalId } });
    if (!row) throw new Error("Approval request not found");
    if (row.stage !== "PENDING_REVIEW") throw new Error("Not in review: " + row.stage);
    const votes: ReviewerVote[] = JSON.parse(row.votesJson);
    const config: ApprovalConfig = JSON.parse(row.configJson);
    const idx = votes.findIndex(v => v.reviewerId === reviewerId);
    if (idx === -1) throw new Error("Reviewer not in list: " + reviewerId);
    if (votes[idx].decision !== "PENDING") throw new Error("Already voted: " + votes[idx].decision);
    votes[idx] = { reviewerId, decision, comment: comment ?? null, votedAt: new Date() };
    const newStage = this.computeStage(votes, config);
    const now = new Date();
    const updateData: any = { votesJson: JSON.stringify(votes), stage: newStage, updatedAt: now };
    if (newStage !== "PENDING_REVIEW") { updateData.resolvedAt = now; updateData.assignedTo = null; }
    else { const next = votes.find(v => v.decision === "PENDING"); updateData.assignedTo = next?.reviewerId ?? null; }
    const updated = await prisma.approvalRequest.update({ where: { id: approvalId }, data: updateData });
    logger.info({ approvalId, reviewerId, decision, newStage }, "vote cast");
    if (newStage !== "PENDING_REVIEW") await this.dispatchWebhooks(approvalId, newStage);
    return toApprovalRequest(updated);
  }

  async escalate(approvalId: string): Promise<ApprovalRequest> {
    const prisma = this.prisma;
    const row = await prisma.approvalRequest.findUnique({ where: { id: approvalId } });
    if (!row) throw new Error("Approval request not found");
    if (row.stage !== "PENDING_REVIEW") throw new Error("Cannot escalate from: " + row.stage);
    const config: ApprovalConfig = JSON.parse(row.configJson);
    if (config.autoRejectOnTimeout) {
      const u = await prisma.approvalRequest.update({ where: { id: approvalId }, data: { stage: "REJECTED", resolvedAt: new Date(), assignedTo: null, updatedAt: new Date() } });
      logger.warn({ approvalId }, "auto-rejected on timeout");
      await this.dispatchWebhooks(approvalId, "REJECTED");
      return toApprovalRequest(u);
    }
    if (config.fallbackReviewer) {
      const votes: ReviewerVote[] = JSON.parse(row.votesJson);
      votes.push({ reviewerId: config.fallbackReviewer, decision: "PENDING", comment: null, votedAt: null });
      const u = await prisma.approvalRequest.update({ where: { id: approvalId }, data: { stage: "PENDING_REVIEW", votesJson: JSON.stringify(votes), assignedTo: config.fallbackReviewer, updatedAt: new Date() } });
      logger.warn({ approvalId, fallback: config.fallbackReviewer }, "escalated to fallback");
      await this.dispatchWebhooks(approvalId, "PENDING_REVIEW");
      return toApprovalRequest(u);
    }
    const u = await prisma.approvalRequest.update({ where: { id: approvalId }, data: { stage: "ESCALATED", resolvedAt: new Date(), assignedTo: null, updatedAt: new Date() } });
    logger.warn({ approvalId }, "escalated — needs manual intervention");
    await this.dispatchWebhooks(approvalId, "ESCALATED");
    return toApprovalRequest(u);
  }

  async processExpired(): Promise<{ escalated: number; expired: number }> {
    const prisma = this.prisma;
    const now = new Date();
    const expired = await prisma.approvalRequest.findMany({ where: { stage: "PENDING_REVIEW", expiresAt: { lt: now } } });
    let escalated = 0, expiredCount = 0;
    for (const row of expired) {
      const config: ApprovalConfig = JSON.parse(row.configJson);
      if (config.fallbackReviewer || config.autoRejectOnTimeout) { await this.escalate(row.id); escalated++; }
      else { await prisma.approvalRequest.update({ where: { id: row.id }, data: { stage: "EXPIRED", resolvedAt: now, assignedTo: null } }); expiredCount++; }
    }
    return { escalated, expired: expiredCount };
  }

  async cancel(approvalId: string): Promise<ApprovalRequest> {
    const prisma = this.prisma;
    const row = await prisma.approvalRequest.findUnique({ where: { id: approvalId } });
    if (!row) throw new Error("Not found");
    if (row.stage === "APPROVED" || row.stage === "REJECTED") throw new Error("Already resolved");
    const u = await prisma.approvalRequest.update({ where: { id: approvalId }, data: { stage: "CANCELLED", resolvedAt: new Date(), assignedTo: null } });
    await this.dispatchWebhooks(approvalId, "CANCELLED");
    return toApprovalRequest(u);
  }

  async getRequest(approvalId: string): Promise<ApprovalRequest | null> {
    const row = await this.prisma.approvalRequest.findUnique({ where: { id: approvalId } });
    return row ? toApprovalRequest(row) : null;
  }

  async listPendingForReviewer(reviewerId: string): Promise<ApprovalRequest[]> {
    const rows = await this.prisma.approvalRequest.findMany({ where: { stage: "PENDING_REVIEW", assignedTo: reviewerId }, orderBy: { createdAt: "desc" } });
    return rows.map(toApprovalRequest);
  }

  async listActive(): Promise<ApprovalRequest[]> {
    const rows = await this.prisma.approvalRequest.findMany({ where: { stage: { in: ["PENDING", "PENDING_REVIEW"] } }, orderBy: { createdAt: "desc" } });
    return rows.map(toApprovalRequest);
  }

  private computeStage(votes: ReviewerVote[], config: ApprovalConfig): ApprovalStage {
    const total = votes.length;
    const approved = votes.filter(v => v.decision === "APPROVED").length;
    const rejected = votes.filter(v => v.decision === "REJECTED").length;
    const pending = votes.filter(v => v.decision === "PENDING").length;
    switch (config.reviewStrategy) {
      case "ANY": if (approved >= 1) return "APPROVED"; if (rejected >= total) return "REJECTED"; return "PENDING_REVIEW";
      case "ALL": if (approved >= total) return "APPROVED"; if (rejected >= 1) return "REJECTED"; return "PENDING_REVIEW";
      case "QUORUM": { const q = config.quorumSize ?? Math.ceil(total / 2); if (approved >= q) return "APPROVED"; if (approved + pending < q) return "REJECTED"; return "PENDING_REVIEW"; }
      default: return "PENDING_REVIEW";
    }
  }

  private async dispatchWebhooks(approvalId: string, stage: ApprovalStage): Promise<void> {
    const row = await this.prisma.approvalRequest.findUnique({ where: { id: approvalId } });
    if (!row) return;
    const config: ApprovalConfig = JSON.parse(row.configJson);
    if (!config.webhooks?.length) return;
    const payload = JSON.stringify({ approvalId, stage, proposalId: row.proposalId, contextHash: row.contextHash, toolName: row.toolName, timestamp: new Date().toISOString() });
    for (const url of config.webhooks) {
      try { await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, signal: AbortSignal.timeout(5000) }); }
      catch { logger.warn({ approvalId, webhook: url }, "webhook dispatch failed"); }
    }
  }
}

function toApprovalRequest(row: any): ApprovalRequest {
  return {
    id: row.id, proposalId: row.proposalId, stage: row.stage,
    contextHash: row.contextHash, toolName: row.toolName,
    payload: row.payload ? JSON.parse(row.payload) : null,
    config: JSON.parse(row.configJson), votes: JSON.parse(row.votesJson),
    assignedTo: row.assignedTo, expiresAt: row.expiresAt, resolvedAt: row.resolvedAt,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

// Singleton removed — use GovernanceCore.workflowService

export function resetApprovalWorkflowService(): void {
  // No-op — use GovernanceCore.workflowService
}


export function getApprovalWorkflowService(): ApprovalWorkflowService {
  return new ApprovalWorkflowService();
}
