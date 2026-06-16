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
 * @file Dashboard Tests — MetricsCollector + Alert evaluation
 */

import { describe, it, expect, vi } from "vitest";
import {
  MetricsCollector,
  DEFAULT_ALERT_RULES,
} from "../src/dashboard/metrics-collector.js";

function mockPrisma(overrides: Record<string, any> = {}) {
  return {
    cognitionNode: { count: vi.fn().mockResolvedValue(overrides.nodeCount ?? 50) },
    cognitionEdge: { count: vi.fn().mockResolvedValue(overrides.edgeCount ?? 120) },
    rule: { count: vi.fn().mockResolvedValue(overrides.ruleCount ?? 30) },
    proposal: {
      count: vi.fn().mockImplementation((args: any) => {
        if (args?.where?.status === "PENDING") return Promise.resolve(overrides.pendingCount ?? 3);
        if (args?.where?.status === "APPROVED") return Promise.resolve(overrides.approved ?? 10);
        if (args?.where?.status === "REJECTED") return Promise.resolve(overrides.rejected ?? 2);
        if (args?.where?.status?.in) return Promise.resolve(overrides.otherCount ?? 1);
        return Promise.resolve(0);
      }),
    },
    conflictRecord: {
      count: vi.fn().mockResolvedValue(overrides.conflictCount ?? 5),
      findMany: vi.fn().mockResolvedValue(overrides.conflicts ?? []),
    },
    metricEvent: {
      findMany: vi.fn().mockResolvedValue(overrides.events ?? []),
      count: vi.fn().mockResolvedValue(overrides.eventCount ?? 0),
      create: vi.fn().mockResolvedValue({}),
    },
    $disconnect: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe("MetricsCollector", () => {
  describe("snapshot()", () => {
    it("returns complete DashboardSnapshot structure", async () => {
      const prisma = mockPrisma();
      const collector = new MetricsCollector(prisma);
      const snap = await collector.snapshot();

      expect(snap).toHaveProperty("timestamp");
      expect(snap).toHaveProperty("version");
      expect(snap).toHaveProperty("cognition");
      expect(snap).toHaveProperty("amygdala");
      expect(snap).toHaveProperty("selfHeal");
      expect(snap).toHaveProperty("arbitration");
      expect(snap).toHaveProperty("governance");
      expect(snap).toHaveProperty("alerts");

      expect(snap.cognition).toHaveProperty("nodeCount");
      expect(snap.cognition).toHaveProperty("edgeCount");
      expect(snap.amygdala.fatigueLevel).toMatch(/NORMAL|ELEVATED|CRITICAL/);
      expect(snap.selfHeal).toHaveProperty("safetyValveTripped");
    });

    it("returns valid ISO timestamp", async () => {
      const prisma = mockPrisma();
      const collector = new MetricsCollector(prisma);
      const snap = await collector.snapshot();
      const date = new Date(snap.timestamp);
      expect(date.getTime()).not.toBeNaN();
    });

    it("detects CRITICAL fatigue when triggered > 40 in 24h", async () => {
      const triggers = Array.from({ length: 45 }, (_, i) => ({
        eventType: "amygdala_triggered",
        properties: JSON.stringify({ riskScore: 0.8, reason: "test-" + i }),
        createdAt: new Date(),
      }));
      const prisma = mockPrisma({ events: triggers });
      const collector = new MetricsCollector(prisma);
      const snap = await collector.snapshot();
      expect(snap.amygdala.triggeredCount24h).toBe(45);
      expect(snap.amygdala.fatigueLevel).toBe("CRITICAL");
    });

    it("computes self-heal success rate", async () => {
      const events = [
        { eventType: "self_heal_success", properties: JSON.stringify({ durationMs: 50, confidence: 0.9 }), createdAt: new Date() },
        { eventType: "self_heal_success", properties: JSON.stringify({ durationMs: 30, confidence: 0.8 }), createdAt: new Date() },
        { eventType: "self_heal_revert", properties: JSON.stringify({ durationMs: 20, confidence: 0.5 }), createdAt: new Date() },
      ];
      const prisma = mockPrisma({ events });
      const collector = new MetricsCollector(prisma);
      const snap = await collector.snapshot();
      expect(snap.selfHeal.totalAttempts).toBe(3);
      expect(snap.selfHeal.successRate).toBeCloseTo(2 / 3, 1);
      expect(snap.selfHeal.revertRate).toBeCloseTo(1 / 3, 1);
    });
  });

  describe("getEvents()", () => {
    it("returns events with parsed properties", async () => {
      const events = [
        { id: "e1", eventType: "test_a", properties: null, createdAt: new Date("2026-01-01") },
        { id: "e2", eventType: "test_b", properties: '{"key":"val"}', createdAt: new Date("2026-01-02") },
      ];
      const prisma = mockPrisma({ events });
      const collector = new MetricsCollector(prisma);
      const result = await collector.getEvents(10);
      expect(result).toHaveLength(2);
      expect(result[1].properties).toEqual({ key: "val" });
    });
  });

  describe("alerts", () => {
    it("triggers CRITICAL when fatigue is CRITICAL", async () => {
      const triggers = Array.from({ length: 50 }, (_, i) => ({
        eventType: "amygdala_triggered",
        properties: JSON.stringify({ riskScore: 0.9, reason: "test-" + i }),
        createdAt: new Date(),
      }));
      const prisma = mockPrisma({ events: triggers });
      const collector = new MetricsCollector(prisma);
      const snap = await collector.snapshot();
      const alert = snap.alerts.find(a => a.metric === "amygdala.fatigueLevel");
      expect(alert).toBeDefined();
      expect(alert?.severity).toBe("CRITICAL");
    });

    it("triggers WARN when revert rate > 30%", async () => {
      const events = [
        { eventType: "self_heal_success", properties: "{}", createdAt: new Date() },
        { eventType: "self_heal_success", properties: "{}", createdAt: new Date() },
        { eventType: "self_heal_revert", properties: "{}", createdAt: new Date() },
        { eventType: "self_heal_revert", properties: "{}", createdAt: new Date() },
        { eventType: "self_heal_revert", properties: "{}", createdAt: new Date() },
        { eventType: "self_heal_revert", properties: "{}", createdAt: new Date() },
      ];
      const prisma = mockPrisma({ events });
      const collector = new MetricsCollector(prisma);
      const snap = await collector.snapshot();
      const alert = snap.alerts.find(a => a.metric === "selfHeal.revertRate");
      expect(alert).toBeDefined();
      expect(alert?.severity).toBe("WARN");
    });
  });

  describe("DEFAULT_ALERT_RULES", () => {
    it("covers all 4 subsystems", () => {
      expect(DEFAULT_ALERT_RULES).toHaveLength(6);
      const categories = DEFAULT_ALERT_RULES.map(r => r.metric.split(".")[0]);
      expect(categories).toContain("amygdala");
      expect(categories).toContain("selfHeal");
      expect(categories).toContain("arbitration");
      expect(categories).toContain("governance");
      expect(categories).toContain("cognition");
    });
  });
});
