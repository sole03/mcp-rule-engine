/**
 * Benchmark: Graph Traversal
 * Measures traverse() BFS latency across graph sizes.
 *
 * Usage: npx tsx benchmarks/graph-traverser.bench.ts
 * Writes results to benchmarks/results/graph.md
 * Copyright 2026 熊高锐 — Apache 2.0
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GraphTraverser } from "../src/core/graph-traverser.js";
import { CognitionRepository, computeSemanticHash } from "../src/data/cognition-repository.js";
import { COGNITION_TYPES, EDGE_RELATIONS } from "../src/data/cognition-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, "results");
mkdirSync(RESULTS_DIR, { recursive: true });
const output: string[] = [];

const repo = new CognitionRepository();
const traverser = new GraphTraverser(repo);

function log(s: string) {
  console.log(s);
  output.push(s);
}

async function buildChain(size: number): Promise<string> {
  const ids: string[] = [];
  for (let i = 0; i < size; i++) {
    const n = await repo.createNodeWithEdges({
      type: COGNITION_TYPES.HEURISTIC,
      semanticHash: computeSemanticHash("HEURISTIC", { benchIdx: "_s" + size + "_i" + i }),
      abstractionLevel: i % 4,
      payload: { benchIdx: i },
    });
    ids.push(n.id);
  }
  for (let i = 0; i < size - 1; i++) {
    await repo.createNodeWithEdges(
      { type: COGNITION_TYPES.CONSTRAINT, semanticHash: computeSemanticHash("CONSTRAINT", { benchEdge: "_s" + size + "_e" + i }), abstractionLevel: 0, payload: {} },
      [{ sourceId: ids[i], targetId: ids[i + 1], relation: EDGE_RELATIONS.PRECEDES }],
    );
  }
  return ids[0];
}

async function cleanBench() {
  const { getPrismaClient } = await import("../src/data/client.js");
  const prisma = getPrismaClient();
  await prisma.astTemplate.deleteMany();
  await prisma.cognitionEdge.deleteMany();
  await prisma.cognitionNode.deleteMany();
}

async function main() {
  process.env.DATABASE_URL = "file:bench.db";
  await cleanBench();

  log("# Graph Traversal Benchmarks\n");
  // Warmup
  const warmRoot = await buildChain(10);
  await traverser.traverse("typescript", "src/warm.ts", "", { maxDepth: 5 });
  await cleanBench();

  log("| Graph Size | Depth | Ops/sec | Avg (ms) | P50 (ms) | P99 (ms) | Samples |");
  log("|------------|-------|---------|----------|----------|----------|---------|");

  for (const size of [100]) {
    for (const depth of [3, 5]) {
      const rootId = await buildChain(size);
      const samples: number[] = [];
      const N = 20;

      for (let i = 0; i < N; i++) {
        const start = performance.now();
        await traverser.traverse("typescript", "src/test.ts", "", { maxDepth: depth });
        samples.push(performance.now() - start);
      }

      samples.sort((a, b) => a - b);
      const avg = samples.reduce((a, b) => a + b, 0) / N;
      const p50 = samples[Math.floor(N * 0.5)];
      const p99 = samples[Math.floor(N * 0.99)];
      const opsSec = 1000 / avg;

      log(`| ${size} | ${depth} | ${opsSec.toFixed(1)} | ${avg.toFixed(3)} | ${p50.toFixed(3)} | ${p99.toFixed(3)} | ${N} |`);
      await cleanBench();
    }
  }
}

main().then(() => {
  writeFileSync(join(RESULTS_DIR, "graph.md"), output.join("\n") + "\n", "utf-8");
}).catch(console.error);
