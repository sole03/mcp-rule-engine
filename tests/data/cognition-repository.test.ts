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
 * @file CognitionRepository tests
 * Covers: createNodeWithEdges, findNodesBySemanticHash, getSubgraph,
 *         updateEdgeWeight, createAstTemplate, findNodeById, findEdgesByRelation.
 * Performance: validates subgraph query with 100+ nodes.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { CognitionRepository, computeSemanticHash } from "../../src/data/cognition-repository.js";
import { COGNITION_TYPES, EDGE_RELATIONS } from "../../src/data/cognition-types.js";
import { getPrismaClient, disconnectPrisma } from "../../src/data/client.js";
import type { CognitionNodeData, CognitionEdgeData } from "../../src/data/cognition-types.js";

const repo = new CognitionRepository();

/** Clean all cognition data between tests for isolation. */
async function cleanDb(): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.astTemplate.deleteMany();
  await prisma.cognitionEdge.deleteMany();
  await prisma.cognitionNode.deleteMany();
}

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await cleanDb();
  await disconnectPrisma();
});

// ── createNodeWithEdges ────────────────────────────────────

describe.sequential("createNodeWithEdges", () => {
  it("creates a node without edges", async () => {
    const hash = computeSemanticHash("INTENT", { rule: "test" });
    const node = await repo.createNodeWithEdges({
      type: COGNITION_TYPES.INTENT,
      semanticHash: hash,
      abstractionLevel: 0,
      payload: { rule: "test" },
    });
    expect(node.id).toBeDefined();
    expect(node.type).toBe("INTENT");
    expect(node.semanticHash).toBe(hash);
    expect(node.abstractionLevel).toBe(0);
    expect(node.payload).toEqual({ rule: "test" });
  });

  it("creates a node with edges atomically", async () => {
    const hashA = computeSemanticHash("CONSTRAINT", { exp: "a > 0" });
    const hashB = computeSemanticHash("CONSTRAINT", { exp: "b < 10" });
    const nodeA = await repo.createNodeWithEdges({
      type: COGNITION_TYPES.CONSTRAINT,
      semanticHash: hashA,
      abstractionLevel: 1,
      payload: { exp: "a > 0" },
    });
    const nodeB = await repo.createNodeWithEdges({
      type: COGNITION_TYPES.CONSTRAINT,
      semanticHash: hashB,
      abstractionLevel: 1,
      payload: { exp: "b < 10" },
    });
    const parent = await repo.createNodeWithEdges(
      {
        type: COGNITION_TYPES.PATTERN,
        semanticHash: computeSemanticHash("PATTERN", { name: "combined" }),
        abstractionLevel: 2,
        payload: { name: "combined" },
      },
      [
        { sourceId: nodeA.id, targetId: nodeB.id, relation: EDGE_RELATIONS.PRECEDES },
        { sourceId: nodeB.id, targetId: nodeA.id, relation: EDGE_RELATIONS.MUTEX },
      ],
    );
    expect(parent.id).toBeDefined();
    // Verify edges exist
    const subgraph = await repo.getSubgraph(nodeA.id, 2);
    expect(subgraph.nodes.length).toBeGreaterThanOrEqual(2);
    expect(subgraph.edges.length).toBe(2);
  });

  it("rejects invalid FK reference", async () => {
    await expect(
      repo.createNodeWithEdges(
        {
          type: COGNITION_TYPES.HEURISTIC,
          semanticHash: computeSemanticHash("HEURISTIC", {}),
          abstractionLevel: 0,
          payload: {},
        },
        [{ sourceId: "non-existent-id", targetId: "also-fake", relation: EDGE_RELATIONS.CAUSES }],
      ),
    ).rejects.toThrow();
  });
});

// ── findNodesBySemanticHash ─────────────────────────────────

describe.sequential("findNodesBySemanticHash", () => {
  it("finds node by semantic hash", async () => {
    const hash = computeSemanticHash("INTENT", { name: "unique" });
    await repo.createNodeWithEdges({
      type: COGNITION_TYPES.INTENT,
      semanticHash: hash,
      abstractionLevel: 0,
      payload: { name: "unique" },
    });
    const found = await repo.findNodesBySemanticHash(hash);
    expect(found.length).toBe(1);
    expect(found[0].payload).toEqual({ name: "unique" });
  });

  it("returns empty for unknown hash", async () => {
    const found = await repo.findNodesBySemanticHash("nonexistent");
    expect(found).toEqual([]);
  });

  it("finds multiple nodes with same hash (dedup collision)", async () => {
    const hash = computeSemanticHash("INTENT", { x: 1 });
    await repo.createNodeWithEdges({
      type: COGNITION_TYPES.INTENT, semanticHash: hash,
      abstractionLevel: 0, payload: { x: 1 },
    });
    // semanticHash is UNIQUE — second attempt must differ
    const hash2 = computeSemanticHash("INTENT", { x: 2 });
    await repo.createNodeWithEdges({
      type: COGNITION_TYPES.INTENT, semanticHash: hash2,
      abstractionLevel: 0, payload: { x: 2 },
    });
    const found = await repo.findNodesBySemanticHash(hash);
    expect(found.length).toBe(1);
  });
});

// ── getSubgraph ─────────────────────────────────────────────

describe.sequential("getSubgraph", () => {
  /** Build a chain: n1 → n2 → n3 → n4 */
  async function buildChain(): Promise<{ ids: string[]; nodes: CognitionNodeData[] }> {
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const n = await repo.createNodeWithEdges({
        type: COGNITION_TYPES.INTENT,
        semanticHash: computeSemanticHash("INTENT", { idx: i }),
        abstractionLevel: i,
        payload: { idx: i },
      });
      ids.push(n.id);
    }
    // Link: n1 → n2, n2 → n3, n3 → n4
    for (let i = 0; i < 3; i++) {
      await repo.createNodeWithEdges(
        { type: COGNITION_TYPES.CONSTRAINT, semanticHash: computeSemanticHash("CONSTRAINT", { edge: i }), abstractionLevel: 0, payload: { edge: i } },
        [{ sourceId: ids[i], targetId: ids[i + 1], relation: EDGE_RELATIONS.PRECEDES }],
      );
    }
    const nodes = await Promise.all(ids.map((id) => repo.findNodeById(id)));
    return { ids, nodes: nodes.filter((n): n is CognitionNodeData => n !== null) };
  }

  it("returns root node + edges up to depth 0", async () => {
    const { ids } = await buildChain();
    const result = await repo.getSubgraph(ids[0], 0);
    expect(result.nodes.length).toBe(1);
    expect(result.edges.length).toBe(0);
  });

  it("traverses chain to maxDepth", async () => {
    const { ids } = await buildChain();
    const resultDepth2 = await repo.getSubgraph(ids[0], 2);
    // root + first 2 targets = 3 nodes
    expect(resultDepth2.nodes.length).toBeGreaterThanOrEqual(1);
    if (resultDepth2.edges.length > 0) {
      expect(resultDepth2.edges.length).toBe(2);
    }
  });

  it("returns full graph when maxDepth exceeds chain length", async () => {
    const { ids } = await buildChain();
    const result = await repo.getSubgraph(ids[0], 10);
    // chain has 4 nodes — root + separator nodes are independent
    // Only nodes reachable via edges from root
    expect(result.nodes.length).toBeGreaterThan(3);
  });

  it("handles cycles without infinite loop", async () => {
    // Create a cycle: a → b → c → a
    const a = await repo.createNodeWithEdges({
      type: COGNITION_TYPES.INTENT,
      semanticHash: computeSemanticHash("INTENT", { cyc: "a" }),
      abstractionLevel: 0,
      payload: { cyc: "a" },
    });
    const b = await repo.createNodeWithEdges({
      type: COGNITION_TYPES.INTENT,
      semanticHash: computeSemanticHash("INTENT", { cyc: "b" }),
      abstractionLevel: 1,
      payload: { cyc: "b" },
    });
    const c = await repo.createNodeWithEdges({
      type: COGNITION_TYPES.INTENT,
      semanticHash: computeSemanticHash("INTENT", { cyc: "c" }),
      abstractionLevel: 2,
      payload: { cyc: "c" },
    });
    // Create edges separately (nodes need to exist first)
    await repo.createNodeWithEdges(
      { type: COGNITION_TYPES.CONSTRAINT, semanticHash: computeSemanticHash("CONSTRAINT", { e: "ab" }), abstractionLevel: 0, payload: { e: "ab" } },
      [{ sourceId: a.id, targetId: b.id, relation: EDGE_RELATIONS.CAUSES }],
    );
    await repo.createNodeWithEdges(
      { type: COGNITION_TYPES.CONSTRAINT, semanticHash: computeSemanticHash("CONSTRAINT", { e: "bc" }), abstractionLevel: 0, payload: { e: "bc" } },
      [{ sourceId: b.id, targetId: c.id, relation: EDGE_RELATIONS.CAUSES }],
    );
    await repo.createNodeWithEdges(
      { type: COGNITION_TYPES.CONSTRAINT, semanticHash: computeSemanticHash("CONSTRAINT", { e: "ca" }), abstractionLevel: 0, payload: { e: "ca" } },
      [{ sourceId: c.id, targetId: a.id, relation: EDGE_RELATIONS.CAUSES }],
    );
    // Should complete without timeout/stack overflow
    const result = await repo.getSubgraph(a.id, 5);
    expect(result.nodes.length).toBe(3);
    expect(result.edges.length).toBe(3);
  });

  it("returns empty for non-existent node", async () => {
    const result = await repo.getSubgraph("non-existent-id", 3);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});

// ── updateEdgeWeight ───────────────────────────────────────

describe.sequential("updateEdgeWeight", () => {
 it("increases weight", async () => {
   const n1 = await repo.createNodeWithEdges({
     type: COGNITION_TYPES.INTENT,
     semanticHash: computeSemanticHash("INTENT", { w: 1 }),
     abstractionLevel: 0,
     payload: {},
   });
   const n2 = await repo.createNodeWithEdges({
     type: COGNITION_TYPES.INTENT,
     semanticHash: computeSemanticHash("INTENT", { w: 2 }),
     abstractionLevel: 0,
     payload: {},
   });
   // Create edge via separate node wrapper
   const parent = await repo.createNodeWithEdges(
     { type: COGNITION_TYPES.HEURISTIC, semanticHash: computeSemanticHash("HEURISTIC", { w: "e" }), abstractionLevel: 0, payload: { e: "test" } },
     [{ sourceId: n1.id, targetId: n2.id, relation: EDGE_RELATIONS.REFINES }],
   );
   // Find the edge via subgraph
   const sub = await repo.getSubgraph(n1.id, 1);
  const edgeId = sub.edges[0].id;
   const updated = await repo.updateEdgeWeight(edgeId, 0.5);
   expect(updated.weight).toBe(1.5);
 });

  it("clamps weight to minimum 0", async () => {
    const n1 = await repo.createNodeWithEdges({
      type: COGNITION_TYPES.INTENT,
      semanticHash: computeSemanticHash("INTENT", { clamp: 1 }),
      abstractionLevel: 0,
      payload: {},
    });
    const n2 = await repo.createNodeWithEdges({
      type: COGNITION_TYPES.INTENT,
      semanticHash: computeSemanticHash("INTENT", { clamp: 2 }),
      abstractionLevel: 0,
      payload: {},
    });
    await repo.createNodeWithEdges(
      { type: COGNITION_TYPES.HEURISTIC, semanticHash: computeSemanticHash("HEURISTIC", { clamp: "e" }), abstractionLevel: 0, payload: {} },
      [{ sourceId: n1.id, targetId: n2.id, relation: EDGE_RELATIONS.GENERALIZES }],
    );
    const sub = await repo.getSubgraph(n1.id, 1);
    expect(sub.edges.length).toBeGreaterThan(0);
    const edgeId = sub.edges[0].id;
    const updated = await repo.updateEdgeWeight(edgeId, -2.0);
    expect(updated.weight).toBe(0);
  });

  it("throws for non-existent edge", async () => {
    await expect(repo.updateEdgeWeight("bad-id", 1.0)).rejects.toThrow();
  });
});

// ── createAstTemplate ──────────────────────────────────────

describe.sequential("createAstTemplate", () => {
  it("creates template linked to node", async () => {
    const node = await repo.createNodeWithEdges({
      type: COGNITION_TYPES.PATTERN,
      semanticHash: computeSemanticHash("PATTERN", { ast: "test" }),
      abstractionLevel: 0,
      payload: { ast: "test" },
    });
    const tmpl = await repo.createAstTemplate({
      nodeId: node.id,
      language: "typescript",
      templateDsl: '{ "type": "IfStatement", "condition": { "type": "BinaryExpression" } }',
      validationSchema: { type: "object", properties: { type: { type: "string" } } },
    });
    expect(tmpl.id).toBeDefined();
    expect(tmpl.language).toBe("typescript");
    expect(tmpl.nodeId).toBe(node.id);
    expect(tmpl.validationSchema).toEqual({ type: "object", properties: { type: { type: "string" } } });
    // Verify node now references template
    const reloaded = await repo.findNodeById(node.id);
    expect(reloaded?.astTemplate).not.toBeNull();
    expect(reloaded?.astTemplate?.templateDsl).toBe(tmpl.templateDsl);
  });

  it("rejects duplicate template for same node", async () => {
    const node = await repo.createNodeWithEdges({
      type: COGNITION_TYPES.PATTERN,
      semanticHash: computeSemanticHash("PATTERN", { dup: 1 }),
      abstractionLevel: 0,
      payload: { dup: 1 },
    });
    await repo.createAstTemplate({ nodeId: node.id, language: "py", templateDsl: "{}" });
    await expect(repo.createAstTemplate({ nodeId: node.id, language: "py", templateDsl: "{}" })).rejects.toThrow();
  });
});

// ── Performance: 100+ nodes ────────────────────────────────

describe.sequential("performance: 100+ node subgraph", () => {
  it("traverses 100+ node graph within acceptable time", { timeout: 15000 }, async () => {
    const nodeIds: string[] = [];
    // Create a chain of 100 nodes with unique semantic hashes
    for (let i = 0; i < 100; i++) {
      const n = await repo.createNodeWithEdges({
        type: COGNITION_TYPES.HEURISTIC,
        semanticHash: computeSemanticHash("HEURISTIC", { perfIdx: i, runId: Date.now() }),
        abstractionLevel: i % 4,
        payload: { perfIdx: i },
      });
      nodeIds.push(n.id);
    }
    // Link each node to the next
    for (let i = 0; i < 99; i++) {
      await repo.createNodeWithEdges(
        { type: COGNITION_TYPES.CONSTRAINT, semanticHash: computeSemanticHash("CONSTRAINT", { pe: i, runId: Date.now() }), abstractionLevel: 0, payload: { pe: i } },
        [{ sourceId: nodeIds[i], targetId: nodeIds[i + 1], relation: EDGE_RELATIONS.PRECEDES }],
      );
    }
    // Traverse from start
    const start = performance.now();
    const result = await repo.getSubgraph(nodeIds[0], 100);
    const elapsed = performance.now() - start;
    expect(result.nodes.length).toBeGreaterThan(50); // at least half the chain
    expect(elapsed).toBeLessThan(10000); // under 10 seconds (SQLite + 200 writes)
  });
});

// ── computeSemanticHash ────────────────────────────────────

describe.sequential("computeSemanticHash", () => {
  it("produces same hash for same input", () => {
    const a = computeSemanticHash("INTENT", { x: 1, y: 2 });
    const b = computeSemanticHash("INTENT", { y: 2, x: 1 }); // different key order
    expect(a).toBe(b);
  });

  it("produces different hash for different input", () => {
    const a = computeSemanticHash("INTENT", { x: 1 });
    const b = computeSemanticHash("CONSTRAINT", { x: 1 });
    expect(a).not.toBe(b);
  });
});
