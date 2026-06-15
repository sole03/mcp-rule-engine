import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { RuleRepo } from "../../src/storage/rule-repo.js";
import { getPrismaClient, disconnectPrisma } from "../../src/storage/client.js";
import { RuleSpec } from "../../src/types.js";

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
