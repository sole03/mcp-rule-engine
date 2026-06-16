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
 * @file DI Container 单元测试
 * 覆盖率：生产容器、测试容器、默认值
 */

import { describe, it, expect } from "vitest";
import { createTestContainer } from "../src/di/container.js";

describe("DI Container", () => {
  it("creates a test container with all subsystems", () => {
    const c = createTestContainer();

    expect(c.eventBus).toBeDefined();
    expect(c.cognitionRepo).toBeDefined();
    expect(c.ruleRepo).toBeDefined();
    expect(c.diffLogRepo).toBeDefined();
    expect(c.conflictRepo).toBeDefined();
    expect(c.metricRepo).toBeDefined();
    expect(c.policyEngine).toBeDefined();
    expect(c.immuneEngine).toBeDefined();
    expect(c.workflowService).toBeDefined();
    expect(c.vectorStore).toBeDefined();
    expect(c.embeddingService).toBeDefined();
  });

  it("test container eventBus is functional", async () => {
    const c = createTestContainer();
    let called = false;
    c.eventBus.on("test", () => { called = true; });
    c.eventBus.emit({ type: "test", payload: {} }, true);
    expect(called).toBe(true);
  });

  it("test container policyEngine defaults to allow-all", () => {
    const c = createTestContainer();
    const result = c.policyEngine.evaluate({ toolName: "any" });
    expect(result.allowed).toBe(true);
    expect(result.requiresApproval).toBe(false);
  });

  it("test container cognitionRepo returns empty by default", async () => {
    const c = createTestContainer();
    const nodes = await c.cognitionRepo.findNodesBySemanticHash("any");
    expect(nodes).toEqual([]);
  });

  it("allows overriding specific subsystems", () => {
    const mockPolicy = {
      loadPolicies: () => {},
      evaluate: () => ({ allowed: false, requiresApproval: true, warnings: ["mock"], matchedPolicies: [] }),
      getActivePolicies: () => [],
      getAllPolicies: () => [],
    };

    const c = createTestContainer({ policyEngine: mockPolicy });
    const result = c.policyEngine.evaluate({ toolName: "test" });
    expect(result.allowed).toBe(false);
    expect(result.warnings).toEqual(["mock"]);

    // 其他子系统仍然是默认 mock
    expect(c.cognitionRepo).toBeDefined();
  });

  it("each container instance has independent eventBus", () => {
    const c1 = createTestContainer();
    const c2 = createTestContainer();

    let c1Called = false;
    let c2Called = false;
    c1.eventBus.on("test", () => { c1Called = true; });
    c2.eventBus.on("test", () => { c2Called = true; });

    c1.eventBus.emit({ type: "test", payload: {} }, true);
    expect(c1Called).toBe(true);
    expect(c2Called).toBe(false);
  });
});
