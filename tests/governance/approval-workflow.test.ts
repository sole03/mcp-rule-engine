/**
 * Copyright 2026 熊高锐
 *
 * Licensed under the Apache License, Version 2.0
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ApprovalWorkflowService, resetApprovalWorkflowService } from "../../src/governance/approval-workflow.js";
import { resetApprovalWorkflowService as resetSvc } from "../../src/governance/approval-workflow.js";
import { getPrismaClient } from "../../src/data/client.js";

process.env.DATABASE_URL = "file:./prisma/dev.db";

beforeEach(async () => {
  resetApprovalWorkflowService();
  const prisma = getPrismaClient();
  await prisma.approvalRequest.deleteMany();
  await prisma.proposal.deleteMany();
});

describe("ApprovalWorkflowService", () => {
  async function seedProposal() {
    const prisma = getPrismaClient();
    return prisma.proposal.create({
      data: {
        contextHash: "test-hash-1",
        toolName: "cognition_query",
        payload: JSON.stringify({ test: true }),
        nodeIds: JSON.stringify(["node-1"]),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
  }

  describe("submitRequest", () => {
    it("creates a PENDING_REVIEW request with reviewers", async () => {
      const proposal = await seedProposal();
      const svc = new ApprovalWorkflowService();

      const req = await svc.submitRequest(proposal.id, {
        reviewStrategy: "ANY",
        reviewers: ["alice", "bob"],
        ttlMs: 300000,
      });

      expect(req.stage).toBe("PENDING_REVIEW");
      expect(req.assignedTo).toBe("alice");
      expect(req.votes).toHaveLength(2);
      expect(req.votes[0].reviewerId).toBe("alice");
      expect(req.votes[0].decision).toBe("PENDING");
    });

    it("throws for missing proposal", async () => {
      const svc = new ApprovalWorkflowService();
      await expect(svc.submitRequest("nonexistent", {
        reviewStrategy: "ANY", reviewers: ["alice"], ttlMs: 300000,
      })).rejects.toThrow("Proposal not found");
    });
  });

  describe("castVote", () => {
    it("ANY strategy: single APPROVE resolves request", async () => {
      const proposal = await seedProposal();
      const svc = new ApprovalWorkflowService();

      const req = await svc.submitRequest(proposal.id, {
        reviewStrategy: "ANY",
        reviewers: ["alice", "bob"],
        ttlMs: 300000,
      });

      const result = await svc.castVote(req.id, "alice", "APPROVED", "LGTM");
      expect(result.stage).toBe("APPROVED");
      expect(result.votes[0].decision).toBe("APPROVED");
      expect(result.resolvedAt).not.toBeNull();
    });

    it("ANY strategy: single REJECT does not resolve until all reject", async () => {
      const proposal = await seedProposal();
      const svc = new ApprovalWorkflowService();

      const req = await svc.submitRequest(proposal.id, {
        reviewStrategy: "ANY",
        reviewers: ["alice", "bob"],
        ttlMs: 300000,
      });

      // Alice rejects — still PENDING_REVIEW because bob hasn't voted
      const result = await svc.castVote(req.id, "alice", "REJECTED", "bad");
      expect(result.stage).toBe("PENDING_REVIEW");
      expect(result.assignedTo).toBe("bob");
    });

    it("ALL strategy: all must approve", async () => {
      const proposal = await seedProposal();
      const svc = new ApprovalWorkflowService();

      const req = await svc.submitRequest(proposal.id, {
        reviewStrategy: "ALL",
        reviewers: ["alice", "bob"],
        ttlMs: 300000,
      });

      // Alice approves
      const r1 = await svc.castVote(req.id, "alice", "APPROVED");
      expect(r1.stage).toBe("PENDING_REVIEW");

      // Bob approves → resolved
      const r2 = await svc.castVote(req.id, "bob", "APPROVED");
      expect(r2.stage).toBe("APPROVED");
    });

    it("ALL strategy: one reject kills it", async () => {
      const proposal = await seedProposal();
      const svc = new ApprovalWorkflowService();

      const req = await svc.submitRequest(proposal.id, {
        reviewStrategy: "ALL",
        reviewers: ["alice", "bob"],
        ttlMs: 300000,
      });

      const result = await svc.castVote(req.id, "alice", "REJECTED");
      expect(result.stage).toBe("REJECTED");
    });

    it("QUORUM strategy: resolves when quorum met", async () => {
      const proposal = await seedProposal();
      const svc = new ApprovalWorkflowService();

      const req = await svc.submitRequest(proposal.id, {
        reviewStrategy: "QUORUM",
        quorumSize: 2,
        reviewers: ["alice", "bob", "charlie"],
        ttlMs: 300000,
      });

      const r1 = await svc.castVote(req.id, "alice", "APPROVED");
      expect(r1.stage).toBe("PENDING_REVIEW");
      const r2 = await svc.castVote(req.id, "bob", "APPROVED");
      expect(r2.stage).toBe("APPROVED");
    });

    it("QUORUM: reject if quorum unreachable", async () => {
      const proposal = await seedProposal();
      const svc = new ApprovalWorkflowService();

      const req = await svc.submitRequest(proposal.id, {
        reviewStrategy: "QUORUM",
        quorumSize: 3,
        reviewers: ["alice", "bob", "charlie"],
        ttlMs: 300000,
      });

      // Alice rejects → remaining 2 can't reach quorum of 3
      const result = await svc.castVote(req.id, "alice", "REJECTED");
      expect(result.stage).toBe("REJECTED");
    });

    it("prevents double voting", async () => {
      const proposal = await seedProposal();
      const svc = new ApprovalWorkflowService();

      const req = await svc.submitRequest(proposal.id, {
        reviewStrategy: "ALL", reviewers: ["alice", "bob"], ttlMs: 300000,
      });
      // Alice votes but bob hasn't — still PENDING_REVIEW
      await svc.castVote(req.id, "alice", "APPROVED");

      await expect(svc.castVote(req.id, "alice", "REJECTED"))
        .rejects.toThrow("Already voted");
    });
  });

  describe("escalate", () => {
    it("auto-rejects when autoRejectOnTimeout is set", async () => {
      const proposal = await seedProposal();
      const svc = new ApprovalWorkflowService();

      const req = await svc.submitRequest(proposal.id, {
        reviewStrategy: "ALL",
        reviewers: ["alice"],
        ttlMs: 300000,
        autoRejectOnTimeout: true,
      });

      const result = await svc.escalate(req.id);
      expect(result.stage).toBe("REJECTED");
    });

    it("escalates to fallback reviewer", async () => {
      const proposal = await seedProposal();
      const svc = new ApprovalWorkflowService();

      const req = await svc.submitRequest(proposal.id, {
        reviewStrategy: "ALL",
        reviewers: ["alice"],
        ttlMs: 300000,
        fallbackReviewer: "admin",
      });

      const result = await svc.escalate(req.id);
      expect(result.stage).toBe("PENDING_REVIEW");
      expect(result.assignedTo).toBe("admin");
      expect(result.votes).toHaveLength(2);
    });

    it("marks ESCALATED when no fallback and no auto-reject", async () => {
      const proposal = await seedProposal();
      const svc = new ApprovalWorkflowService();

      const req = await svc.submitRequest(proposal.id, {
        reviewStrategy: "ALL",
        reviewers: ["alice"],
        ttlMs: 300000,
      });

      const result = await svc.escalate(req.id);
      expect(result.stage).toBe("ESCALATED");
    });
  });

  describe("listPendingForReviewer", () => {
    it("returns pending requests for reviewer", async () => {
      const proposal = await seedProposal();
      const svc = new ApprovalWorkflowService();

      await svc.submitRequest(proposal.id, {
        reviewStrategy: "ANY", reviewers: ["alice", "bob"], ttlMs: 300000,
      });

      const pending = await svc.listPendingForReviewer("alice");
      expect(pending).toHaveLength(1);
    });

    it("moves assignment after vote", async () => {
      const proposal = await seedProposal();
      const svc = new ApprovalWorkflowService();

      const req = await svc.submitRequest(proposal.id, {
        reviewStrategy: "ALL", reviewers: ["alice", "bob"], ttlMs: 300000,
      });

      await svc.castVote(req.id, "alice", "APPROVED");

      // Alice should be done, bob should have it now
      const aPending = await svc.listPendingForReviewer("alice");
      expect(aPending).toHaveLength(0);
      const bPending = await svc.listPendingForReviewer("bob");
      expect(bPending).toHaveLength(1);
    });
  });

  describe("cancel", () => {
    it("cancels a pending review", async () => {
      const proposal = await seedProposal();
      const svc = new ApprovalWorkflowService();

      const req = await svc.submitRequest(proposal.id, {
        reviewStrategy: "ANY", reviewers: ["alice"], ttlMs: 300000,
      });

      const result = await svc.cancel(req.id);
      expect(result.stage).toBe("CANCELLED");
    });

    it("prevents cancelling resolved request", async () => {
      const proposal = await seedProposal();
      const svc = new ApprovalWorkflowService();

      const req = await svc.submitRequest(proposal.id, {
        reviewStrategy: "ANY", reviewers: ["alice"], ttlMs: 300000,
      });
      await svc.castVote(req.id, "alice", "APPROVED");

      await expect(svc.cancel(req.id)).rejects.toThrow("Already resolved");
    });
  });
});
