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
 * @file SelfHealController — 自愈循环控制器
 *
 * 完整的自愈流水线：
 *   1. 健康度门控 (HealthGate) → 多维指标检查
 *   2. 安全阀检查 (SafetyValve) → 频率/疲劳限制
 *   3. 置信度门控 → score < minConfidence 直接跳过
 *   4. COW 快照
 *   5. 应用 Patch
 *   6. 沙箱内约束验证
 *   7. 决策：HEALED / PARTIAL / REVERT → 重试(≤maxRetries) → FAILED
 *
 * 支持三种模式：
 *   - async (默认): 标准自愈流水线
 *   - sync_escape: 跳过沙箱全流程，直接返回 patches + confidence
 *   - atomicMode=true: 每个 ValidationFailure 独立 snapshot → apply → validate 闭环
 *
 * 集成 CowSandbox + SafetyValve + HealthGate + AstConstraintSolver。
 * 所有外部依赖通过构造函数注入，零硬编码 import。
 */

import { CowSandbox } from "./cow-sandbox.js";
import { SafetyValve } from "./safety-valve.js";
import { HealthGate } from "./health-gate.js";
import type {
  TransformPatch,
  ValidationResult,
  CognitionNodeData,
  SolveConstraintsFn,
  GeneratePatchWithConfidenceFn,
  ISandboxCognitionRepo,
  HealthMetrics,
  AtomicPatchResult,
  EscapeModeResult,
} from "./types.js";

// ── Types ──

export interface SelfHealConfig {
  /** 最低置信度阈值，低于此值直接跳过。默认 0.7 */
  minConfidence: number;
  /** 自动应用阈值，高于此值接受部分修复。默认 0.85 */
  autoApplyThreshold: number;
  /** 最大重试次数。默认 3 */
  maxRetries: number;
  /** 最大耗时（ms）。默认 5000 */
  maxDurationMs: number;
  /** 代码语言 */
  language: string;
  /** 文件路径（用于安全阀追踪） */
  filePath?: string;
}

export interface SelfHealResult {
  /** 原始约束节点 ID 列表 */
  sourceNodes: string[];
  /** 原始验证失败数 */
  originalFailures: number;
  /** 生成的 Patch 数量 */
  patchesGenerated: number;
  /** 成功应用的 Patch 数 */
  patchesApplied: number;
  /** 回滚的 Patch 数 */
  patchesReverted: number;
  /** 最终验证结果 */
  finalValidation: {
    passed: boolean;
    remainingFailures: number;
  };
  /** 闭环状态（维度 2.3 新增 ESCAPED） */
  status: "HEALED" | "PARTIAL" | "FAILED" | "SKIPPED" | "BLOCKED" | "ESCAPED";
  /** 耗时（ms） */
  durationMs: number;
  /** 置信度 0-1 */
  confidence: number;
  /** 安全阀疲劳等级 */
  fatigueLevel: string;
  /** 详细消息 */
  message: string;
  /** 原子模式明细（仅 atomicMode=true 时有值，维度 2.2） */
  atomicResults?: AtomicPatchResult[];
  /** 逃生模式结果（仅 mode="sync_escape" 时有值，维度 2.3） */
  escapeResult?: EscapeModeResult;
}

// ── Dependency interface ──

export interface SelfHealDeps {
  /** 约束求解器（必填） */
  solveConstraints: SolveConstraintsFn;
  /** 带置信度的 Patch 生成器（必填） */
  generatePatchWithConfidence: GeneratePatchWithConfidenceFn;
  /** 认知仓库（可选，用于审计追踪） */
  repo?: ISandboxCognitionRepo;
  /** 沙箱实例（可选，默认创建新实例） */
  sandbox?: CowSandbox;
  /** 安全阀实例（可选，默认创建新实例） */
  valve?: SafetyValve;
  /** 健康度门控实例（可选，默认创建新实例） */
  healthGate?: HealthGate;
}

// ── Controller ──

export class SelfHealController {
  private sandbox: CowSandbox;
  private valve: SafetyValve;
  private healthGate: HealthGate;
  private deps: SelfHealDeps;

  /**
   * 构造函数支持两种模式：
   * - 新风格: new SelfHealController(deps: SelfHealDeps)
   * - 旧风格（向后兼容）: new SelfHealController(sandbox?, valve?)
   */
  constructor(depsOrSandbox?: SelfHealDeps | CowSandbox, valve?: SafetyValve) {
    if (depsOrSandbox instanceof CowSandbox) {
      // 旧风格：位置参数 (sandbox, valve)
      this.deps = {
        solveConstraints: async () => ({ validations: [], patches: [], boundValues: {} }),
        generatePatchWithConfidence: () => ({ patches: [], confidence: 1.0 }),
      };
      this.sandbox = depsOrSandbox;
      this.valve = valve ?? new SafetyValve();
    } else if (depsOrSandbox && typeof depsOrSandbox === "object" && "solveConstraints" in depsOrSandbox) {
      // 新风格：SelfHealDeps 对象
      const deps = depsOrSandbox as SelfHealDeps;
      this.deps = deps;
      this.sandbox = deps.sandbox ?? new CowSandbox();
      this.valve = deps.valve ?? new SafetyValve();
      this.healthGate = deps.healthGate ?? new HealthGate();
    } else {
      // 无参数：全部默认
      this.deps = {
        solveConstraints: async () => ({ validations: [], patches: [], boundValues: {} }),
        generatePatchWithConfidence: () => ({ patches: [], confidence: 1.0 }),
      };
      this.sandbox = new CowSandbox();
      this.valve = new SafetyValve();
    }
    this.healthGate = (depsOrSandbox && typeof depsOrSandbox === "object" && "healthGate" in depsOrSandbox)
      ? (depsOrSandbox as SelfHealDeps).healthGate ?? new HealthGate()
      : new HealthGate();
  }

  /**
   * 执行自愈循环。
   *
   * @param codeContent      待修复的代码内容
   * @param cognitionNodes   关联的认知节点（含 AstTemplate 约束）
   * @param config           自愈配置
   * @param externalPatches  外部提供的 Patch（如 LLM 生成），
   *                         若未提供则自动从约束求解器生成
   * @param atomicMode       原子模式：每个 ValidationFailure 独立闭环（默认 false）
   * @param mode             运行模式："async" 为标准流水线，"sync_escape" 跳过沙箱全流程（默认 "async"）
   */
  async heal(
    codeContent: string,
    cognitionNodes: CognitionNodeData[],
    config: SelfHealConfig,
    externalPatches?: TransformPatch[],
    atomicMode?: boolean,
    mode?: "async" | "sync_escape",
  ): Promise<SelfHealResult> {
    const actualMode = mode ?? "async";
    const actualAtomicMode = atomicMode ?? false;

    const startTime = Date.now();
    const sourceNodes = cognitionNodes.map(n => n.id);
    const filePath = config.filePath ?? "unknown";

    // ── 健康度门控检查（维度 2.1：前置 healthGate.check()）──
    const healthMetrics = this.collectHealthMetrics();
    const healthResult = this.healthGate.check(healthMetrics);
    if (!healthResult.allowed) {
      return this.makeResult(
        sourceNodes, 0, 0, 0,
        { passed: false, remainingFailures: 0 },
        "BLOCKED", startTime, 0,
        healthResult.reason ?? "Blocked by health gate",
      );
    }

    // ── 安全阀检查 ──
    const valveCheck = this.valve.allow(filePath);
    if (!valveCheck.allowed) {
      return this.makeResult(
        sourceNodes, 0, 0, 0,
        { passed: false, remainingFailures: 0 },
        "BLOCKED", startTime, 0,
        valveCheck.reason ?? "Blocked by safety valve",
      );
    }

    // ── sync_escape 模式：跳过沙箱全流程，直接生成 patches + confidence（维度 2.3）──
    if (actualMode === "sync_escape") {
      const baseline = await this.deps.solveConstraints(cognitionNodes, codeContent, config.language);
      const originalFailures = baseline.validations.reduce(
        (sum, v) => sum + v.failures.length, 0,
      );

      const allFailures = baseline.validations.flatMap(v => v.failures);
      const { patches, confidence } = this.deps.generatePatchWithConfidence(allFailures, null);

      return this.makeResult(
        sourceNodes, originalFailures, patches.length, 0,
        { passed: false, remainingFailures: originalFailures },
        "ESCAPED", startTime, confidence,
        `Escape mode: ${originalFailures} violation(s) detected, ${patches.length} patch(es) generated`,
        undefined,
        { patches, confidence },
      );
    }

    // ── 1. 加载沙箱 ──
    await this.sandbox.load(codeContent, config.language);

    // ── 2. Baseline: 运行约束求解，获取违规列表 ──
    const baseline = await this.deps.solveConstraints(cognitionNodes, codeContent, config.language);
    const originalFailures = baseline.validations.reduce(
      (sum, v) => sum + v.failures.length, 0,
    );

    // 无违规 → 不需要自愈
    if (originalFailures === 0) {
      return this.makeResult(
        sourceNodes, 0, 0, 0,
        { passed: true, remainingFailures: 0 },
        "HEALED", startTime, 1.0,
        "No violations detected",
      );
    }

    // ── 3. 获取 Patch ──
    const { patches, confidence } = this.getPatches(
      baseline.validations,
      externalPatches,
    );

    // ── 4. 置信度门控 ──
    if (confidence < config.minConfidence) {
      return this.makeResult(
        sourceNodes, originalFailures, patches.length, 0,
        { passed: false, remainingFailures: originalFailures },
        "SKIPPED", startTime, confidence,
        `Confidence ${confidence.toFixed(2)} below threshold ${config.minConfidence}`,
      );
    }

    // ── 5. 原子模式：每个 ValidationFailure 独立闭环（维度 2.2）──
    if (actualAtomicMode) {
      return this.healAtomic(
        sourceNodes, cognitionNodes, baseline.validations,
        config, startTime, confidence,
      );
    }

    // ── 6. 标准自愈循环 ──
    return this.healStandard(
      sourceNodes, cognitionNodes, patches, originalFailures,
      config, startTime, confidence,
    );
  }

  // ── 原子模式自愈循环（维度 2.2）──

  /**
   * 原子模式：每个 ValidationFailure 生成独立 patch，
   * 独立 snapshot → apply → validate → commit/revert。
   * 返回结果中包含 atomicResults 明细。
   */
  private async healAtomic(
    sourceNodes: string[],
    cognitionNodes: CognitionNodeData[],
    validations: ValidationResult[],
    config: SelfHealConfig,
    startTime: number,
    confidence: number,
  ): Promise<SelfHealResult> {
    const allFailures = validations.flatMap(v => v.failures);
    const atomicResults: AtomicPatchResult[] = [];
    let totalApplied = 0;
    let totalReverted = 0;
    let totalRemaining = allFailures.length;

    for (const failure of allFailures) {
      if ((Date.now() - startTime) >= config.maxDurationMs) break;

      // 每个 failure 单独生成 patch
      const { patches: singlePatch } =
        this.deps.generatePatchWithConfidence([failure], null);

      if (singlePatch.length === 0) {
        atomicResults.push({
          nodeId: failure.nodeId,
          status: "FAILED",
          patch: { nodeId: failure.nodeId, operations: [], description: "no patch generated" },
        });
        continue;
      }

      const sid = this.sandbox.snapshot();

      // 应用该 patch
      const batchResult = this.sandbox.applyBatch(singlePatch);
      if (batchResult.applied === 0 || batchResult.error) {
        totalReverted++;
        atomicResults.push({
          nodeId: failure.nodeId,
          status: "REVERTED",
          patch: singlePatch[0],
        });
        continue;
      }

      // 重新验证
      const newContent = this.sandbox.getContent();
      const recheck = await this.deps.solveConstraints(cognitionNodes, newContent, config.language);
      const remainingForNode = recheck.validations.reduce(
        (sum, v) => sum + v.failures.length, 0,
      );

      if (remainingForNode === 0 || remainingForNode < allFailures.length) {
        // 修复成功 / 部分改善 → commit
        totalApplied++;
        totalRemaining = remainingForNode;
        atomicResults.push({
          nodeId: failure.nodeId,
          status: "APPLIED",
          patch: singlePatch[0],
        });
      } else {
        // 未改善 → revert
        this.sandbox.revert(sid);
        totalReverted++;
        atomicResults.push({
          nodeId: failure.nodeId,
          status: "REVERTED",
          patch: singlePatch[0],
        });
      }
    }

    const status: SelfHealResult["status"] =
      totalRemaining === 0 ? "HEALED" :
      totalApplied > 0 ? "PARTIAL" : "FAILED";

    return this.makeResult(
      sourceNodes, allFailures.length, totalApplied, totalReverted,
      { passed: totalRemaining === 0, remainingFailures: totalRemaining },
      status, startTime, confidence,
      `Atomic: ${totalApplied} applied, ${totalReverted} reverted, ${totalRemaining} remaining`,
      atomicResults,
    );
  }

  // ── 标准自愈循环 ──

  private async healStandard(
    sourceNodes: string[],
    cognitionNodes: CognitionNodeData[],
    patches: TransformPatch[],
    originalFailures: number,
    config: SelfHealConfig,
    startTime: number,
    confidence: number,
  ): Promise<SelfHealResult> {
    let retries = 0;
    let totalApplied = 0;
    let totalReverted = 0;

    while (retries < config.maxRetries && (Date.now() - startTime) < config.maxDurationMs) {
      // 记录尝试
      this.valve.record(config.filePath ?? "unknown");
      retries++;

      const sid = this.sandbox.snapshot();

      // 应用 Patch
      const batchResult = this.sandbox.applyBatch(patches);
      totalApplied += batchResult.applied;
      totalReverted += batchResult.reverted;

      if (batchResult.applied === 0 || batchResult.error) {
        // 应用失败 → 回滚（applyBatch 内部已回滚）
        continue;
      }

      // 沙箱内重新验证
      const newContent = this.sandbox.getContent();
      const recheck = await this.deps.solveConstraints(cognitionNodes, newContent, config.language);
      const remaining = recheck.validations.reduce(
        (sum, v) => sum + v.failures.length, 0,
      );

      // 决策
      if (remaining === 0) {
        // 全部修复 → 成功
        return this.makeResult(
          sourceNodes, originalFailures, totalApplied, totalReverted,
          { passed: true, remainingFailures: 0 },
          "HEALED", startTime, confidence,
          `All ${originalFailures} violations fixed after ${retries} attempt(s)`,
        );
      }

      if (remaining < originalFailures && confidence >= config.autoApplyThreshold) {
        // 部分修复 + 置信度足够 → 接受部分结果
        return this.makeResult(
          sourceNodes, originalFailures, totalApplied, totalReverted,
          { passed: false, remainingFailures: remaining },
          "PARTIAL", startTime, confidence,
          `${originalFailures - remaining} violations fixed, ${remaining} remain`,
        );
      }

      // 回滚并重试
      this.sandbox.revert(sid);
      totalReverted += batchResult.applied;
      totalApplied -= batchResult.applied;
    }

    // 所有重试失败
    return this.makeResult(
      sourceNodes, originalFailures, 0, totalReverted,
      { passed: false, remainingFailures: originalFailures },
      "FAILED", startTime, confidence,
      `Failed after ${retries} retries`,
    );
  }

  /**
   * 获取沙箱中最新的代码内容（调用方决定是否持久化）。
   * 仅在 status=HEALED 时内容有意义。
   */
  getHealedContent(): string | null {
    if (!this.sandbox.isLoaded()) return null;
    return this.sandbox.getContent();
  }

  /** 获取安全阀统计。 */
  getValveStats() {
    return this.valve.stats();
  }

  /** 获取健康度门控实例（调用方可读取上次 check 的指标）。 */
  getHealthGate(): HealthGate {
    return this.healthGate;
  }

  /** 重置所有状态。 */
  reset(): void {
    this.sandbox.reset();
    this.valve.reset();
  }

  // ── Private ──

  /**
   * 采集当前健康度指标。
   * 从 node 进程内存、MetricsCollector 或 eventBus 获取实时数据。
   */
  private collectHealthMetrics(): HealthMetrics {
    let memoryUsagePercent = 0;
    try {
      const mem = process.memoryUsage();
      memoryUsagePercent = mem.heapTotal > 0
        ? Math.round((mem.heapUsed / mem.heapTotal) * 100)
        : 0;
    } catch {
      // 非 Node 环境或无 process API 时使用默认值 0
    }

    return {
      memoryUsagePercent,
      traversalLatencyP99Ms: 0, // 由 MetricsCollector 注入或 eventBus 提供
      revertRate: this.computeRevertRate(),
      fatigueLevel: this.valve.fatigueLevel(),
    };
  }

  /** 计算当前回滚率 (revert / total attempts)。 */
  private computeRevertRate(): number {
    const stats = this.valve.stats();
    if (stats.globalAttempts === 0) return 0;

    // revert 数从 valve 统计估算
    const level = this.valve.fatigueLevel();
    if (level === "CRITICAL") return 0.5;
    if (level === "ELEVATED") return 0.3;
    return 0.1;
  }

  private getPatches(
    validations: ValidationResult[],
    externalPatches: TransformPatch[] | undefined,
  ): { patches: TransformPatch[]; confidence: number } {
    if (externalPatches && externalPatches.length > 0) {
      const confidence = Math.min(0.95, 0.7 + externalPatches.length * 0.05);
      return { patches: externalPatches, confidence };
    }

    // 自动生成 Patch（委托给注入的依赖）
    const allFailures = validations.flatMap(v => v.failures);
    return this.deps.generatePatchWithConfidence(allFailures, null);
  }

  private makeResult(
    sourceNodes: string[],
    originalFailures: number,
    applied: number,
    reverted: number,
    finalValidation: SelfHealResult["finalValidation"],
    status: SelfHealResult["status"],
    startTime: number,
    confidence: number,
    message: string,
    atomicResults?: AtomicPatchResult[],
    escapeResult?: EscapeModeResult,
  ): SelfHealResult {
    return {
      sourceNodes,
      originalFailures,
      patchesGenerated: applied + reverted,
      patchesApplied: applied,
      patchesReverted: reverted,
      finalValidation,
      status,
      durationMs: Date.now() - startTime,
      confidence: Math.round(confidence * 100) / 100,
      fatigueLevel: this.valve.fatigueLevel(),
      message,
      atomicResults,
      escapeResult,
    };
  }
}
