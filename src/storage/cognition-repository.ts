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

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "./client.js";
import {
  CognitionTypeStr,
  EdgeRelationStr,
  CognitionNodeInput,
  CognitionEdgeInput,
  AstTemplateInput,
  CognitionNodeData,
  CognitionEdgeData,
  AstTemplateData,
  SubgraphResult,
  COGNITION_TYPES,
  EDGE_RELATIONS,
} from "./cognition-types.js";

// ── Helpers ────────────────────────────────────────────────

/** Simple hash for semantic dedup. Consistent with ast-node.ts legacy style. */
function simpleHash(s: string): string {
  if (!s) return "0";
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

/** Generate a semantic hash from type + payload for deduplication. */
export function computeSemanticHash(type: string, payload: Record<string, unknown>): string {
  const normalized = JSON.stringify(payload, Object.keys(payload).sort());
  return simpleHash(type + ":" + normalized);
}

/** Validate that a type string is a valid CognitionType. */
export function isValidCognitionType(s: string): s is CognitionTypeStr {
  return Object.values(COGNITION_TYPES).includes(s as CognitionTypeStr);
}

/** Validate that a relation string is a valid EdgeRelation. */
export function isValidEdgeRelation(s: string): s is EdgeRelationStr {
  return Object.values(EDGE_RELATIONS).includes(s as EdgeRelationStr);
}

function parseJsonField<T>(val: string | null | undefined): T | null {
  if (!val) return null;
  try { return JSON.parse(val) as T; } catch { return null; }
}

function toCognitionNode(r: Prisma.CognitionNodeGetPayload<{ include: { astTemplate: true } }>): CognitionNodeData {
  return {
    id: r.id,
    type: r.type as CognitionTypeStr,
    semanticHash: r.semanticHash,
    abstractionLevel: r.abstractionLevel,
    payload: parseJsonField<Record<string, unknown>>(r.payload) ?? {},
    metadata: parseJsonField<Record<string, unknown>>(r.metadata),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    astTemplate: r.astTemplate ? toAstTemplate(r.astTemplate) : null,
  };
}

function toCognitionNodeBasic(r: Prisma.CognitionNodeGetPayload<{}>): CognitionNodeData {
  return {
    id: r.id,
    type: r.type as CognitionTypeStr,
    semanticHash: r.semanticHash,
    abstractionLevel: r.abstractionLevel,
    payload: parseJsonField<Record<string, unknown>>(r.payload) ?? {},
    metadata: parseJsonField<Record<string, unknown>>(r.metadata),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    astTemplate: null,
  };
}

function toCognitionEdge(r: Prisma.CognitionEdgeGetPayload<{}>): CognitionEdgeData {
  return {
    id: r.id,
    sourceId: r.sourceId,
    targetId: r.targetId,
    relation: r.relation as EdgeRelationStr,
    weight: r.weight,
    metadata: parseJsonField<Record<string, unknown>>(r.metadata),
    createdAt: r.createdAt,
  };
}

function toAstTemplate(r: Prisma.AstTemplateGetPayload<{}>): AstTemplateData {
  return {
    id: r.id,
    nodeId: r.nodeId,
    language: r.language,
    templateDsl: r.templateDsl,
    validationSchema: parseJsonField<Record<string, unknown>>(r.validationSchema),
    createdAt: r.createdAt,
  };
}

// ── Repository ─────────────────────────────────────────────

export class CognitionRepository {
  /**
   * Atomically create a cognition node and its associated edges.
   * Uses a Prisma  for atomicity.
  */ 
  async createNodeWithEdges(
    nodeInput: CognitionNodeInput,
    edgeInputs: CognitionEdgeInput[] = [],
  ): Promise<CognitionNodeData> {
    const prisma = getPrismaClient();
    const payloadStr = JSON.stringify(nodeInput.payload);
    const metadataStr = nodeInput.metadata ? JSON.stringify(nodeInput.metadata) : null;

    return prisma.$transaction(async (tx) => {
      const node = await tx.cognitionNode.create({
        data: {
          type: nodeInput.type,
          semanticHash: nodeInput.semanticHash,
          abstractionLevel: nodeInput.abstractionLevel,
          payload: payloadStr,
          metadata: metadataStr,
        },
      });

      if (edgeInputs.length > 0) {
        await tx.cognitionEdge.createMany({
          data: edgeInputs.map((e) => ({
            sourceId: e.sourceId,
            targetId: e.targetId,
            relation: e.relation,
            weight: e.weight ?? 1.0,
            metadata: e.metadata ? JSON.stringify(e.metadata) : null,
          })),
        });
      }

      const withTemplate = await tx.cognitionNode.findUnique({
        where: { id: node.id },
        include: { astTemplate: true },
      });

      return toCognitionNode(withTemplate!);
    });
  }

  async findNodesBySemanticHash(hash: string): Promise<CognitionNodeData[]> {
    const prisma = getPrismaClient();
    const rows = await prisma.cognitionNode.findMany({
      where: { semanticHash: hash },
      include: { astTemplate: true },
    });
    return rows.map(toCognitionNode);
  }

  /**
   * Get a subgraph starting from a root node, following outgoing edges up to maxDepth.
   * Uses level-based BFS (no DB-side recursive CTE needed).
   */
  async getSubgraph(rootNodeId: string, maxDepth: number = 3): Promise<SubgraphResult> {
    const prisma = getPrismaClient();

    // 1. Fetch root node
    const rootNode = await prisma.cognitionNode.findUnique({
      where: { id: rootNodeId },
      include: { astTemplate: true },
    });
    if (!rootNode) {
      return { nodes: [], edges: [] };
    }

    const visitedNodeIds = new Set<string>([rootNode.id]);
    const visitedEdgeIds = new Set<string>();
    const nodes: CognitionNodeData[] = [toCognitionNode(rootNode)];
    const edges: CognitionEdgeData[] = [];

    let frontier = [rootNode.id];

    // BFS traversal level by level
    for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
      // Fetch all outgoing edges from frontier nodes
      const outgoingEdges = await prisma.cognitionEdge.findMany({
        where: { sourceId: { in: frontier } },
      });

      const nextFrontier: string[] = [];
      for (const edge of outgoingEdges) {
        if (!visitedEdgeIds.has(edge.id)) {
          visitedEdgeIds.add(edge.id);
          edges.push(toCognitionEdge(edge));

          if (!visitedNodeIds.has(edge.targetId)) {
            visitedNodeIds.add(edge.targetId);
            nextFrontier.push(edge.targetId);
          }
        }
      }

      // Fetch target nodes for the next frontier
      if (nextFrontier.length > 0) {
        const targetNodes = await prisma.cognitionNode.findMany({
          where: { id: { in: nextFrontier } },
          include: { astTemplate: true },
        });
        for (const n of targetNodes) {
          nodes.push(toCognitionNode(n));
        }
      }

      frontier = nextFrontier;
    }

    return { nodes, edges };
  }

  /**
   * Adjust an edge's weight by a delta (positive or negative).
   * Prepares for the feedback loop in Phase 4.
   */
  async updateEdgeWeight(edgeId: string, delta: number): Promise<CognitionEdgeData> {
    const prisma = getPrismaClient();
    const edge = await prisma.cognitionEdge.findUnique({ where: { id: edgeId } });
    if (!edge) {
      throw new Error(`Edge not found: ${edgeId}`);
    }
    const newWeight = Math.max(0, Math.min(10, edge.weight + delta));
    const updated = await prisma.cognitionEdge.update({
      where: { id: edgeId },
      data: { weight: newWeight },
    });
    return toCognitionEdge(updated);
  }

  /** Create an AST template linked to a cognition node. */
  async createAstTemplate(input: AstTemplateInput): Promise<AstTemplateData> {
    const prisma = getPrismaClient();
    const tmpl = await prisma.astTemplate.create({
      data: {
        nodeId: input.nodeId,
        language: input.language,
        templateDsl: input.templateDsl,
        validationSchema: input.validationSchema ? JSON.stringify(input.validationSchema) : null,
      },
    });
    return toAstTemplate(tmpl);
  }

  /** Find a node by its database ID. */
  async findNodeById(id: string): Promise<CognitionNodeData | null> {
    const prisma = getPrismaClient();
    const row = await prisma.cognitionNode.findUnique({
      where: { id },
      include: { astTemplate: true },
    });
    return row ? toCognitionNode(row) : null;
  }

  /** Find edges by relation type. */
  async findEdgesByRelation(relation: EdgeRelationStr): Promise<CognitionEdgeData[]> {
    const prisma = getPrismaClient();
    const rows = await prisma.cognitionEdge.findMany({
      where: { relation },
    });
    return rows.map(toCognitionEdge);
  }

  /** Delete a node and cascade-delete its edges and template. */
  async deleteNode(id: string): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.cognitionNode.delete({ where: { id } });
  }

  // ── Feedback Event Tracking ────────────────────────────

  /** Record a feedback event (async, non-blocking, fire-and-forget). */
  async recordFeedbackEvent(
    nodeId: string,
    edgeId?: string,
    outcome?: string,
    comment?: string,
  ): Promise<{ feedbackId: string }> {
    const prisma = getPrismaClient();
    const event = await prisma.metricEvent.create({
      data: {
        eventType: "cognition_feedback_pending",
        properties: JSON.stringify({
          nodeId,
          edgeId: edgeId ?? null,
          outcome: outcome ?? "PENDING",
          comment: comment ?? null,
          status: "PENDING",
          createdAt: new Date().toISOString(),
        }),
      },
    });
    return { feedbackId: event.id };
  }

  /** Resolve a pending feedback event with the final outcome. */
  async resolveFeedbackEvent(
    feedbackId: string,
    outcome: string,
    edgeId?: string,
    weightDelta?: number,
  ): Promise<void> {
    const prisma = getPrismaClient();
    const existing = await prisma.metricEvent.findUnique({ where: { id: feedbackId } });
    if (!existing) return;
    const props = JSON.parse(existing.properties || "{}");
    props.status = "RESOLVED";
    props.outcome = outcome;
    props.resolvedAt = new Date().toISOString();
    if (weightDelta !== undefined) props.weightDelta = weightDelta;
    if (edgeId) props.edgeId = edgeId;
    await prisma.metricEvent.update({
      where: { id: feedbackId },
      data: { properties: JSON.stringify(props) },
    });
  }
}

// ── Proposal Governance Methods ─────────────────────────

export interface ProposalRow {
  id: string;
  status: string;
  contextHash: string;
  toolName: string;
  payload: string;
  nodeIds: string;
  proposedBy: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

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

export function toProposalData(row: ProposalRow): ProposalData {
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

export async function findProposalById(id: string): Promise<ProposalData | null> {
  const prisma = getPrismaClient();
  const row = await prisma.proposal.findUnique({ where: { id } });
  return row ? toProposalData(row) : null;
}

export async function findExpiredPendingProposals(): Promise<ProposalData[]> {
  const prisma = getPrismaClient();
  const rows = await prisma.proposal.findMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
  });
  return rows.map(toProposalData);
}

export async function bulkExpireProposals(): Promise<number> {
  const prisma = getPrismaClient();
  const result = await prisma.proposal.updateMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
  return result.count;
}

export async function getProposalStats(): Promise<{ active: number; expired: number; total: number }> {
  const prisma = getPrismaClient();
  const [active, expired, total] = await Promise.all([
    prisma.proposal.count({ where: { status: "PENDING", expiresAt: { gt: new Date() } } }),
    prisma.proposal.count({ where: { status: "EXPIRED" } }),
    prisma.proposal.count(),
  ]);
  return { active, expired, total };
}