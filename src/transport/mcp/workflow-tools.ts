/**
 * Copyright 2026 熊高锐
 *
 * Licensed under the Apache License, Version 2.0
 */

import type { ApprovalConfig } from "../../governance/approval-workflow.js"
import { getApprovalWorkflowService } from "../../governance/approval-workflow.js";

export async function handleWorkflowSubmit(input: {
  proposalId: string;
  config: ApprovalConfig;
}): Promise<{ content: { type: string; text: string }[] }> {
  try {
    if (!input.proposalId) return err(-32602, "proposalId is required");
    if (!input.config?.reviewers?.length && !input.config?.fallbackReviewer) {
      return err(-32602, "config.reviewers or config.fallbackReviewer is required");
    }
    const svc = getApprovalWorkflowService();
    const request = await svc.submitRequest(input.proposalId, input.config);
    return ok({ approvalId: request.id, stage: request.stage, assignedTo: request.assignedTo, expiresAt: request.expiresAt, votes: request.votes });
  } catch (e) { return err(-32603, String(e)); }
}

export async function handleWorkflowVote(input: {
  approvalId: string;
  reviewerId: string;
  decision: "APPROVED" | "REJECTED";
  comment?: string;
}): Promise<{ content: { type: string; text: string }[] }> {
  try {
    if (!input.approvalId || !input.reviewerId || !input.decision) return err(-32602, "approvalId, reviewerId, decision required");
    const svc = getApprovalWorkflowService();
    const request = await svc.castVote(input.approvalId, input.reviewerId, input.decision, input.comment);
    return ok({ approvalId: request.id, stage: request.stage, votes: request.votes, resolvedAt: request.resolvedAt });
  } catch (e) { return err(-32603, String(e)); }
}

export async function handleWorkflowStatus(input: {
  approvalId?: string;
  reviewerId?: string;
}): Promise<{ content: { type: string; text: string }[] }> {
  try {
    const svc = getApprovalWorkflowService();
    if (input.approvalId) {
      const req = await svc.getRequest(input.approvalId);
      if (!req) return err(-32602, "Not found: " + input.approvalId);
      return ok(req);
    }
    if (input.reviewerId) { const p = await svc.listPendingForReviewer(input.reviewerId); return ok({ pending: p, count: p.length }); }
    const active = await svc.listActive(); return ok({ active, count: active.length });
  } catch (e) { return err(-32603, String(e)); }
}

export async function handleWorkflowEscalate(input: {
  approvalId: string;
}): Promise<{ content: { type: string; text: string }[] }> {
  try {
    if (!input.approvalId) return err(-32602, "approvalId required");
    const svc = getApprovalWorkflowService();
    const req = await svc.escalate(input.approvalId);
    return ok({ approvalId: req.id, stage: req.stage, assignedTo: req.assignedTo });
  } catch (e) { return err(-32603, String(e)); }
}

function ok(data: unknown) { return { content: [{ type: "text" as const, text: JSON.stringify(data) }] }; }
function err(code: number, message: string) { return { content: [{ type: "text" as const, text: JSON.stringify({ error: message, code, retryable: code === -32603 }) }] }; }
