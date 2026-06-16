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

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { RuleRepo } from "../../src/data/rule-repo.js";
import { getPrismaClient, disconnectPrisma } from "../../src/data/client.js";
import { RuleSpec } from "../../src/core/types.js";

describe("RuleRepo — Batch Transaction", () => {
  const repo = new RuleRepo();

  afterAll(async () => {
    await disconnectPrisma();
  });

  it("should create multiple rules in a transaction", async () => {
    const specs: (RuleSpec & { projectId?: string })[] = [
      { type: "replace", pattern: "foo", suggestion: "bar", language: "typescript" },
      { type: "replace", pattern: "baz", suggestion: "qux", language: "typescript" },
      { type: "convention", pattern: "oldApi", suggestion: "newApi", language: "typescript" },
    ];
    const rules = await repo.batchCreate(specs);
    expect(rules).toHaveLength(3);
    for (const r of rules) {
      expect(r.id).toBeDefined();
      expect(r.status).toBe("active");
    }
  });

  it("should handle empty batch", async () => {
    const rules = await repo.batchCreate([]);
    expect(rules).toHaveLength(0);
  });

  it("should create rules with different scopes", async () => {
    const specs: (RuleSpec & { projectId?: string })[] = [
      { type: "replace", pattern: "p1", suggestion: "s1", language: "typescript", scope: "project" },
      { type: "replace", pattern: "p2", suggestion: "s2", language: "typescript", scope: "user" },
      { type: "replace", pattern: "p3", suggestion: "s3", language: "typescript", scope: "global" },
    ];
    const rules = await repo.batchCreate(specs);
    expect(rules).toHaveLength(3);
    expect(rules[0].scope).toBe("project");
    expect(rules[1].scope).toBe("user");
    expect(rules[2].scope).toBe("global");
  });

  it("should be idempotent — repeated call creates separate entries", async () => {
    const spec: RuleSpec & { projectId?: string } = { type: "replace", pattern: "idempotent", suggestion: "test", language: "typescript" };
    const r1 = await repo.batchCreate([spec]);
    const r2 = await repo.batchCreate([spec]);
    expect(r1[0].id).not.toBe(r2[0].id); // Different UUIDs
  });
});
