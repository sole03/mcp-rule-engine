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
 * @file SatisfactionTracker — "足够好"原则守护器
 *
 * 记录开发者满意度评分并计算聚合指标。
 * 当平均满意度 < 3 持续 2 周以上时触发 needsAttention 标志。
 *
 * 设计原则：
 * - 通过 PrismaClient 注入，不硬编码 getPrismaClient
 * - 存储到 MetricEvent (eventType: "developer_satisfaction")
 * - 读取最近 2 周数据计算趋势
 * - 与 MetricsCollector 协作，needsAttention 时生成 WARN 告警
 */

import type { PrismaClient } from "@prisma/client";
import type { SatisfactionEntry, SatisfactionMetrics } from "./types.js";

/**
 * 满意度追踪器配置。
 */
export interface SatisfactionTrackerOptions {
  /** 趋势分析窗口 (天)，默认 14 */
  trendWindowDays?: number;
  /** 关注阈值 (平均分低于此值触发 needsAttention)，默认 3 */
  attentionThreshold?: number;
}

/**
 * 满意度追踪器。
 *
 * 核心逻辑：
 * - 记录：将评分写入 MetricEvent (eventType = "developer_satisfaction")
 * - 指标：读取最近 2 周数据，计算平均分和趋势
 * - 趋势判定：对比前一周 vs 最近一周的平均分变化
 * - needsAttention：avg < 3 持续 2 周以上
 */
export class SatisfactionTracker {
  private readonly trendWindowDays: number;
  private readonly attentionThreshold: number;

  constructor(
    private prisma: PrismaClient,
    options?: SatisfactionTrackerOptions,
  ) {
    this.trendWindowDays = options?.trendWindowDays ?? 14;
    this.attentionThreshold = options?.attentionThreshold ?? 3;
  }

  /**
   * 记录一条开发者满意度评分。
   *
   * @param score - 满意度评分 (1-5)
   * @param feedback - 可选反馈文字
   * @param source - 提交来源 ("mcp" | "cli" | "dashboard")
   */
  async record(
    score: number,
    feedback?: string,
    source = "mcp",
  ): Promise<void> {
    if (score < 1 || score > 5 || !Number.isInteger(score)) {
      throw new Error(`Invalid satisfaction score: ${score}. Must be an integer 1-5.`);
    }

    await this.prisma.metricEvent.create({
      data: {
        eventType: "developer_satisfaction",
        properties: JSON.stringify({
          score,
          feedback: feedback ?? null,
          source,
          timestamp: new Date().toISOString(),
        }),
      },
    });
  }

  /**
   * 获取满意度聚合指标。
   *
   * 基于最近 trendWindowDays 天的数据计算：
   * - 平均满意度评分
   * - 趋势方向 (IMPROVING / STABLE / DECLINING)
   * - 是否需要关注
   *
   * @returns SatisfactionMetrics 包含完整指标
   */
  async getMetrics(): Promise<SatisfactionMetrics> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - this.trendWindowDays * 24 * 60 * 60 * 1000);

    const events = await this.prisma.metricEvent.findMany({
      where: {
        eventType: "developer_satisfaction",
        createdAt: { gte: windowStart },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const recentScores: SatisfactionEntry[] = [];
    for (const ev of events) {
      const p = safeParseJSON(ev.properties);
      if (p && typeof p.score === "number" && p.score >= 1 && p.score <= 5) {
        recentScores.push({
          score: p.score as SatisfactionEntry["score"],
          feedback: typeof p.feedback === "string" ? p.feedback : undefined,
          timestamp: ev.createdAt.toISOString(),
          source: typeof p.source === "string" ? p.source : "unknown",
        });
      }
    }

    const averageScore =
      recentScores.length > 0
        ? Math.round(
            (recentScores.reduce((sum, e) => sum + e.score, 0) / recentScores.length) * 100,
          ) / 100
        : 0;

    const trend = this.computeTrend(recentScores);

    // needsAttention: avg < threshold 持续整个窗口
    const needsAttention =
      recentScores.length >= 2 && averageScore < this.attentionThreshold;

    return {
      recentScores,
      averageScore,
      trend,
      needsAttention,
    };
  }

  // ── Private ──

  /**
   * 计算满意度趋势。
   *
   * 将最近记录按窗口中点分为前后两半，
   * 比较后半段平均分 vs 前半段平均分。
   */
  private computeTrend(entries: SatisfactionEntry[]): SatisfactionMetrics["trend"] {
    if (entries.length < 2) return "STABLE";

    const sorted = [...entries].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    const mid = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, mid);
    const secondHalf = sorted.slice(mid);

    const firstAvg = firstHalf.reduce((s, e) => s + e.score, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, e) => s + e.score, 0) / secondHalf.length;

    const diff = secondAvg - firstAvg;

    if (diff > 0.5) return "IMPROVING";
    if (diff < -0.5) return "DECLINING";
    return "STABLE";
  }
}

// ── Helpers ──

function safeParseJSON(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
