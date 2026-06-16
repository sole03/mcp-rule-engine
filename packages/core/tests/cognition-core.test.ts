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
 * @file CognitionCore 单元测试
 */

import { describe, it, expect } from "vitest";
import { CognitionCore } from "../src/cognition/cognition-core.js";
import { createTestContainer } from "../src/di/container.js";

describe("CognitionCore", () => {
  it("creates a core with test container", () => {
    const container = createTestContainer();
    const core = new CognitionCore(container);
    expect(core).toBeDefined();
    expect(core.getContainer()).toBe(container);
  });

  it("starts without error", async () => {
    const container = createTestContainer();
    const core = new CognitionCore(container);
    await expect(core.start()).resolves.toBeUndefined();
  });

  it("lists empty handlers on new core", () => {
    const container = createTestContainer();
    const core = new CognitionCore(container);
    expect(core.listHandlers()).toEqual([]);
  });

  it("registers and invokes a handler", async () => {
    const container = createTestContainer();
    const core = new CognitionCore(container);

    core.registerHandler("my_tool", async (input, cid) => ({
      content: [{ type: "text", text: JSON.stringify({ ok: true, cid }) }],
    }));

    expect(core.listHandlers()).toEqual(["my_tool"]);

    const result = await core.execute({ tool: "my_tool", input: { foo: "bar" }, correlationId: "test-001" });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(true);
    expect(parsed.cid).toBe("test-001");
    // 策略无警告时，元数据不会被注入到 JSON body
    expect(result._meta?.correlationId).toBe("test-001");
  });

  it("returns error for unregistered tool", async () => {
    const container = createTestContainer();
    const core = new CognitionCore(container);

    const result = await core.execute({ tool: "nonexistent", input: {} });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("No handler registered");
  });

  it("blocks execution when policy rejects", async () => {
    const container = createTestContainer();
    container.policyEngine.evaluate = () => ({
      allowed: false,
      requiresApproval: true,
      warnings: ["Blocked by test policy"],
      matchedPolicies: [{ policyId: "test-block", policyName: "Test Block" }],
    });

    const core = new CognitionCore(container);
    core.registerHandler("any_tool", async () => ({
      content: [{ type: "text", text: "should not reach" }],
    }));

    const result = await core.execute({ tool: "any_tool", input: {} });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Blocked by policy");
  });

  it("registers multiple handlers via registerHandlers", () => {
    const container = createTestContainer();
    const core = new CognitionCore(container);

    core.registerHandlers({
      tool_a: async () => ({ content: [{ type: "text", text: "a" }] }),
      tool_b: async () => ({ content: [{ type: "text", text: "b" }] }),
    });

    expect(core.listHandlers()).toContain("tool_a");
    expect(core.listHandlers()).toContain("tool_b");
  });

  it("shuts down cleanly", async () => {
    const container = createTestContainer();
    const core = new CognitionCore(container);
    await core.start();
    await expect(core.shutdown()).resolves.toBeUndefined();
  });
});
