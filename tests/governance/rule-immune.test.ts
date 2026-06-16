/**
 * Copyright 2026 熊高锐
 *
 * Licensed under the Apache License, Version 2.0
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RuleImmuneEngine, resetRuleImmuneEngine } from "../../src/governance/rule-immune.js";
import { getPrismaClient } from "../../src/data/client.js";

process.env.DATABASE_URL = "file:./prisma/dev.db";

beforeEach(async () => {
  resetRuleImmuneEngine();
  const prisma = getPrismaClient();
  await prisma.metricEvent.deleteMany({ where: { eventType: { startsWith: "immune_" } } });
  await prisma.conflictRecord.deleteMany();
  await prisma.rule.deleteMany();
});

describe("RuleImmuneEngine", () => {
  async function seedRule(overrides: Record<string, unknown> = {}) {
    const prisma = getPrismaClient();
    return prisma.rule.create({
      data: {
        type: "replace",
        pattern: "test-pattern-" + Date.now(),
        suggestion: "test suggestion",
        language: "typescript",
        scope: "project",
        status: "active",
        expiresAt: new Date(Date.now() + 90 * 86400000),
        immunityUntil: new Date(Date.now() + 7 * 86400000),
        ...overrides,
      },
    });
  }

  describe("runCycle", () => {
    it("counts cold-start immune rules", async () => {
      // Seed a rule still in cold-start
      await seedRule({
        immunityUntil: new Date(Date.now() + 3600000), // 1 hour from now
      });

      const engine = new RuleImmuneEngine();
      const result = await engine.runCycle();

      expect(result.coldStartImmune).toBeGreaterThanOrEqual(1);
    });

    it("auto-renews rules with recent matches", async () => {
      const prisma = getPrismaClient();
      const rule = await seedRule({
        expiresAt: new Date(Date.now() + 86400000), // expiring tomorrow
        immunityUntil: new Date(Date.now() - 1000),  // cold-start ended
      });

      // Simulate a recent match
      await prisma.metricEvent.create({
        data: {
          eventType: "rule_matched",
          properties: JSON.stringify({ ruleId: rule.id, matchCount: 1 }),
        },
      });

      const engine = new RuleImmuneEngine();
      const result = await engine.runCycle();

      expect(result.autoRenewed).toBe(1);

      const updated = await prisma.rule.findUnique({ where: { id: rule.id } });
      expect(updated).not.toBeNull();
      expect((updated as any).renewCount).toBe(1);
    });

    it("archives expired rules with no recent matches", async () => {
      const prisma = getPrismaClient();
      const rule = await seedRule({
        expiresAt: new Date(Date.now() - 1000), // already expired
        immunityUntil: new Date(Date.now() - 1000), // cold-start ended
      });

      const engine = new RuleImmuneEngine();
      const result = await engine.runCycle();

      expect(result.archived).toBe(1);

      const updated = await prisma.rule.findUnique({ where: { id: rule.id } });
      expect(updated?.status).toBe("cold_storage");
    });

    it("revives cold storage rules when ghost matches found", async () => {
      const prisma = getPrismaClient();
      const rule = await seedRule({
        status: "cold_storage",
        archivedAt: new Date(Date.now() - 3600000), // 1 hour ago
        language: "python",
      });

      // Create a diff log with matching language
      await prisma.diffLog.create({
        data: {
          filePath: "/test/foo.py",
          fileExtension: "py",
          language: "python",
          originalHash: "abc",
          modifiedHash: "def",
          diffContent: "test",
          diffType: "replace",
        },
      });

      const engine = new RuleImmuneEngine();
      const result = await engine.runCycle();

      expect(result.revived).toBe(1);

      const updated = await prisma.rule.findUnique({ where: { id: rule.id } });
      expect(updated?.status).toBe("active");
    });
  });

  describe("canInject", () => {
    it("allows injection when conflict rate is low", async () => {
      // Seed 10 active rules with no conflicts
      for (let i = 0; i < 10; i++) {
        await seedRule({ pattern: "test-" + i });
      }

      const engine = new RuleImmuneEngine();
      const result = await engine.canInject();

      expect(result.allowed).toBe(true);
    });

    it("blocks injection when conflict rate exceeds threshold", async () => {
      const prisma = getPrismaClient();

      // Seed 4 rules
      const rules = [];
      for (let i = 0; i < 4; i++) {
        rules.push(await seedRule({ pattern: "conflict-test-" + i }));
      }

      // Create 2 unresolved conflicts (>10% of 4 = 40%)
      await prisma.conflictRecord.createMany({
        data: [
          { ruleAId: rules[0].id, ruleBId: rules[1].id, scopeKey: "test:1" },
          { ruleAId: rules[2].id, ruleBId: rules[3].id, scopeKey: "test:2" },
        ],
      });

      const engine = new RuleImmuneEngine();
      const result = await engine.canInject();

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Conflict rate exceeds");
    });
  });

  describe("getStats", () => {
    it("returns immune health stats", async () => {
      await seedRule({
        immunityUntil: new Date(Date.now() + 3600000),
        expiresAt: new Date(Date.now() + 86400000),
      });

      const engine = new RuleImmuneEngine();
      const stats = await engine.getStats();

      expect(stats.coldStartCount).toBeGreaterThanOrEqual(1);
      expect(stats.conflictRate).toBeGreaterThanOrEqual(0);
      expect(typeof stats.conflictLocked).toBe("boolean");
    });
  });
});
