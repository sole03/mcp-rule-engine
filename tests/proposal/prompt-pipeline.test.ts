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

import { describe, it, expect, beforeEach } from "vitest";
import { PromptPipeline } from "../../packages/core/src/proposal/prompt-pipeline.js";
import type { RegoPolicyGenerated } from "../../packages/core/src/proposal/structured-generator.js";

function makePolicy(overrides?: Partial<RegoPolicyGenerated>): RegoPolicyGenerated {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    name: "no-eval-policy",
    description: "Prevents the use of eval() in TypeScript code.",
    category: "security",
    severity: "critical",
    rego: `package mcp.cognition.security

import rego.v1

deny[msg] {
  some input in input.astNodes
  input.nodeType == "CallExpression"
  msg := {
    "key": "security/no-eval",
    "severity": "critical",
    "message": "eval() is forbidden"
  }
}`,
    humanExplanation: "Detects and blocks eval() calls in TypeScript source.",
    ...overrides,
  };
}

describe("PromptPipeline", () => {
  let pipeline: PromptPipeline;

  beforeEach(() => {
    pipeline = new PromptPipeline();
  });

  // ── add and rank ──

  it("add and rank: adds 3 examples, ranks by similarity, best match first", () => {
    pipeline.addExample(
      "Detect usage of eval() in TypeScript",
      makePolicy({ name: "no-eval" }),
      "alice",
    );
    pipeline.addExample(
      "Check for console.log statements in production code",
      makePolicy({ name: "no-console" }),
      "bob",
    );
    pipeline.addExample(
      "Ensure all async functions have try-catch blocks",
      makePolicy({ name: "try-catch-policy" }),
      "alice",
    );

    const ranked = pipeline.rankExamples("Prevent eval usage in TypeScript source");

    expect(ranked.length).toBe(3);
    // Best match should be the eval detection example
    expect(ranked[0].regoPolicy.name).toBe("no-eval");
    expect(ranked[0].score).toBeGreaterThan(0);
    // Sorted descending by score
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    }
  });

  // ── empty pool ──

  it("empty pool: compilePrompt with no examples returns empty fewShots array", () => {
    const result = pipeline.compilePrompt("Detect usage of eval() in TypeScript");

    expect(result.fewShots).toEqual([]);
    expect(result.optimized).toBe(false);
    expect(result.prompt).toContain("Detect usage of eval() in TypeScript");
    expect(result.prompt).not.toContain("Reference Examples");
  });

  // ── maxExamples limit ──

  it("maxExamples limit: adds 5 examples, compilePrompt with maxExamples=2 returns only 2", () => {
    const requirements = [
      "Detect usage of eval() in TypeScript",
      "Check for console.log statements",
      "Ensure all async functions have try-catch",
      "Prevent usage of any type in TypeScript",
      "Enforce strict null checks",
    ];

    for (let i = 0; i < requirements.length; i++) {
      pipeline.addExample(
        requirements[i],
        makePolicy({ name: `policy-${i}` }),
        "alice",
      );
    }

    const result = pipeline.compilePrompt("Detect usage of eval() in TypeScript", 2);

    expect(result.fewShots.length).toBe(2);
    expect(result.optimized).toBe(true);
  });

  // ── exact match ──

  it("exact match: two identical requirements produce similarity near 1.0", () => {
    pipeline.addExample(
      "Detect usage of eval() in TypeScript",
      makePolicy({ name: "no-eval" }),
      "alice",
    );
    pipeline.addExample(
      "Check for console.log statements",
      makePolicy({ name: "no-console" }),
      "bob",
    );

    // Use the exact same requirement string as the first example
    const ranked = pipeline.rankExamples("Detect usage of eval() in TypeScript");

    expect(ranked[0].score).toBeCloseTo(1.0, 1);
    expect(ranked[0].regoPolicy.name).toBe("no-eval");
  });

  // ── score range ──

  it("returns scores in range [0, 1]", () => {
    pipeline.addExample(
      "Detect usage of eval() in TypeScript",
      makePolicy({ name: "no-eval" }),
      "alice",
    );
    pipeline.addExample(
      "Completely different unrelated topic about file system operations",
      makePolicy({ name: "fs-policy" }),
      "carol",
    );

    const ranked = pipeline.rankExamples("Detect usage of eval() in TypeScript");

    for (const ex of ranked) {
      expect(ex.score).toBeGreaterThanOrEqual(0);
      expect(ex.score).toBeLessThanOrEqual(1);
    }
  });

  // ── prompt assembly with few-shots ──

  it("compilePrompt assembles prompt with Reference Examples section when few-shots exist", () => {
    pipeline.addExample(
      "Detect usage of eval() in TypeScript",
      makePolicy({ name: "no-eval" }),
      "alice",
    );

    const result = pipeline.compilePrompt("Detect usage of eval() in TypeScript");

    expect(result.prompt).toContain("Reference Examples");
    expect(result.prompt).toContain("no-eval");
    expect(result.prompt).toContain("Approved by: alice");
    expect(result.prompt).toContain("Detect usage of eval() in TypeScript");
  });

  // ── default maxExamples ──

  it("compilePrompt defaults to maxExamples=3 when not specified", () => {
    for (let i = 0; i < 5; i++) {
      pipeline.addExample(
        `Requirement number ${i} for testing purposes`,
        makePolicy({ name: `policy-${i}` }),
        "alice",
      );
    }

    const result = pipeline.compilePrompt("Requirement number 0 for testing purposes");

    expect(result.fewShots.length).toBe(3);
    expect(result.optimized).toBe(true);
  });
});
