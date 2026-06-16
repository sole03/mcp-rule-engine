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
import { evaluateRuleCandidate } from "../../src/analysis/rule-generator.js";
import { AtomicOp } from "../../src/core/types.js";

describe("Rule Generator", () => {
  it("should not generate rule when ops are below thresholds", () => {
    const ops: AtomicOp[] = [
      { type: "UPDATE", nodeType: "identifier", originalText: "foo", modifiedText: "bar", startByte: 0, endByte: 5 },
    ];
    const result = evaluateRuleCandidate(ops, "typescript", 2, 1, 2);
    expect(result.generate).toBe(false);
    expect(result.reason).toContain("below threshold");
  });

  it("should generate rule when distinct files threshold met", () => {
    const ops: AtomicOp[] = [
      { type: "UPDATE", nodeType: "identifier", originalText: "foo", modifiedText: "bar", startByte: 0, endByte: 5 },
    ];
    const result = evaluateRuleCandidate(ops, "typescript", 3, 1, 5);
    expect(result.generate).toBe(true);
    expect(result.ruleCandidate).toBeDefined();
    expect(result.ruleCandidate!.type).toBe("replace");
    expect(result.ruleCandidate!.pattern).toContain("foo");
  });

  it("should generate rule when repeat count threshold met", () => {
    const ops: AtomicOp[] = [
      { type: "UPDATE", nodeType: "identifier", originalText: "oldName", modifiedText: "newName", startByte: 0, endByte: 10 },
    ];
    const result = evaluateRuleCandidate(ops, "typescript", 1, 5, 5);
    expect(result.generate).toBe(true);
    expect(result.reason).toContain("repeat");
  });

  it("should not generate rule for INSERT-only with low occurrence", () => {
    const ops: AtomicOp[] = [
      { type: "INSERT", nodeType: "comment", modifiedText: "// TODO", startByte: 0, endByte: 7 },
    ];
    const result = evaluateRuleCandidate(ops, "typescript", 1, 1, 2);
    expect(result.generate).toBe(false);
  });

  it("should return low confidence when many operations", () => {
    const ops: AtomicOp[] = [
      { type: "UPDATE", nodeType: "line", originalText: "l1", modifiedText: "nl1", startByte: 0, endByte: 3 },
      { type: "UPDATE", nodeType: "line", originalText: "l2", modifiedText: "nl2", startByte: 0, endByte: 3 },
      { type: "UPDATE", nodeType: "line", originalText: "l3", modifiedText: "nl3", startByte: 0, endByte: 3 },
      { type: "INSERT", nodeType: "line", modifiedText: "newLine", startByte: 0, endByte: 0 },
    ];
    const result = evaluateRuleCandidate(ops, "typescript", 3, 1, 5);
    expect(result.ruleCandidate?.confidence).toBe("low");
  });
});

