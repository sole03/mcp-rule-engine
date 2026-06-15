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
 * @file Graph Traverser
 * Replaces the legacy rule-matcher by performing weighted BFS/DFS traversal
 * over the cognition graph, starting from nodes matching the current code context.
 *
 * Reuses: ast-node.ts (computeSemanticHash-like logic via cognition-repository)
 */

import { CognitionRepository, computeSemanticHash } from "../storage/cognition-repository.js";
import { COGNITION_TYPES, EDGE_RELATIONS } from "../storage/cognition-types.js";
import type { CognitionNodeData, CognitionEdgeData } from "../storage/cognition-types.js";
import type { IntentType } from "./types.js";
import type { TraversalOptions, TraversalResult, ScoredCognitionNode } from "./types.js";

// ── Constants ─────────────────────────────────────────────

/** Edge relation multipliers for weighted traversal. */
const RELATION_MULTIPLIERS: Record<string, number> = {
  CAUSES: 1.5,
  PRECEDES: 1.3,
  REFINES: 1.2,
  GENERALIZES: 0.5,
  MUTEX: 0.3,
};

/** Intent bias: adjusts abstraction level preference based on intent. */
const INTENT_BIAS: Record<string, number[]> = {
  REFACTOR: [2, 3, 1, 0],      // prefer architecture/module level
  BUGFIX: [0, 1, 2, 3],        // prefer concrete/function level
  BOILERPLATE: [1, 2, 0, 3],   // prefer module/function level
};

const DEFAULT_MAX_DEPTH = 5;
const DEFAULT_MIN_RELEVANCE = 0.1;
const DEFAULT_MAX_DURATION_MS = 500;

// ── Internal types ────────────────────────────────────────

interface FrontierEntry {
  nodeId: string;
  node: CognitionNodeData;
  depth: number;
  pathWeight: number;
  trace: string[];
}

// ── Graph Traverser ───────────────────────────────────────

export class GraphTraverser {
  private repo: CognitionRepository;

  constructor(repo?: CognitionRepository) {
    this.repo = repo ?? new CognitionRepository();
  }

  /**
   * Traverse the cognition graph starting from nodes relevant to the given code context.
   *
   * @param language   Programming language (e.g., "typescript", "python")
   * @param filePath   File path for context extraction
   * @param content    Code snippet or AST signature for semantic matching
   * @param options    Traversal options
   * @returns Scored cognition nodes sorted by relevance
   */
  async traverse(
    language: string,
    filePath: string,
    content: string,
    options: TraversalOptions = {},
    contextHash?: string,
  ): Promise<TraversalResult> {
    const startTime = performance.now();
    const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
    const minRelevance = options.minRelevance ?? DEFAULT_MIN_RELEVANCE;
    const maxDuration = options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
    const intentHint = options.intentHint as IntentType | undefined;

    // 1. Compute semantic hash from code content
    const semanticHash = contextHash ?? computeSemanticHash(language + ":" + filePath.split(".").pop()!, { contentHash: simpleHash(content) });

    // 2. Find matching nodes in the graph
    const matchedNodes = await this.repo.findNodesBySemanticHash(semanticHash);

    // If no exact match, try a broader search using file extension
    let startNodes = matchedNodes;
    if (startNodes.length === 0) {
      const extHash = computeSemanticHash(language, { ext: filePath.split(".").pop() });
      startNodes = await this.repo.findNodesBySemanticHash(extHash);
    }

    // 3. If still no matches, return empty result
    if (startNodes.length === 0) {
      return {
        nodes: [],
        edges: [],
        durationMs: performance.now() - startTime,
        truncated: false,
      };
    }

    // 4. Weighted BFS traversal from matched nodes
    const visitedNodeIds = new Set<string>();
    const visitedEdgeIds = new Set<string>();
    const scoredNodes: Map<string, ScoredCognitionNode> = new Map();
    const allEdges: Map<string, CognitionEdgeData> = new Map();
    const frontier: FrontierEntry[] = [];

    // Initialize frontier with start nodes
    for (const node of startNodes) {
      visitedNodeIds.add(node.id);
      frontier.push({
        nodeId: node.id,
        node,
        depth: 0,
        pathWeight: 1.0,
        trace: [],
      });
    }

    let elapsed = performance.now() - startTime;
    let truncated = false;

    while (frontier.length > 0 && elapsed < maxDuration) {
      // Sort frontier: highest pathWeight first, then lowest depth
      frontier.sort((a, b) => b.pathWeight - a.pathWeight || a.depth - b.depth);
      const current = frontier.shift()!;

      // Score and store
      const score = this.computeNodeScore(current, intentHint);
      if (score >= minRelevance) {
        scoredNodes.set(current.node.id, {
          node: current.node,
          relevanceScore: score,
          trace: current.trace,
        });
      }

      // Stop at max depth
      if (current.depth >= maxDepth) continue;

      // Fetch outgoing edges for this node
      const subgraph = await this.repo.getSubgraph(current.nodeId, 1);
      const outgoingEdges = subgraph.edges.filter(
        e => e.sourceId === current.nodeId && !visitedEdgeIds.has(e.id),
      );

      for (const edge of outgoingEdges) {
        visitedEdgeIds.add(edge.id);
        allEdges.set(edge.id, edge);

        // Apply abstraction level filter
        const targetNode = subgraph.nodes.find(n => n.id === edge.targetId);
        if (!targetNode) continue;

        if (!this.isLevelCompatible(current.node.abstractionLevel, targetNode.abstractionLevel, edge.relation, intentHint)) {
          continue;
        }

        // Apply GENERALIZES pruning
        const multiplier = RELATION_MULTIPLIERS[edge.relation] ?? 0.5;
        if (edge.relation === "GENERALIZES" && current.depth > 1) continue;

        if (!visitedNodeIds.has(edge.targetId)) {
          visitedNodeIds.add(edge.targetId);
          frontier.push({
            nodeId: edge.targetId,
            node: targetNode,
            depth: current.depth + 1,
            pathWeight: current.pathWeight * multiplier * Math.max(0.5, edge.weight / 1.0),
            trace: [...current.trace, edge.relation + ' → ' + targetNode.type + ':' + targetNode.abstractionLevel],
          });
        }
      }

      elapsed = performance.now() - startTime;
    }

    if (frontier.length > 0) truncated = true;

    // 5. Sort by score descending
    const sorted = [...scoredNodes.values()]
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    return {
      nodes: sorted,
      edges: [...allEdges.values()],
      durationMs: performance.now() - startTime,
      truncated,
    };
  }

  // ── Private Helpers ────────────────────────────────────

  /** Check if moving from sourceLevel to targetLevel is compatible. */
  private isLevelCompatible(
    sourceLevel: number,
    targetLevel: number,
    relation: string,
    intentHint?: IntentType,
  ): boolean {
    const absDiff = Math.abs(sourceLevel - targetLevel);

    // Always allow same or adjacent levels
    if (absDiff <= 1) return true;

    // Jumping from 0→2 or 1→3 (or reverse) needs REFINES connection
    if (absDiff === 2 && relation === "REFINES") return true;

    // Intent-based filtering
    if (intentHint) {
      const bias = INTENT_BIAS[intentHint] ?? [0, 1, 2, 3];
      // If target level is prioritized by intent, allow
      if (bias.indexOf(targetLevel) <= bias.indexOf(sourceLevel) + 1) return true;
    }

    // Skip large level jumps unless explicitly connected
    return absDiff <= 2 && (relation === "CAUSES" || relation === "REFINES");
  }

  /** Compute a relevance score [0, 1] for a frontier entry. */
  private computeNodeScore(entry: FrontierEntry, intentHint?: IntentType): number {
    const depthPenalty = 1 - 0.15 * entry.depth;
    const weightScore = Math.min(1, entry.pathWeight / 1.5);
    const levelScore = intentHint
      ? 1 - Math.abs(INTENT_BIAS[intentHint].indexOf(entry.node.abstractionLevel) - INTENT_BIAS[intentHint].indexOf(0)) * 0.2
      : 1 - Math.abs(entry.node.abstractionLevel - 1) * 0.15;

    // Base score
    let score = Math.max(0, weightScore * depthPenalty * levelScore);

    // Bonus for nodes with AST templates (more actionable)
    if (entry.node.astTemplate) score = Math.min(1, score * 1.2);

    return Math.round(score * 100) / 100;
  }
}

// ── Utility ───────────────────────────────────────────────

function simpleHash(s: string): string {
  if (!s) return "0";
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}
