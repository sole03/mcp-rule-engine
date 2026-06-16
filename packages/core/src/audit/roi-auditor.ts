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
 * @file RoiAuditor — 模块 ROI 定期审计器
 *
 * 对指定模块列表执行 ROI 审计，生成模块价值评估报告。
 * 评分模型综合考虑调用频率、测试覆盖率和近期活跃度。
 *
 * 设计原则：
 * - 通过 PrismaClient 注入，不硬编码 getPrismaClient
 * - 测试匹配：cow-sandbox.ts → cow-sandbox.test.ts
 * - invocationCount 从 MetricEvent (eventType = "module_invoke") 估算
 * - 不使用 git 子进程 (sandbox 可能无 git)，改用文件系统 mtime
 */

import type { PrismaClient } from "@prisma/client";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ModuleRoi, RoiReport } from "./types.js";

/**
 * ROI 评分权重配置。
 * 可注入自定义权重以适应不同治理偏好。
 */
export interface RoiWeights {
  /** 调用频率权重 (默认 0.4) */
  invocationWeight: number;
  /** 测试覆盖率权重 (默认 0.3) */
  testWeight: number;
  /** 近期活跃权重 (默认 0.3) */
  activityWeight: number;
}

const DEFAULT_WEIGHTS: RoiWeights = {
  invocationWeight: 0.4,
  testWeight: 0.3,
  activityWeight: 0.3,
};

/**
 * RoiAuditor 配置选项。
 */
export interface RoiAuditorOptions {
  /** 源文件根目录 (用于解析模块路径和查找测试文件) */
  srcRoot: string;
  /** 测试文件根目录 */
  testRoot: string;
  /** 自定义评分权重 */
  weights?: RoiWeights;
  /** 近期活跃阈值 (天)，默认 90 */
  activeDaysThreshold?: number;
}

/**
 * ROI 审计器。
 *
 * 核心评分公式：
 * ```
 * roiScore = (invocationCount > 0 ? min(invocationCount/100, 1) * 0.4 : 0)
 *          + (testCount > 0 ? min(testCount/5, 1) * 0.3 : 0)
 *          + (daysSinceModified < 90 ? 0.3 : 0)
 * ```
 *
 * 判定规则：
 * - roiScore >= 0.6 → HIGH_VALUE
 * - roiScore >= 0.3 → MEDIUM_VALUE
 * - roiScore <  0.3 → LOW_VALUE
 */
export class RoiAuditor {
  private readonly weights: RoiWeights;
  private readonly activeDaysThreshold: number;
  private readonly srcRoot: string;
  private readonly testRoot: string;

  constructor(
    private prisma: PrismaClient,
    options: RoiAuditorOptions,
  ) {
    this.srcRoot = options.srcRoot;
    this.testRoot = options.testRoot;
    this.weights = options.weights ?? DEFAULT_WEIGHTS;
    this.activeDaysThreshold = options.activeDaysThreshold ?? 90;
  }

  /**
   * 对一组模块路径执行 ROI 审计。
   *
   * @param modulePaths - 模块路径列表，如 ["sandbox/cow-sandbox", "dashboard/metrics-collector"]
   * @returns 按 roiScore 降序排列的 ModuleRoi 数组
   */
  async audit(modulePaths: string[]): Promise<ModuleRoi[]> {
    const results = await Promise.all(
      modulePaths.map(p => this.evaluateModule(p)),
    );
    return results.sort((a, b) => b.roiScore - a.roiScore);
  }

  /**
   * 生成完整的 ROI 审计报告。
   *
   * @param modulePaths - 模块路径列表
   * @returns RoiReport 包含所有模块评估和治理建议
   */
  async generateReport(modulePaths: string[]): Promise<RoiReport> {
    const modules = await this.audit(modulePaths);
    const lowValueCount = modules.filter(m => m.verdict === "LOW_VALUE").length;

    let recommendation: string;
    if (lowValueCount === 0) {
      recommendation = "All modules show healthy ROI — no action required.";
    } else if (lowValueCount === 1) {
      const name = modules.find(m => m.verdict === "LOW_VALUE")?.modulePath ?? "unknown";
      recommendation = `1 module marked LOW_VALUE (${name}) — candidate for review.`;
    } else {
      recommendation = `${lowValueCount} modules marked LOW_VALUE — candidates for removal or consolidation.`;
    }

    return {
      generatedAt: new Date().toISOString(),
      modules,
      lowValueCount,
      totalModules: modules.length,
      recommendation,
    };
  }

  // ── Private helpers ──

  /**
   * 评估单个模块的 ROI。
   */
  private async evaluateModule(modulePath: string): Promise<ModuleRoi> {
    const srcPath = path.join(this.srcRoot, `${modulePath}.ts`);
    const [lineCount, lastModified, testCount, invocationCount] = await Promise.all([
      this.countLines(srcPath),
      this.getLastModified(srcPath),
      this.countAssociatedTests(modulePath),
      this.countInvocations(modulePath),
    ]);

    const roiScore = this.computeRoiScore(invocationCount, testCount, lastModified);
    const verdict = this.classify(roiScore);

    return {
      modulePath,
      lineCount,
      lastModified,
      testCount,
      invocationCount,
      roiScore,
      verdict,
    };
  }

  /**
   * 计算 ROI 评分。
   */
  private computeRoiScore(
    invocationCount: number,
    testCount: number,
    lastModified: string,
  ): number {
    const invocationScore =
      invocationCount > 0
        ? Math.min(invocationCount / 100, 1) * this.weights.invocationWeight
        : 0;

    const testScore =
      testCount > 0
        ? Math.min(testCount / 5, 1) * this.weights.testWeight
        : 0;

    const daysSinceModified = this.daysSince(lastModified);
    const activityScore =
      daysSinceModified < this.activeDaysThreshold
        ? this.weights.activityWeight
        : 0;

    return Math.round((invocationScore + testScore + activityScore) * 100) / 100;
  }

  /**
   * 根据 roiScore 判定价值等级。
   */
  private classify(roiScore: number): ModuleRoi["verdict"] {
    if (roiScore >= 0.6) return "HIGH_VALUE";
    if (roiScore >= 0.3) return "MEDIUM_VALUE";
    return "LOW_VALUE";
  }

  /**
   * 统计源文件行数。
   */
  private async countLines(filePath: string): Promise<number> {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return content.split("\n").length;
    } catch {
      return 0;
    }
  }

  /**
   * 获取文件最后修改时间 (ISO 8601)。
   * 使用 fs.statSync 替代 git log，兼容无 git 的 sandbox 环境。
   */
  private async getLastModified(filePath: string): Promise<string> {
    try {
      const stat = fs.statSync(filePath);
      return stat.mtime.toISOString();
    } catch {
      return new Date(0).toISOString(); // epoch fallback
    }
  }

  /**
   * 匹配关联测试文件数量。
   * 规则：cow-sandbox.ts → tests/ 目录中 cow-sandbox.test.ts
   */
  private async countAssociatedTests(modulePath: string): Promise<number> {
    const baseName = path.basename(modulePath); // e.g. "cow-sandbox"
    const testPath = path.join(this.testRoot, `${baseName}.test.ts`);

    try {
      fs.accessSync(testPath, fs.constants.F_OK);
      return 1;
    } catch {
      return 0;
    }
  }

  /**
   * 从 MetricEvent 表统计模块调用次数。
   * 匹配 eventType = "module_invoke" 或 "module_load"，
   * 且 properties.module 包含模块路径。
   */
  private async countInvocations(modulePath: string): Promise<number> {
    try {
      // 统计 module_invoke 事件
      const invokeCount = await this.prisma.metricEvent.count({
        where: { eventType: "module_invoke" },
      });

      // 进一步过滤 properties 中包含当前 modulePath 的记录
      // SQLite 不支持 JSON 内字段过滤，采用后置过滤策略
      const recentEvents = await this.prisma.metricEvent.findMany({
        where: { eventType: { in: ["module_invoke", "module_load"] } },
        select: { properties: true },
        take: 500,
      });

      let matched = 0;
      for (const ev of recentEvents) {
        const p = safeParseJSON(ev.properties);
        if (typeof p?.module === "string" && p.module.includes(modulePath)) {
          matched++;
        }
      }

      // 如果精确匹配很少，回退到粗略计数 (除以模块数)
      if (matched === 0 && invokeCount > 0) {
        return Math.max(1, Math.floor(invokeCount / 20)); // 粗略估算
      }

      return matched;
    } catch {
      return 0;
    }
  }

  /**
   * 计算自给定日期以来的天数。
   */
  private daysSince(isoDate: string): number {
    const then = new Date(isoDate).getTime();
    if (Number.isNaN(then)) return 365;
    const now = Date.now();
    return Math.floor((now - then) / (1000 * 60 * 60 * 24));
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
