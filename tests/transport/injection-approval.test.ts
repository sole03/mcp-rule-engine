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
 * @file Injection Approval Tests (P0 — #4)
 * Covers: createProposal, handleApproveInjection, expireProposals, getProposalStats.
 * Target: 12+ test cases covering full proposal lifecycle.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createProposal,
  handleApproveInjection,
  expireProposals,
  getProposalStats,
  findProposalById,
} from "../../src/transport/mcp/injection-approval.js";
import { getPrismaClient } from "../../src/data/client.js";

const TEST_HASH_PREFIX = "test-inj-" + Date.now();

describe("Injection Approval — Proposal Lifecycle", () => {
  afterAll(async () => {
    // Clean up test proposals
    const prisma = getPrismaClient();
    await prisma.proposal.deleteMany({
      where: { contextHash: { startsWith: TEST_HASH_PREFIX } },
    });
  });

  // ── createProposal ──────────────────────────────────

  it("creates a new PENDING proposal with all fields", async () => {
    const p = await createProposal(TEST_HASH_PREFIX + "-create", "test-tool", ["node-a", "node-b"], { key: "value" });
    expect(p.id).toBeDefined();
    expect(p.status).toBe("PENDING");
    expect(p.contextHash).toBe(TEST_HASH_PREFIX + "-create");
    expect(p.toolName).toBe("test-tool");
    expect(p.nodeIds).toEqual(["node-a", "node-b"]);
    expect(p.payload).toEqual({ key: "value" });
    expect(new Date(p.expiresAt).getTime()).toBeGreaterThan(new Date(p.createdAt).getTime());
    expect(new Date(p.expiresAt).getTime()).toBeLessThan(Date.now() + 6 * 60 * 1000);
  });

  it("duplicate contextHash returns existing PENDING proposal", async () => {
    const p1 = await createProposal(TEST_HASH_PREFIX + "-dup", "tool-a", ["n1"]);
    const p2 = await createProposal(TEST_HASH_PREFIX + "-dup", "tool-b", ["n2"]);
    expect(p2.id).toBe(p1.id);
    expect(p2.status).toBe("PENDING");
    expect(p2.nodeIds).toEqual(["n1"]); // original, not overwritten
  });

  it("creates a new proposal when previous one is rejected", async () => {
    const p1 = await createProposal(TEST_HASH_PREFIX + "-rej-new", "t1", ["n1"]);
    // Manually reject via DB
    const prisma = getPrismaClient();
    await prisma.proposal.update({ where: { id: p1.id }, data: { status: "REJECTED" } });

    const p2 = await createProposal(TEST_HASH_PREFIX + "-rej-new", "t2", ["n2"]);
    expect(p2.id).not.toBe(p1.id);
    expect(p2.status).toBe("PENDING");
  });

  // ── handleApproveInjection ───────────────────────────

  it("APPROVE transitions PENDING → APPROVED", async () => {
    const p = await createProposal(TEST_HASH_PREFIX + "-appr", "t", ["n"]);
    const result = await handleApproveInjection({ proposalId: p.id, decision: "APPROVE" });
    const data = JSON.parse(result.content[0].text);
    expect(data.status).toBe("APPROVED");
    expect(data.proposalId).toBe(p.id);

    const stored = await findProposalById(p.id);
    expect(stored?.status).toBe("APPROVED");
  });

  it("REJECT transitions PENDING → REJECTED", async () => {
    const p = await createProposal(TEST_HASH_PREFIX + "-rej", "t", ["n"]);
    const result = await handleApproveInjection({ proposalId: p.id, decision: "REJECT" });
    const data = JSON.parse(result.content[0].text);
    expect(data.status).toBe("REJECTED");

    const stored = await findProposalById(p.id);
    expect(stored?.status).toBe("REJECTED");
  });

  it("OVERRIDE transitions PENDING → OVERRIDDEN", async () => {
    const p = await createProposal(TEST_HASH_PREFIX + "-over", "t", ["n"]);
    const result = await handleApproveInjection({ proposalId: p.id, decision: "OVERRIDE" });
    const data = JSON.parse(result.content[0].text);
    expect(data.status).toBe("OVERRIDDEN");
  });

  it("returns error for missing proposalId", async () => {
    const result = await handleApproveInjection({} as any);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain("required");
    expect(data.code).toBe(-32602);
    expect(data.retryable).toBe(false);
  });

  it("returns error for unknown proposalId", async () => {
    const result = await handleApproveInjection({ proposalId: "nonexistent-id", decision: "APPROVE" });
    const data = JSON.parse(result.content[0].text);
    expect(data.code).toBe(-32602);
    expect(data.retryable).toBe(false);
  });

  it("returns error for already-decided proposal", async () => {
    const p = await createProposal(TEST_HASH_PREFIX + "-decided", "t", ["n"]);
    await handleApproveInjection({ proposalId: p.id, decision: "APPROVE" });
    const result = await handleApproveInjection({ proposalId: p.id, decision: "APPROVE" });
    const data = JSON.parse(result.content[0].text);
    expect(data.code).toBe(-32602);
    expect(data.retryable).toBe(false);
    expect(data.error).toContain("already");
  });

  it("expired proposal returns retryable error", async () => {
    const p = await createProposal(TEST_HASH_PREFIX + "-exp", "t", ["n"]);
    const prisma = getPrismaClient();
    await prisma.proposal.update({
      where: { id: p.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const result = await handleApproveInjection({ proposalId: p.id, decision: "REJECT" });
    const data = JSON.parse(result.content[0].text);
    expect(data.code).toBe(-32602);
    expect(data.retryable).toBe(true);
  });

  // ── expireProposals ──────────────────────────────────

  it("expireProposals marks all expired PENDING proposals", async () => {
    const p1 = await createProposal(TEST_HASH_PREFIX + "-bmexp-1", "t", ["n"]);
    const p2 = await createProposal(TEST_HASH_PREFIX + "-bmexp-2", "t", ["n"]);

    const prisma = getPrismaClient();
    await prisma.proposal.updateMany({
      where: { id: { in: [p1.id, p2.id] } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const count = await expireProposals();
    expect(count).toBeGreaterThanOrEqual(2);

    const s1 = await findProposalById(p1.id);
    const s2 = await findProposalById(p2.id);
    expect(s1?.status).toBe("EXPIRED");
    expect(s2?.status).toBe("EXPIRED");
  });

  // ── getProposalStats ─────────────────────────────────

  it("getProposalStats returns valid counts", async () => {
    // Create one active + one expired
    const active = await createProposal(TEST_HASH_PREFIX + "-stats", "t", ["n"]);
    const prisma = getPrismaClient();
    const expired = await createProposal(TEST_HASH_PREFIX + "-stats-exp", "t", ["n"]);
    await prisma.proposal.update({
      where: { id: expired.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expireProposals();

    const stats = await getProposalStats();
    expect(typeof stats.active).toBe("number");
    expect(typeof stats.expired).toBe("number");
    expect(typeof stats.total).toBe("number");
    expect(stats.total).toBeGreaterThanOrEqual(2);
    expect(stats.expired).toBeGreaterThanOrEqual(1);
    expect(stats.active).toBeGreaterThanOrEqual(1);
  });
});
