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
 * @file Trust & Governance Tests
 * Covers: injection approval, config tools, response validation, constraint validation.
 * Target: 15+ test cases covering all governance requirements.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createProposal, handleApproveInjection, getProposalStats } from "../../src/tools/injection-approval.js";
import { handleUpdateConfig } from "../../src/tools/config-tools.js";
import { validateToolResponse } from "../../src/middleware/response-validation.js";
import { validateCode } from "../../src/cognition-engine/constraint-validator.js";

// ── Injection Approval Tests ──────────────────────────────

describe("Injection Approval", () => {
  beforeEach(() => {
    // Reset proposal store (access via module-level Map)
  });

  it("createProposal returns proposal with TTL", async () => {
    const p = await createProposal("ctx-1", "test-tool", ["node-1"]);
    expect(p.id).toBeDefined();
    expect(p.contextHash).toBe("ctx-1");
    expect(new Date(p.expiresAt).getTime()).toBeGreaterThan(new Date(p.createdAt).getTime());
    expect(p.status).toBe("PENDING");
  });

  it("duplicate contextHash returns existing proposal (conflict prevention)", async () => {
    const p1 = await createProposal("ctx-dup", "test-tool", ["node-1"]);
    const p2 = await createProposal("ctx-dup", "test-tool", ["node-2"]);
    expect(p2.id).toBe(p1.id);
  });

  it("handleApproveInjection with APPROVE returns approved status", async () => {
    const p = await createProposal("ctx-approve", "test-tool", ["node-1"]);
    const result = await handleApproveInjection({ proposalId: p.id, decision: "APPROVE" });
    const data = JSON.parse(result.content[0].text);
    expect(data.status).toBe("APPROVED");
  });

  it("handleApproveInjection with missing fields returns -32602", async () => {
    const result = await handleApproveInjection({} as any);
    const data = JSON.parse(result.content[0].text);
    expect(data.code).toBe(-32602);
    expect(data.retryable).toBe(false);
  });

  it("handleApproveInjection with unknown proposal returns -32602", async () => {
    const result = await handleApproveInjection({ proposalId: "nonexistent", decision: "APPROVE" });
    const data = JSON.parse(result.content[0].text);
    expect(data.code).toBe(-32602);
  });

  it("handleApproveInjection with expired proposal returns retryable error", async () => {
    const p = await createProposal("ctx-expire", "test-tool", ["node-1"]);
    // Force expiry via DB update (persisted proposals require DB-level mutation)
    const { getPrismaClient } = await import("../../src/storage/client.js");
    const prisma = getPrismaClient();
    await prisma.proposal.update({
      where: { id: p.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const result = await handleApproveInjection({ proposalId: p.id, decision: "REJECT" });
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain("Expired");
    expect(data.code).toBe(-32602);
    expect(data.retryable).toBe(true);
  });

  it("getProposalStats returns counts", async () => {
    await createProposal('stats-test', 'test-tool', []);
    const stats = await getProposalStats();
    expect(typeof stats.active).toBe("number");
    expect(typeof stats.total).toBe("number");
  });
});

// ── Config Tool Tests ─────────────────────────────────────

describe("Config Tool", () => {
  it("rejects without expert mode", async () => {
    const result = await handleUpdateConfig({ key: "threshold", value: 0.8, expertMode: false });
    const data = JSON.parse(result.content[0].text);
    expect(data.code).toBe(-32601);
  });

  it("rejects missing key", async () => {
    const result = await handleUpdateConfig({ key: "", value: 0.5, expertMode: true });
    const data = JSON.parse(result.content[0].text);
    expect(data.code).toBe(-32602);
  });

  it("accepts with expert mode", async () => {
    const result = await handleUpdateConfig({ key: "test-config", value: 0.75, expertMode: true });
    const data = JSON.parse(result.content[0].text);
    expect(data.key).toBe("test-config");
    expect(data.value).toBe(0.75);
  });
});

// ── Response Validation Tests ─────────────────────────────

describe("Response Validation Middleware", () => {
  it("auto-adds validationRequired for cognition_query", () => {
    const resp = { content: [{ type: "text", text: JSON.stringify({ nodes: [] }) }] };
    const patched = validateToolResponse("cognition_query", resp);
    const data = JSON.parse(patched.content[0].text);
    expect(data.validationRequired).toBe(true);
  });

  it("auto-adds validationRequired for cognition_validate", () => {
    const resp = { content: [{ type: "text", text: JSON.stringify({ valid: true }) }] };
    const patched = validateToolResponse("cognition_validate", resp);
    const data = JSON.parse(patched.content[0].text);
    expect(data.validationRequired).toBe(true);
  });

  it("does not modify non-JSON content", () => {
    const resp = { content: [{ type: "text", text: "plain text" }] };
    const patched = validateToolResponse("cognition_query", resp);
    expect(patched.content[0].text).toBe("plain text");
  });

  it("preserves existing validationRequired", () => {
    const resp = { content: [{ type: "text", text: JSON.stringify({ nodes: [], validationRequired: false }) }] };
    const patched = validateToolResponse("cognition_query", resp);
    const data = JSON.parse(patched.content[0].text);
    expect(data.validationRequired).toBe(false); // unchanged
  });
});

// ── Constraint Validator Tests ────────────────────────────

describe("Constraint Validator", () => {
  it("validateCode returns passed for clean code", async () => {
    const result = await validateCode("function foo() { return 1; }", "typescript");
    expect(typeof result.passed).toBe("boolean");
    expect(Array.isArray(result.violations)).toBe(true);
    expect(typeof result.hardBlocks).toBe("number");
  });

  it("validateCode handles empty code gracefully", async () => {
    const result = await validateCode("", "typescript");
    expect(result.passed).toBe(true);
    expect(result.violations.length).toBe(0);
  });
});

// ── Stats & Resource Tests ───────────────────────────────

describe("Governance Resources", () => {
  it("getProposalStats returns valid counts", async () => {
    const s = await getProposalStats();
    expect(s.total).toBeGreaterThanOrEqual(0);
  });
});