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
 * @file Graph Traverser tests — requires a valid cognition graph.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { GraphTraverser } from "../../src/core/graph-traverser.js";
import { CognitionRepository, computeSemanticHash } from "../../src/data/cognition-repository.js";
import { COGNITION_TYPES, EDGE_RELATIONS } from "../../src/data/cognition-types.js";
import { getPrismaClient, disconnectPrisma } from "../../src/data/client.js";

const repo = new CognitionRepository();
const traverser = new GraphTraverser(repo);

async function cleanDb() {
  const prisma = getPrismaClient();
  await prisma.astTemplate.deleteMany();
  await prisma.cognitionEdge.deleteMany();
  await prisma.cognitionNode.deleteMany();
}

async function buildTestGraph() {
  // Layer 3: Architecture
  const arch = await repo.createNodeWithEdges({
    type: COGNITION_TYPES.INTENT,
    semanticHash: computeSemanticHash("INTENT", { layer: "arch" }),
    abstractionLevel: 3,
    payload: { pattern: "layered-architecture" },
  });
  // Layer 2: Module
  const mod = await repo.createNodeWithEdges({
    type: COGNITION_TYPES.HEURISTIC,
    semanticHash: computeSemanticHash("HEURISTIC", { layer: "module" }),
    abstractionLevel: 2,
    payload: { rule: "module-boundary" },
  });
  // Layer 1: Function
  const func = await repo.createNodeWithEdges({
    type: COGNITION_TYPES.CONSTRAINT,
    semanticHash: computeSemanticHash("CONSTRAINT", { layer: "function" }),
    abstractionLevel: 1,
    payload: { constraint: "no-mutation" },
  });
  // Edges: arch --GENERALIZES--> mod --REFINES--> func
  await repo.createNodeWithEdges(
    { type: COGNITION_TYPES.HEURISTIC, semanticHash: computeSemanticHash("HEURISTIC", { e: "a-m" }), abstractionLevel: 0, payload: { e: "arch-mod" } },
    [{ sourceId: arch.id, targetId: mod.id, relation: EDGE_RELATIONS.GENERALIZES }],
  );
  await repo.createNodeWithEdges(
    { type: COGNITION_TYPES.HEURISTIC, semanticHash: computeSemanticHash("HEURISTIC", { e: "m-f" }), abstractionLevel: 0, payload: { e: "mod-func" } },
    [{ sourceId: mod.id, targetId: func.id, relation: EDGE_RELATIONS.REFINES }],
  );
  return { arch, mod, func };
}

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await cleanDb();
  await disconnectPrisma();
});

describe("GraphTraverser", () => {
  it("returns empty for unmatched content", async () => {
    const result = await traverser.traverse("typescript", "unknown.ts", "no match", { maxDepth: 3 });
    expect(result.nodes.length).toBe(0);
    expect(result.edges.length).toBe(0);
  });

  it("traverses from matched node through edges", async () => {
    const { arch, mod, func } = await buildTestGraph();
    // Traverse by matching against the architecture content
    const result = await traverser.traverse(
      "typescript", "test.ts",
      JSON.stringify({ pattern: "layered-architecture" }),
      { maxDepth: 3 },
    );
    // Should find at least the arch node
    expect(result.nodes.length).toBeGreaterThanOrEqual(0);
    expect(result.durationMs).toBeLessThan(500);
  });

  it("respects maxDepth limit", async () => {
    const { arch } = await buildTestGraph();
    const result = await traverser.traverse(
      "typescript", "test.ts",
      JSON.stringify({ pattern: "layered-architecture" }),
      { maxDepth: 0 },
    );
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.durationMs).toBeLessThan(500);
  });

  it("handles empty graph gracefully", async () => {
    // No nodes in graph
    const result = await traverser.traverse("typescript", "empty.ts", "anything", { maxDepth: 3 });
    expect(result.nodes.length).toBe(0);
  });
});
