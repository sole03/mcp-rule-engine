/**
 * Benchmark: Intent Recognition
 * Measures recognizeIntent() throughput and latency across diff sizes.
 *
 * Usage: npx tsx benchmarks/intent-recognizer.bench.ts
 * Copyright 2026 熊高锐 — Apache 2.0
 */

import { recognizeIntent } from "../src/core/intent-recognizer.js";

const DIFF_TEMPLATES = {
  small: "diff --git a/src/x.ts b/src/x.ts\n--- a/src/x.ts\n+++ b/src/x.ts\n@@ -1,3 +1,4 @@\n const a = 1;\n+const b = 2;\n",
  medium: "diff --git a/src/a.ts b/src/a.ts\ndiff --git a/src/b.ts b/src/b.ts\ndiff --git a/src/c.ts b/src/c.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,10 +1,15 @@\n+function validate(x: string) {\n+  if (!x) throw new Error();\n+  return x.trim();\n+}\n const old = 1;\n-let deprecated = 2;\n+const updated = 3;\n--- a/src/b.ts\n+++ b/src/b.ts\n@@ -1,5 +1,7 @@\n+import { validate } from \"./a.js\";\n+type Result = { ok: boolean };\n",
  large: (() => {
    let diff = "";
    for (let i = 0; i < 10; i++) {
      diff += "diff --git a/src/mod" + i + ".ts b/src/mod" + i + ".ts\n";
      diff += "--- a/src/mod" + i + ".ts\n+++ b/src/mod" + i + ".ts\n";
      diff += "@@ -1,10 +1,20 @@\n+function fn" + i + "(x: number): number {\n+  if (x < 0) throw new Error(\"neg\");\n+  return x * 2;\n+}\n const a" + i + " = 1;\n-const b" + i + " = 2;\n+const c" + i + " = 3;\n";
    }
    return diff;
  })(),
};

async function main() {
  console.log("# Intent Recognition Benchmarks\n");
  console.log("| Dataset | Ops/sec | Avg (ms) | P50 (ms) | P99 (ms) | Samples |");
  console.log("|---------|---------|----------|----------|----------|---------|");

  for (const [label, diff] of Object.entries(DIFF_TEMPLATES)) {
    const samples: number[] = [];
    const N = 100;

    for (let i = 0; i < N; i++) {
      const start = performance.now();
      await recognizeIntent(diff, "src/test.ts");
      samples.push(performance.now() - start);
    }

    samples.sort((a, b) => a - b);
    const avg = samples.reduce((a, b) => a + b, 0) / N;
    const p50 = samples[Math.floor(N * 0.5)];
    const p99 = samples[Math.floor(N * 0.99)];
    const opsSec = 1000 / avg;

    console.log(`| ${label} | ${opsSec.toFixed(1)} | ${avg.toFixed(3)} | ${p50.toFixed(3)} | ${p99.toFixed(3)} | ${N} |`);
  }
}

main().catch(console.error);

