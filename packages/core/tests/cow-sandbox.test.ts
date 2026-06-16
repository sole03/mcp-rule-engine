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
 * @file CowSandbox 单元测试
 */

import { describe, it, expect } from "vitest";
import { CowSandbox } from "../src/sandbox/cow-sandbox.js";

const sampleCode = `function add(a, b) {\n  return a + b;\n}\n\nconsole.log(add(1, 2));\n`;

describe("CowSandbox", () => {
  it("loads code synchronously", () => {
    const sb = new CowSandbox();
    const sid = sb.loadSync(sampleCode);
    expect(sid).toMatch(/^sandbox_/);
    expect(sb.isLoaded()).toBe(true);
    expect(sb.getContent()).toBe(sampleCode);
  });

  it("creates independent snapshots", () => {
    const sb = new CowSandbox();
    sb.loadSync(sampleCode);
    const sid1 = sb.snapshot();
    const sid2 = sb.snapshot();
    expect(sid1).not.toBe(sid2);
    expect(sb.snapshotCount).toBe(3);
  });

  it("applies a REPLACE patch", () => {
    const sb = new CowSandbox();
    sb.loadSync(sampleCode);
    sb.apply({
      nodeId: "test",
      operations: [{ type: "REPLACE", path: "$", value: "multiply", originalText: "add" }],
      description: "rename",
    });
    const content = sb.getContent();
    expect(content).toContain("multiply");
  });

  it("applies an INSERT patch", () => {
    const sb = new CowSandbox();
    sb.loadSync("const x = 1;");
    sb.apply({
      nodeId: "test",
      operations: [{ type: "INSERT", path: "$", value: "const y = 2;" }],
      description: "add var",
    });
    expect(sb.getContent()).toContain("const y = 2;");
  });

  it("applies a DELETE patch", () => {
    const sb = new CowSandbox();
    sb.loadSync("const debug = true;\nconst prod = false;");
    sb.apply({
      nodeId: "test",
      operations: [{ type: "DELETE", path: "$", originalText: "const debug = true;\n" }],
      description: "remove debug",
    });
    expect(sb.getContent()).not.toContain("debug");
    expect(sb.getContent()).toContain("prod");
  });

  it("reverts to a previous snapshot", () => {
    const sb = new CowSandbox();
    sb.loadSync(sampleCode);
    const sid = sb.snapshot();
    sb.apply({
      nodeId: "test",
      operations: [{ type: "REPLACE", path: "$", value: "broken", originalText: "add" }],
      description: "bad change",
    });
    sb.revert(sid);
    expect(sb.getContent()).toBe(sampleCode);
  });

  it("revert cleans up intermediate snapshots", () => {
    const sb = new CowSandbox();
    sb.loadSync(sampleCode);
    const sid = sb.snapshot();
    sb.snapshot();
    sb.revert(sid);
    expect(sb.snapshotCount).toBeLessThanOrEqual(2);
  });

  it("applyBatch succeeds with all valid patches", () => {
    const sb = new CowSandbox();
    sb.loadSync("const a = 1;\nconst b = 2;");
    const result = sb.applyBatch([
      { nodeId: "t1", operations: [{ type: "REPLACE", path: "$", value: "x", originalText: "a" }], description: "" },
      { nodeId: "t2", operations: [{ type: "REPLACE", path: "$", value: "y", originalText: "b" }], description: "" },
    ]);
    expect(result.applied).toBe(2);
    expect(result.reverted).toBe(0);
    expect(sb.getContent()).toContain("x");
    expect(sb.getContent()).toContain("y");
  });

  it("throws on operations without loading", () => {
    const sb = new CowSandbox();
    expect(() => sb.snapshot()).toThrow("Sandbox not loaded");
    expect(() => sb.getContent()).toThrow("Sandbox not loaded");
  });

  it("reset clears all state", () => {
    const sb = new CowSandbox();
    sb.loadSync(sampleCode);
    sb.snapshot();
    sb.reset();
    expect(sb.isLoaded()).toBe(false);
    expect(sb.snapshotCount).toBe(0);
  });
});
