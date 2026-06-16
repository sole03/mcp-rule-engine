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
 * @file CowSandbox — COW (Copy-on-Write) 内存沙箱
 *
 * 对代码内容的每次修改都在 snapshot → apply → validate → revert/commit 循环中进行。
 * 不涉及任何 I/O 或 DB 操作。操作延迟 < 10ms。
 *
 * 使用 structuredClone 实现真正的"写时复制"语义：
 * - snapshot() 克隆当前状态
 * - apply() 修改当前状态
 * - revert() 丢弃修改，恢复到快照
 */

import { parseToAST } from "../../../../src/analysis/parsers.js";
import type { ASTNode } from "../../../../src/core/types.js";
import type { TransformPatch } from "../../../../src/core/cognition-types.js";

interface SandboxState {
  content: string;
  ast: ASTNode | null;
  snapshotId: string;
}

export class CowSandbox {
  private state: SandboxState | null = null;
  private snapshots = new Map<string, SandboxState>();
  private snapshotCounter = 0;

  // ── 快照管理 ──

  /**
   * 从代码内容初始化沙箱。
   * 调用 AST 解析器（tree-sitter WASM），缓存结果避免重复解析。
   * 返回初始快照 ID。
   */
  async load(codeContent: string, language: string): Promise<string> {
    const { ast } = await parseToAST(codeContent, language);
    const snapshotId = this.nextId();
    this.state = { content: codeContent, ast, snapshotId };
    this.snapshots.set(snapshotId, {
      content: codeContent,
      ast: structuredClone(ast),
      snapshotId,
    });
    return snapshotId;
  }

  /**
   * 同步加载（用于已知内容的测试场景，跳过 AST 解析）。
   */
  loadSync(codeContent: string): string {
    const snapshotId = this.nextId();
    this.state = { content: codeContent, ast: null, snapshotId };
    this.snapshots.set(snapshotId, {
      content: codeContent,
      ast: null,
      snapshotId,
    });
    return snapshotId;
  }

  /**
   * 创建当前状态的快照，返回快照 ID。
   * 支持嵌套快照（Patch → 验证失败 → 回滚 → 重试）。
   */
  snapshot(): string {
    if (!this.state) throw new Error("Sandbox not loaded. Call load() or loadSync() first.");
    const snapshotId = this.nextId();
    this.snapshots.set(snapshotId, {
      content: this.state.content,
      ast: this.state.ast ? structuredClone(this.state.ast) : null,
      snapshotId,
    });
    return snapshotId;
  }

  /**
   * 回滚到指定快照。中间快照自动清理。
   */
  revert(snapshotId: string): void {
    const saved = this.snapshots.get(snapshotId);
    if (!saved) throw new Error(`Snapshot not found: ${snapshotId}`);
    this.state = {
      content: saved.content,
      ast: saved.ast ? structuredClone(saved.ast) : null,
      snapshotId: saved.snapshotId,
    };
    // 清理在 snapshotId 之后创建的所有快照
    const ids = [...this.snapshots.keys()];
    const idx = ids.indexOf(snapshotId);
    if (idx >= 0) {
      for (let i = idx + 1; i < ids.length; i++) {
        this.snapshots.delete(ids[i]);
      }
    }
  }

  // ── Patch 应用 ──

  /**
   * 在沙箱中应用单个 TransformPatch。纯内存操作。
   */
  apply(patch: TransformPatch): void {
    if (!this.state) throw new Error("Sandbox not loaded");

    let content = this.state.content;

    for (const op of patch.operations) {
      switch (op.type) {
        case "REPLACE": {
          const oldText = op.originalText ?? "";
          const newText = op.value ?? "";
          // 只替换第一次出现（避免误伤其他相同文本）
          const idx = content.indexOf(oldText);
          if (idx >= 0) {
            content = content.slice(0, idx) + newText + content.slice(idx + oldText.length);
          }
          break;
        }
        case "INSERT": {
          const value = op.value ?? "";
          // 简单实现：在末尾追加。path 驱动的定位留给 AstConstraintSolver。
          content += "\n" + value;
          break;
        }
        case "DELETE": {
          const target = op.originalText ?? "";
          const idx = content.indexOf(target);
          if (idx >= 0) {
            content = content.slice(0, idx) + content.slice(idx + target.length);
          }
          break;
        }
      }
    }

    // COW: 创建新的 content 引用
    this.state.content = content;
    // AST 失效，下次 validate 时重新解析
    this.state.ast = null;
  }

  /**
   * 在沙箱中批量应用多个 Patch。
   * 全部成功 → 留在最新状态。任一失败 → 回滚到调用前的快照。
   */
  applyBatch(patches: TransformPatch[]): { applied: number; reverted: number; error?: string } {
    if (!this.state) return { applied: 0, reverted: 0, error: "Sandbox not loaded" };

    const sid = this.snapshot();
    let applied = 0;

    for (const patch of patches) {
      try {
        this.apply(patch);
        applied++;
      } catch (err) {
        this.revert(sid);
        return { applied: 0, reverted: patches.length, error: String(err) };
      }
    }

    return { applied, reverted: 0 };
  }

  // ── 状态查询 ──

  /** 获取当前沙箱中的代码内容。 */
  getContent(): string {
    if (!this.state) throw new Error("Sandbox not loaded");
    return this.state.content;
  }

  /** 获取当前快照 ID。 */
  getSnapshotId(): string {
    if (!this.state) throw new Error("Sandbox not loaded");
    return this.state.snapshotId;
  }

  /** 获取当前 AST（懒解析）。 */
  async getAST(language: string): Promise<ASTNode> {
    if (!this.state) throw new Error("Sandbox not loaded");
    if (!this.state.ast) {
      const { ast } = await parseToAST(this.state.content, language);
      this.state.ast = ast;
    }
    return this.state.ast;
  }

  /** 沙箱是否已加载。 */
  isLoaded(): boolean {
    return this.state !== null;
  }

  /** 当前活跃快照数量（用于内存监控）。 */
  get snapshotCount(): number {
    return this.snapshots.size;
  }

  /** 清空所有快照和状态。 */
  reset(): void {
    this.state = null;
    this.snapshots.clear();
    this.snapshotCounter = 0;
  }

  // ── Private ──

  private nextId(): string {
    this.snapshotCounter++;
    return `sandbox_${Date.now()}_${this.snapshotCounter}_${Math.random().toString(36).slice(2, 6)}`;
  }
}
