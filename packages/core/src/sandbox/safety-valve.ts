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
 * @file SafetyValve — 安全阀
 *
 * 防止自愈死循环：
 * - 全局最大自愈次数：50
 * - 单文件最大自愈次数：5
 * - 冷却窗口：60 秒
 * - 疲劳等级：NORMAL → ELEVATED → CRITICAL
 *
 * 当安全阀触发时，自愈循环自动暂停，等待人工介入。
 */

export class SafetyValve {
  private globalAttempts = 0;
  private perFileAttempts = new Map<string, number>();
  private cooldownTimers = new Map<string, ReturnType<typeof setTimeout>>();

  static readonly GLOBAL_LIMIT = 50;
  static readonly PER_FILE_LIMIT = 5;
  static readonly COOLDOWN_MS = 60_000;

  /**
   * 检查是否允许执行自愈。
   */
  allow(filePath: string): { allowed: boolean; reason?: string } {
    if (this.globalAttempts >= SafetyValve.GLOBAL_LIMIT) {
      return {
        allowed: false,
        reason: `Global self-heal limit reached (${SafetyValve.GLOBAL_LIMIT})`,
      };
    }

    const fileAttempts = this.perFileAttempts.get(filePath) ?? 0;
    if (fileAttempts >= SafetyValve.PER_FILE_LIMIT) {
      return {
        allowed: false,
        reason: `File self-heal limit reached for ${filePath} (${SafetyValve.PER_FILE_LIMIT})`,
      };
    }

    return { allowed: true };
  }

  /**
   * 记录一次自愈尝试。
   */
  record(filePath: string): void {
    this.globalAttempts++;
    const current = this.perFileAttempts.get(filePath) ?? 0;
    this.perFileAttempts.set(filePath, current + 1);

    // 冷却窗口后减少文件计数
    const existing = this.cooldownTimers.get(filePath);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      const val = this.perFileAttempts.get(filePath) ?? 1;
      if (val <= 1) {
        this.perFileAttempts.delete(filePath);
      } else {
        this.perFileAttempts.set(filePath, val - 1);
      }
      this.cooldownTimers.delete(filePath);
    }, SafetyValve.COOLDOWN_MS);

    this.cooldownTimers.set(filePath, timer);
  }

  /**
   * 疲劳等级。
   */
  fatigueLevel(): "NORMAL" | "ELEVATED" | "CRITICAL" {
    const ratio = this.globalAttempts / SafetyValve.GLOBAL_LIMIT;
    if (ratio >= 0.8) return "CRITICAL";
    if (ratio >= 0.5) return "ELEVATED";
    return "NORMAL";
  }

  /**
   * 获取统计信息。
   */
  stats(): {
    globalAttempts: number;
    globalLimit: number;
    fatigueLevel: string;
    perFile: { file: string; attempts: number }[];
  } {
    return {
      globalAttempts: this.globalAttempts,
      globalLimit: SafetyValve.GLOBAL_LIMIT,
      fatigueLevel: this.fatigueLevel(),
      perFile: [...this.perFileAttempts.entries()].map(([file, attempts]) => ({ file, attempts })),
    };
  }

  /**
   * 完全重置。
   */
  reset(): void {
    this.globalAttempts = 0;
    this.perFileAttempts.clear();
    for (const timer of this.cooldownTimers.values()) {
      clearTimeout(timer);
    }
    this.cooldownTimers.clear();
  }
}
