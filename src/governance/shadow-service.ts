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
 * @file Shadow Service — 强制影子模式服务
 *
 * Phase 3.1 范式跃迁护栏：
 * - 新规则必须先以影子模式运行 shadowUntil 天，只记录不阻断
 * - 影子期到期自动激活
 * - 提供影子统计供仪表盘消费
 */

import type { PrismaClient } from "@prisma/client";
import { getPrismaClient } from "../data/client.js";
import { logger } from "../telemetry/logger.js";

export interface ShadowStats {
  activeCount: number;
  totalHits: number;
  wouldBlockCount: number;
  expiringToday: number;
}

export class ShadowService {
  private prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? getPrismaClient();
  }

  /**
   * 扫描 shadowUntil < now() 的规则 → 设为 null（激活）→ 发出告警事件。
   * 由 rule-immune.ts 的 runCycle() 调用。
   */
  async activateShadowRules(): Promise<number> {
    const now = new Date();

    const shadowRules = await this.prisma.rule.findMany({
      where: {
        shadowUntil: { not: null, lte: now },
      },
      select: { id: true, shadowUntil: true },
    });

    if (shadowRules.length === 0) return 0;

    // Batch-activate all expired shadow rules
    await this.prisma.rule.updateMany({
      where: {
        shadowUntil: { not: null, lte: now },
      },
      data: {
        shadowUntil: null,
        status: "active",
      },
    });

    // Record activation events
    for (const rule of shadowRules) {
      await this.prisma.metricEvent.create({
        data: {
          eventType: "shadow_rule_activated",
          properties: JSON.stringify({
            ruleId: rule.id,
            shadowUntil: rule.shadowUntil?.toISOString(),
            activatedAt: now.toISOString(),
          }),
        },
      });
    }

    logger.info({ count: shadowRules.length }, "shadow rules auto-activated");
    return shadowRules.length;
  }

  /**
   * 检查规则是否处于影子期。
   * 返回 { inShadow: boolean, shadowUntil: Date | null }
   */
  isRuleInShadow(shadowUntil: Date | null): { inShadow: boolean; shadowUntil: Date | null } {
    if (!shadowUntil) return { inShadow: false, shadowUntil: null };
    const now = new Date();
    return { inShadow: shadowUntil > now, shadowUntil };
  }

  /**
   * 获取影子期统计。
   */
  async getShadowStats(): Promise<ShadowStats> {
    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const [activeShadowRules, totalHitsResult, wouldBlockResult] = await Promise.all([
      this.prisma.rule.count({
        where: { shadowUntil: { not: null, gt: now } },
      }),
      this.prisma.shadowLog.count(),
      this.prisma.shadowLog.count({
        where: { wouldBlock: true },
      }),
    ]);

    const expiringToday = await this.prisma.rule.count({
      where: {
        shadowUntil: { not: null, gt: now, lte: todayEnd },
      },
    });

    return {
      activeCount: activeShadowRules,
      totalHits: totalHitsResult,
      wouldBlockCount: wouldBlockResult,
      expiringToday,
    };
  }
}
