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
 * @file Cognition engine MCP Tool handlers.
 * Three new tools for the MCP protocol:
 *   cognition_query    — Query the cognition graph
 *   cognition_validate — Validate code against AST templates
 *   cognition_feedback — Provide feedback to update edge weights
 *
 * These are independent from legacy tools in this directory.
 */

import { GraphTraverser } from "../../core/graph-traverser.js";
import { recognizeIntent } from "../../core/intent-recognizer.js";
import { solveConstraints } from "../../core/ast-constraint-solver.js";
import { CognitionRepository } from "../../data/cognition-repository.js";
import type { TraversalOptions } from "../../core/cognition-types.js";

// ── Input Types ─────────────────────────────────────────────

interface CognitionQueryInput {
  contextHash: string;
  intentHint?: "REFACTOR" | "BUGFIX" | "BOILERPLATE";
  maxDepth?: number;
}

interface CognitionValidateInput {
  nodeId: string;
  targetFileContent: string;
}

interface CognitionFeedbackInput {
  nodeId: string;
  edgeId?: string;
  outcome: "ACCEPTED" | "REJECTED" | "MODIFIED";
  comment?: string;
}

// ── Handlers ────────────────────────────────────────────────

/**
 * cognition_query — Traverse the cognition graph starting from a context hash.
 * If intentHint is omitted, first runs intent recognition on the content hash string.
 */
export async function handleCognitionQuery(
  input: CognitionQueryInput,
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    if (!input.contextHash) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "contextHash is required" }) }] };
    }
    const repo = new CognitionRepository();
    const traverser = new GraphTraverser(repo);

    // If intentHint is provided, use it; otherwise compute from contextHash heuristic
    let intentHint = input.intentHint;
    if (!intentHint && input.contextHash.includes("lint")) {
      intentHint = "BUGFIX";
    }

    const options: TraversalOptions = {
      maxDepth: input.maxDepth ?? 3,
      intentHint: intentHint as any,
    };

    // Use empty language/path — the hash is pre-computed
    const result = await traverser.traverse("*", "unknown.ts", input.contextHash, options, input.contextHash);

    // Record feedback event asynchronously (fire-and-forget)
    repo.recordFeedbackEvent(result.nodes[0]?.node?.id ?? "unknown").catch(() => {});

    const summary = result.nodes.map((n) => ({
      id: n.node.id,
      type: n.node.type,
      abstractionLevel: n.node.abstractionLevel,
      relevanceScore: n.relevanceScore,
    }));

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          nodes: summary,
          traversalMs: result.durationMs,
          truncated: result.truncated,
        }),
      }],
    };
  } catch (err) {
    return { content: [{ type: "text", text: JSON.stringify({ error: String(err) }) }] };
  }
}

/**
 * cognition_validate — Validate code content against a cognition node's AST template.
 */
export async function handleCognitionValidate(
  input: CognitionValidateInput,
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    if (!input.nodeId || !input.targetFileContent) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "nodeId and targetFileContent are required" }) }] };
    }
    const repo = new CognitionRepository();
    const node = await repo.findNodeById(input.nodeId);
    if (!node) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Node not found: " + input.nodeId }) }] };
    }

    // Records feedback event (fire-and-forget)
    repo.recordFeedbackEvent(input.nodeId).catch(() => {});

    // If no template, return valid
    if (!node.astTemplate) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ valid: true, violations: [] }),
        }],
      };
    }

    // Solve constraints
    const constraintResult = await solveConstraints([node], input.targetFileContent, node.astTemplate.language);

    const violations = constraintResult.validations.flatMap((v) =>
      v.failures.map((f) => ({
        constraintPath: f.constraintPath,
        expected: f.expected,
        actual: f.actual,
      })),
    );

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          valid: violations.length === 0,
          violations,
          transformPatch: constraintResult.patches.length > 0 ? constraintResult.patches[0] : undefined,
        }),
      }],
    };
  } catch (err) {
    return { content: [{ type: "text", text: JSON.stringify({ error: String(err) }) }] };
  }
}

/**
 * cognition_feedback — Record user feedback and adjust edge weights.
 */
export async function handleCognitionFeedback(
  input: CognitionFeedbackInput,
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    if (!input.nodeId || !input.outcome) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "nodeId and outcome are required" }) }] };
    }
    const repo = new CognitionRepository();

    // Calculate weight delta
    let delta = 0;
    switch (input.outcome) {
      case "ACCEPTED": delta = 0.1; break;
      case "REJECTED": delta = -0.2; break;
      case "MODIFIED": delta = 0.05; break;
    }

    let updatedWeight: number | undefined;

    // Update edge weight if edgeId provided
    if (input.edgeId) {
      try {
        const result = await repo.updateEdgeWeight(input.edgeId, delta);
        updatedWeight = result.weight;
      } catch {
        // Edge may not exist; still record feedback
      }
    }

    // Record and resolve feedback event
    const { feedbackId } = await repo.recordFeedbackEvent(
      input.nodeId,
      input.edgeId,
      input.outcome,
      input.comment,
    );
    await repo.resolveFeedbackEvent(feedbackId, input.outcome, input.edgeId, delta);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          updatedWeight: updatedWeight ?? null,
          feedbackId,
        }),
      }],
    };
  } catch (err) {
    return { content: [{ type: "text", text: JSON.stringify({ error: String(err) }) }] };
  }
}
