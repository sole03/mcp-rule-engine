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

import { describe, it, expect } from "vitest";
import { StructuredGenerator, RegoPolicySchema } from "../../packages/core/src/proposal/structured-generator.js";

function makeValidPolicy(overrides?: Record<string, unknown>) {
  return {
    id: "00000000-0000-0000-0000-000000000000",
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

describe("StructuredGenerator", () => {
  const generator = new StructuredGenerator();

  // ── validateOutput ──

  it("validateOutput returns success for valid RegoPolicy JSON", () => {
    const valid = makeValidPolicy();
    const result = generator.validateOutput(valid);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(valid.id);
      expect(result.data.name).toBe(valid.name);
      expect(result.data.category).toBe("security");
      expect(result.data.severity).toBe("critical");
      expect(result.data.rego).toContain("package mcp.cognition.security");
      expect(result.data.humanExplanation).toBe(valid.humanExplanation);
    }
  });

  it("validateOutput returns failure for random object missing required fields", () => {
    const invalid = { foo: "bar", baz: 123 };
    const result = generator.validateOutput(invalid);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeTruthy();
      expect(typeof result.error).toBe("string");
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("validateOutput returns failure for object with invalid category", () => {
    const invalid = makeValidPolicy({ category: "invalid-category" });
    const result = generator.validateOutput(invalid);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("category");
    }
  });

  it("validateOutput returns failure for empty string name", () => {
    const invalid = makeValidPolicy({ name: "" });
    const result = generator.validateOutput(invalid);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("name");
    }
  });

  // ── buildPrompt ──

  it("buildPrompt returns non-empty systemPrompt and userPrompt with valid input", () => {
    const input = {
      requirement: "Detect usage of eval() in TypeScript",
      language: "typescript",
    };

    const result = generator.buildPrompt(input);

    expect(result.systemPrompt).toBeTruthy();
    expect(result.systemPrompt.length).toBeGreaterThan(0);
    expect(result.systemPrompt).toContain("Rego policy generator");
    expect(result.userPrompt).toBeTruthy();
    expect(result.userPrompt.length).toBeGreaterThan(0);
    expect(result.userPrompt).toContain(input.requirement);
    expect(result.schema).toBe(RegoPolicySchema);
  });

  it("buildPrompt defaults category to security when not provided", () => {
    const input = {
      requirement: "Detect usage of eval() in TypeScript",
      language: "typescript",
    };

    const result = generator.buildPrompt(input);

    expect(result.systemPrompt).toContain("security policy");
  });

  it("buildPrompt uses explicit category when provided", () => {
    const input = {
      requirement: "Enforce class naming conventions",
      language: "typescript",
      category: "style",
    };

    const result = generator.buildPrompt(input);

    expect(result.systemPrompt).toContain("style policy");
  });

  it("buildPrompt includes few-shot examples in userPrompt when provided", () => {
    const input = {
      requirement: "Detect usage of eval() in TypeScript",
      language: "typescript",
    };

    const example = makeValidPolicy();
    const result = generator.buildPrompt(input, {
      fewShotExamples: [example],
    });

    expect(result.userPrompt).toContain("Few-Shot Examples");
    expect(result.userPrompt).toContain(example.name);
    expect(result.userPrompt).toContain(example.rego);
  });

  it("buildPrompt includes temperature in userPrompt when option set", () => {
    const input = {
      requirement: "Detect usage of eval() in TypeScript",
      language: "typescript",
    };

    const result = generator.buildPrompt(input, { temperature: 0.7 });

    expect(result.userPrompt).toContain("Temperature: 0.7");
  });
});
