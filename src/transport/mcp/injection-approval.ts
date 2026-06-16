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
 * @file Injection Approval Tool
 * Manages proposal-based approval workflow with TTL, persisted to SQLite.
 * Proposal lifecycle: CREATE → APPROVED | REJECTED | OVERRIDDEN | EXPIRED.
 */

import { getPrismaClient } from "../../data/client.js";

const TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface ProposalData {
  id: string;
  status: string;
  contextHash: string;
  toolName: string;
  payload: Record<string, unknown> | null;
  nodeIds: string[];
  proposedBy: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

function toProposal(row: any): ProposalData {
  return {
    id: row.id,
    status: row.status,
    contextHash: row.contextHash,
    toolName: row.toolName,
    payload: row.payload ? JSON.parse(row.payload) : null,
    nodeIds: row.nodeIds ? JSON.parse(row.nodeIds) : [],
    proposedBy: row.proposedBy ?? null,
    reviewedBy: row.reviewedBy ?? null,
    reviewNote: row.reviewNote ?? null,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Create a new proposal. If a PENDING proposal with the same contextHash already
 * exists and hasn't expired, returns the existing one (conflict-safe).
 */
export async function createProposal(
  contextHash: string,
  toolName: string,
  nodeIds: string[] = [],
  payload?: Record<string, unknown>,
): Promise<ProposalData> {
  const prisma = getPrismaClient();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_MS);

  // Conflict check: only first PENDING per contextHash is valid
  const existing = await prisma.proposal.findFirst({
    where: { contextHash, status: "PENDING", expiresAt: { gt: now } },
  });
  if (existing) return toProposal(existing);

  const row = await prisma.proposal.create({
    data: {
      contextHash,
      toolName,
      payload: payload ? JSON.stringify(payload) : "{}",
      nodeIds: JSON.stringify(nodeIds),
      expiresAt,
    },
  });
  await recordAuditLog("proposal_created", { proposalId: row.id, contextHash, toolName });
  return toProposal(row);
}

/**
 * Handle cognition_approve_injection MCP Tool call.
 * Approves, rejects, or overrides a PENDING proposal.
 */
export async function handleApproveInjection(input: {
  proposalId: string;
  decision: "APPROVE" | "REJECT" | "OVERRIDE";
}): Promise<{ content: { type: string; text: string }[] }> {
  try {
    if (!input.proposalId || !input.decision) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: "proposalId and decision are required", code: -32602, retryable: false }),
        }],
      };
    }

    const prisma = getPrismaClient();
    const row = await prisma.proposal.findUnique({ where: { id: input.proposalId } });
    if (!row) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: "Proposal not found: " + input.proposalId, code: -32602, retryable: false }),
        }],
      };
    }

    // Expired check
    if (new Date() > row.expiresAt) {
      await prisma.proposal.update({ where: { id: input.proposalId }, data: { status: "EXPIRED" } });
      await recordAuditLog("proposal_expired", { proposalId: input.proposalId });
      return { content: [{ type: "text", text: JSON.stringify({ error: "Proposal Expired", code: -32602, retryable: true }) }] };
    }

    // Status check — only PENDING can be acted on
    if (row.status !== "PENDING") {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: "Proposal already " + row.status, code: -32602, retryable: false }),
        }],
      };
    }

    // Race condition guard: optimistic concurrency via status check in update
    const targetStatus = input.decision === "APPROVE" ? "APPROVED"
      : input.decision === "REJECT" ? "REJECTED"
      : "OVERRIDDEN";

    const updated = await prisma.proposal.updateMany({
      where: { id: input.proposalId, status: "PENDING" },
      data: { status: targetStatus },
    });
    if (updated.count === 0) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: "Proposal already decided by concurrent request", code: -32602, retryable: false }),
        }],
      };
    }

    await recordAuditLog("proposal_" + targetStatus.toLowerCase(), {
      proposalId: input.proposalId,
      decision: input.decision,
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ proposalId: input.proposalId, status: targetStatus, expiresAt: row.expiresAt }),
      }],
    };
  } catch (err) {
    const msg = String(err);
    const friendly = msg.includes("does not exist")
      ? "Database schema out of sync — run prisma db push"
      : msg.includes("locked") || msg.includes("busy")
      ? "Database temporarily unavailable"
      : "Internal error: " + msg.slice(0, 200);
    return {
      content: [{ type: "text", text: JSON.stringify({ error: friendly, code: -32603, retryable: true }) }],
    };
  }
}

/**
 * Automatically mark expired proposals as EXPIRED.
 * Called periodically or on-demand. Returns count of expired proposals.
 */
export async function expireProposals(): Promise<number> {
  const prisma = getPrismaClient();
  const result = await prisma.proposal.updateMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
  return result.count;
}

/** Get proposal stats. */
export async function getProposalStats(): Promise<{ active: number; expired: number; total: number }> {
  const prisma = getPrismaClient();
  const [active, expired, total] = await Promise.all([
    prisma.proposal.count({ where: { status: "PENDING", expiresAt: { gt: new Date() } } }),
    prisma.proposal.count({ where: { status: "EXPIRED" } }),
    prisma.proposal.count(),
  ]);
  return { active, expired, total };
}

/** Find a proposal by ID. */
export async function findProposalById(id: string): Promise<ProposalData | null> {
  const prisma = getPrismaClient();
  const row = await prisma.proposal.findUnique({ where: { id } });
  return row ? toProposal(row) : null;
}

/**
 * Record audit event to MetricEvent (async, non-blocking).
 * Falls back to silent when DB is unavailable.
 */
async function recordAuditLog(eventType: string, props: Record<string, unknown>): Promise<void> {
  try {
    const prisma = getPrismaClient();
    await prisma.metricEvent.create({
      data: {
        eventType,
        properties: JSON.stringify({ ...props, timestamp: new Date().toISOString() }),
      },
    });
  } catch {
    // Silently ignore — audit logging is best-effort
  }
}
