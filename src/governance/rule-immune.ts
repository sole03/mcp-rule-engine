/**
 * Copyright 2026 熊高锐
 *
 * Licensed under the Apache License, Version 2.0
 */

/**
 * @file Rule Immune Engine
 * Four immune mechanisms to prevent rule inflation:
 *
 * 1. Cold-start buffer: new rules immune from pruning for 7 days
 * 2. Auto-renewal: Agent checks rules at 90d expiry — with recent matches → auto-renew
 * 3. Archive cold storage: archived rules kept 30 days, revived if semantic boundary triggered
 * 4. Conflict lock: >10% conflict rate → freeze new rule injection
 */

import { getPrismaClient } from "../data/client.js";
import { logger } from "../telemetry/logger.js";
import { ShadowService } from "./shadow-service.js";
import type { Rule, RuleStatus } from "../core/types.js";

const COLD_START_DAYS = 7;
const RENEW_WINDOW_DAYS = 90;
const COLD_STORAGE_DAYS = 30;
const CONFLICT_LOCK_THRESHOLD = 0.10;

export interface ImmuneCheckResult {
  coldStartImmune: number;
  autoRenewed: number;
  archived: number;
  revived: number;
  conflictLocked: boolean;
  summary: string;
}

import type { PrismaClient } from "@prisma/client";
export class RuleImmuneEngine {
  private prisma: PrismaClient;
  constructor(prisma?: PrismaClient) { this.prisma = prisma ?? getPrismaClient(); }
  /**
   * Run a full immune cycle. Call daily via scheduler.
   */
  async runCycle(): Promise<ImmuneCheckResult> {
    const prisma = this.prisma;
    const now = new Date();
    let coldStartImmune = 0;
    let autoRenewed = 0;
    let archived = 0;
    let revived = 0;
    let conflictLocked = false;

    // ── 1. Cold-start: count immune rules ────────────────
    const immuneCount = await prisma.rule.count({
      where: {
        status: "active",
        immunityUntil: { gt: now },
      },
    });
    coldStartImmune = immuneCount;

    // ── 2. Auto-renew: rules expiring within RENEW_WINDOW_DAYS ──
    const expiringSoon = new Date(now.getTime() + RENEW_WINDOW_DAYS * 86400000);
    const expired = new Date(now.getTime()); // already past expiry

    const candidates = await prisma.rule.findMany({
      where: {
        status: "active",
        expiresAt: { lte: expiringSoon },
        // Skip cold-start immune rules
        NOT: { immunityUntil: { gt: now } },
      },
    });

    for (const rule of candidates) {
      // Check if this rule had matches in the last 90 days
      const recentMatchCount = await prisma.metricEvent.count({
        where: {
          eventType: "rule_matched",
          properties: { contains: rule.id },
          createdAt: { gte: new Date(now.getTime() - RENEW_WINDOW_DAYS * 86400000) },
        },
      });

      if (recentMatchCount > 0) {
        // Auto-renew: extend expiresAt by 90 days
        const newExpiry = new Date(now.getTime() + RENEW_WINDOW_DAYS * 86400000);
        await prisma.rule.update({
          where: { id: rule.id },
          data: {
            expiresAt: newExpiry,
            renewCount: (rule as any).renewCount + 1,
          },
        });
        autoRenewed++;
        logger.info({ ruleId: rule.id, renewCount: (rule as any).renewCount + 1, newExpiry }, "rule auto-renewed");
      } else if (rule.expiresAt && new Date(rule.expiresAt) < now) {
        // Expired with no recent matches → archive
        await prisma.rule.update({
          where: { id: rule.id },
          data: {
            status: "cold_storage",
            archivedAt: now,
          },
        });
        archived++;
        logger.info({ ruleId: rule.id }, "rule archived (expired)");
      }
    }

    // ── 3. Cold storage revival: check archived for ghost matches ──
    const coldStorageRules = await prisma.rule.findMany({
      where: {
        status: "cold_storage",
        archivedAt: { gte: new Date(now.getTime() - COLD_STORAGE_DAYS * 86400000) },
      },
    });

    for (const rule of coldStorageRules) {
      // Check if any diff in the cold storage window references this rule's language/tags
      const ghostMatch = await prisma.diffLog.count({
        where: {
          language: rule.language,
          createdAt: { gte: rule.archivedAt ?? now },
        },
      });

      if (ghostMatch > 0) {
        // Revive the rule
        await prisma.rule.update({
          where: { id: rule.id },
          data: {
            status: "active",
            archivedAt: null,
            expiresAt: new Date(now.getTime() + RENEW_WINDOW_DAYS * 86400000),
            immunityUntil: new Date(now.getTime() + COLD_START_DAYS * 86400000),
          },
        });
        revived++;
        logger.info({ ruleId: rule.id, ghostMatch }, "rule revived from cold storage");
      }
    }

    // ── 3b. Purge cold storage rules past 30-day grace ──
    const purgeCutoff = new Date(now.getTime() - COLD_STORAGE_DAYS * 86400000);
    await prisma.rule.deleteMany({
      where: {
        status: "cold_storage",
        archivedAt: { lt: purgeCutoff },
      },
    });

    // ── 4. Conflict lock ────────────────────────────────
    const totalRules = await prisma.rule.count({ where: { status: "active" } });
    const conflictCount = await prisma.conflictRecord.count({
      where: { resolvedAt: null },
    });

    if (totalRules > 0) {
      const conflictRate = conflictCount / totalRules;
      conflictLocked = conflictRate > CONFLICT_LOCK_THRESHOLD;

      if (conflictLocked) {
        logger.warn({ conflictRate, conflictCount, totalRules }, "conflict lock engaged — freezing new rule injection");

        // Record lock event
        await prisma.metricEvent.create({
          data: {
            eventType: "immune_conflict_locked",
            properties: JSON.stringify({ conflictRate, conflictCount, totalRules, timestamp: now.toISOString() }),
          },
        });
      }
    }

    // ── 5. Shadow mode activation ──────────────────────
    const shadowService = new ShadowService(this.prisma);
    const shadowActivated = await shadowService.activateShadowRules();

    const summary = [
      coldStartImmune > 0 ? coldStartImmune + " rules in cold-start buffer" : "",
      autoRenewed > 0 ? autoRenewed + " rules auto-renewed" : "",
      archived > 0 ? archived + " rules archived" : "",
      revived > 0 ? revived + " rules revived from cold storage" : "",
      conflictLocked ? "CONFLICT LOCK ENGAGED" : "conflict rate nominal",
      shadowActivated > 0 ? shadowActivated + " shadow rules activated" : "",
    ].filter(Boolean).join("; ");

    logger.info({
      coldStartImmune, autoRenewed, archived, revived, conflictLocked,
    }, "immune cycle complete: " + (summary || "no changes"));

    return { coldStartImmune, autoRenewed, archived, revived, conflictLocked, summary };
  }

  /**
   * Check if a new rule can be injected given current conflict rate.
   * Returns { allowed, reason }.
   */
  async canInject(): Promise<{ allowed: boolean; reason: string }> {
    const prisma = this.prisma;
    const totalRules = await prisma.rule.count({ where: { status: "active" } });
    const conflictCount = await prisma.conflictRecord.count({ where: { resolvedAt: null } });

    if (totalRules > 0 && conflictCount / totalRules > CONFLICT_LOCK_THRESHOLD) {
      return {
        allowed: false,
        reason: "Conflict rate exceeds " + (CONFLICT_LOCK_THRESHOLD * 100) + "% — resolve existing conflicts before injecting new rules",
      };
    }

    return { allowed: true, reason: "ok" };
  }

  /**
   * Get immune system health stats.
   */
  async getStats(): Promise<{
    coldStartCount: number;
    expiringCount: number;
    coldStorageCount: number;
    conflictRate: number;
    conflictLocked: boolean;
  }> {
    const prisma = this.prisma;
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 86400000);

    const [coldStartCount, expiringCount, coldStorageCount, totalRules, conflictCount] = await Promise.all([
      prisma.rule.count({ where: { status: "active", immunityUntil: { gt: now } } }),
      prisma.rule.count({ where: { status: "active", expiresAt: { lte: in30Days } } }),
      prisma.rule.count({ where: { status: "cold_storage" } }),
      prisma.rule.count({ where: { status: "active" } }),
      prisma.conflictRecord.count({ where: { resolvedAt: null } }),
    ]);

    const conflictRate = totalRules > 0 ? Math.round((conflictCount / totalRules) * 10000) / 10000 : 0;
    const conflictLocked = conflictRate > CONFLICT_LOCK_THRESHOLD;

    return { coldStartCount, expiringCount, coldStorageCount, conflictRate, conflictLocked };
  }
}

/** Singleton */
// Singleton removed — use GovernanceCore.ruleImmuneEngine


export function resetRuleImmuneEngine(): void {
  // No-op — use GovernanceCore.immuneEngine
}


export function getRuleImmuneEngine(): RuleImmuneEngine {
  return new RuleImmuneEngine();
}
