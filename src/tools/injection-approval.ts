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
 * Manages proposal-based approval workflow with TTL.
 * Proposal lifecycle: implicit CREATE (via query/validate) -> explicit APPROVE/REJECT/OVERRIDE.
 */

import { CognitionRepository } from "../storage/cognition-repository.js";
import { getPrismaClient } from "../storage/client.js";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, "../../logs");
const TTL_MS = 5 * 60 * 1000; // 5 minutes

interface Proposal {
  proposalId: string;
  contextHash: string;
  createdAt: number;
  expiresAt: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "OVERRIDDEN" | "EXPIRED";
  nodeIds: string[];
}

const proposals = new Map<string, Proposal>();

function generateId(): string {
  return "prop_" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

/** Create a new proposal implicitly (called after query/validate). */
export function createProposal(contextHash: string, nodeIds: string[] = []): Proposal {
  const now = Date.now();
  // Conflict check: only first proposal per contextHash is valid
  for (const p of proposals.values()) {
    if (p.contextHash === contextHash && p.status === "PENDING" && p.expiresAt > now) {
      return p; // Return existing instead of creating new
    }
  }
  const proposal: Proposal = {
    proposalId: generateId(),
    contextHash,
    createdAt: now,
    expiresAt: now + TTL_MS,
    status: "PENDING",
    nodeIds,
  };
  proposals.set(proposal.proposalId, proposal);
  recordAuditLog("proposal_created", { proposalId: proposal.proposalId, contextHash });
  return proposal;
}

/** Handle cognition_approve_injection MCP Tool call. */
export async function handleApproveInjection(input: { proposalId: string; decision: "APPROVE" | "REJECT" | "OVERRIDE" }): Promise<{ content: { type: string; text: string }[] }> {
  try {
    if (!input.proposalId || !input.decision) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "proposalId and decision are required", code: -32602, retryable: false }) }] };
    }
    const proposal = proposals.get(input.proposalId);
    if (!proposal) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Proposal not found: " + input.proposalId, code: -32602, retryable: false }) }] };
    }
    if (Date.now() > proposal.expiresAt) {
      proposal.status = "EXPIRED";
      recordAuditLog("proposal_expired", { proposalId: input.proposalId });
      return { content: [{ type: "text", text: JSON.stringify({ error: "Proposal Expired", code: -32602, retryable: true }) }] };
    }
    if (proposal.status !== "PENDING") {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Proposal already " + proposal.status, code: -32602, retryable: false }) }] };
    }
    proposal.status = input.decision === "APPROVE" ? "APPROVED" : input.decision === "REJECT" ? "REJECTED" : "OVERRIDDEN";
    recordAuditLog("proposal_" + proposal.status.toLowerCase(), { proposalId: input.proposalId, decision: input.decision });
    return { content: [{ type: "text", text: JSON.stringify({ proposalId: input.proposalId, status: proposal.status, expiresAt: proposal.expiresAt }) }] };
  } catch (err) {
    return { content: [{ type: "text", text: JSON.stringify({ error: String(err), code: -32603, retryable: true }) }] };
  }
}

/** Record audit event (async, non-blocking). */
async function recordAuditLog(eventType: string, props: Record<string, unknown>): Promise<void> {
  try {
    const prisma = getPrismaClient();
    await prisma.metricEvent.create({ data: { eventType, properties: JSON.stringify({ ...props, timestamp: new Date().toISOString() }) } });
  } catch {
    // Fallback to local log file
    try {
      if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
      writeFileSync(join(LOG_DIR, "fallback.log"), JSON.stringify({ eventType, props, timestamp: new Date().toISOString() }) + "\n", { flag: "a" });
    } catch { /* silent */ }
  }
}

/** Get proposal stats. */
export function getProposalStats(): { active: number; expired: number; total: number } {
  const now = Date.now();
  let active = 0, expired = 0;
  for (const p of proposals.values()) {
    if (p.expiresAt > now && p.status === "PENDING") active++;
    else if (p.expiresAt <= now) expired++;
  }
  return { active, expired, total: proposals.size };
}
