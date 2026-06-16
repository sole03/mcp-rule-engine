/**
 * Copyright 2026 熊高锐
 *
 * Licensed under the Apache License, Version 2.0
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SatisfactionTracker } from "../../packages/core/src/audit/satisfaction-tracker.js";
import type { SatisfactionEntry } from "../../packages/core/src/audit/types.js";
import { getPrismaClient } from "../../src/data/client.js";

beforeEach(async () => {
  const prisma = getPrismaClient();
  await prisma.metricEvent.deleteMany();
});

describe("SatisfactionTracker", () => {
  function makeTracker(options?: { trendWindowDays?: number; attentionThreshold?: number }) {
    return new SatisfactionTracker(getPrismaClient(), options);
  }

  describe("record", () => {
    it("stores an entry and can be retrieved via getMetrics", async () => {
      const tracker = makeTracker();
      await tracker.record(4);

      const metrics = await tracker.getMetrics();
      expect(metrics.recentScores).toHaveLength(1);
      expect(metrics.recentScores[0].score).toBe(4);
    });

    it("throws for scores below 1", async () => {
      const tracker = makeTracker();
      await expect(tracker.record(0)).rejects.toThrow("Invalid satisfaction score");
    });

    it("throws for scores above 5", async () => {
      const tracker = makeTracker();
      await expect(tracker.record(6)).rejects.toThrow("Invalid satisfaction score");
    });

    it("throws for non-integer scores", async () => {
      const tracker = makeTracker();
      await expect(tracker.record(3.5)).rejects.toThrow("Invalid satisfaction score");
    });

    it("stores optional feedback and source", async () => {
      const tracker = makeTracker();
      await tracker.record(3, "too complex", "cli");

      const metrics = await tracker.getMetrics();
      expect(metrics.recentScores).toHaveLength(1);
      expect(metrics.recentScores[0].score).toBe(3);
      expect(metrics.recentScores[0].feedback).toBe("too complex");
      expect(metrics.recentScores[0].source).toBe("cli");
    });

    it("defaults source to mcp when omitted", async () => {
      const tracker = makeTracker();
      await tracker.record(5);

      const metrics = await tracker.getMetrics();
      expect(metrics.recentScores[0].source).toBe("mcp");
    });
  });

  describe("getMetrics", () => {
    it("empty tracker returns averageScore=0 and trend=STABLE", async () => {
      const tracker = makeTracker();
      const metrics = await tracker.getMetrics();

      expect(metrics.recentScores).toHaveLength(0);
      expect(metrics.averageScore).toBe(0);
      expect(metrics.trend).toBe("STABLE");
      expect(metrics.needsAttention).toBe(false);
    });

    it("single entry returns that score as average and STABLE trend", async () => {
      const tracker = makeTracker();
      await tracker.record(4);

      const metrics = await tracker.getMetrics();
      expect(metrics.averageScore).toBe(4);
      expect(metrics.trend).toBe("STABLE");
    });

    it("computes correct average for multiple entries", async () => {
      const tracker = makeTracker();
      await tracker.record(1);
      await tracker.record(5);

      const metrics = await tracker.getMetrics();
      expect(metrics.averageScore).toBe(3);
      expect(metrics.recentScores).toHaveLength(2);
    });

    it("trend is STABLE when all scores are equal", async () => {
      const tracker = makeTracker();
      await tracker.record(4);
      await tracker.record(4);
      await tracker.record(4);
      await tracker.record(4);
      await tracker.record(4);

      const metrics = await tracker.getMetrics();
      expect(metrics.trend).toBe("STABLE");
    });

    it("trend is DECLINING with scores 5,4,3,2,1", async () => {
      const tracker = makeTracker();
      // Record in descending order
      await tracker.record(5);
      await tracker.record(4);
      await tracker.record(3);
      await tracker.record(2);
      await tracker.record(1);

      const metrics = await tracker.getMetrics();
      expect(metrics.trend).toBe("DECLINING");
    });

    it("trend is IMPROVING with scores 1,2,3,4,5", async () => {
      const tracker = makeTracker();
      await tracker.record(1);
      await tracker.record(2);
      await tracker.record(3);
      await tracker.record(4);
      await tracker.record(5);

      const metrics = await tracker.getMetrics();
      expect(metrics.trend).toBe("IMPROVING");
    });

    it("needsAttention is true when average is low and has multiple entries", async () => {
      const tracker = makeTracker({ attentionThreshold: 3 });
      await tracker.record(2);
      await tracker.record(2);
      await tracker.record(2);

      const metrics = await tracker.getMetrics();
      expect(metrics.averageScore).toBe(2);
      expect(metrics.needsAttention).toBe(true);
    });

    it("needsAttention is false when average is at or above threshold", async () => {
      const tracker = makeTracker({ attentionThreshold: 3 });
      await tracker.record(3);
      await tracker.record(3);

      const metrics = await tracker.getMetrics();
      expect(metrics.averageScore).toBe(3);
      expect(metrics.needsAttention).toBe(false);
    });

    it("needsAttention is false with a single entry even if score is low", async () => {
      const tracker = makeTracker({ attentionThreshold: 3 });
      await tracker.record(1);

      const metrics = await tracker.getMetrics();
      expect(metrics.needsAttention).toBe(false);
    });
  });
});
