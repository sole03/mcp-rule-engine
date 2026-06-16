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
 * @file EventBus — 类型安全的轻量级事件总线
 *
 * 特性：
 * - 优先级调度 (HIGH > NORMAL > LOW)
 * - 背压消费队列（显式 drain）
 * - 同步/异步双模式
 * - 单 handler 失败不影响其他
 */

export type Priority = "HIGH" | "NORMAL" | "LOW";
export type EventHandler<T> = (event: T) => void | Promise<void>;

interface QueueEntry<T> {
  event: T;
  priority: Priority;
  timestamp: number;
}

function priorityOrder(p: Priority): number {
  return p === "HIGH" ? 3 : p === "NORMAL" ? 2 : 1;
}

export class EventBus {
  private handlers = new Map<string, { handler: EventHandler<any>; priority: Priority }[]>();
  private highQueue: QueueEntry<any>[] = [];
  private normalQueue: QueueEntry<any>[] = [];
  private lowQueue: QueueEntry<any>[] = [];
  private processing = false;

  /** 注册事件处理器 */
  on<T>(type: string, handler: EventHandler<T>, priority: Priority = "NORMAL"): void {
    const list = this.handlers.get(type) ?? [];
    list.push({ handler, priority });
    list.sort((a, b) => priorityOrder(b.priority) - priorityOrder(a.priority));
    this.handlers.set(type, list);
  }

  /** 移除事件处理器 */
  off<T>(type: string, handler: EventHandler<T>): void {
    const list = this.handlers.get(type);
    if (!list) return;
    const idx = list.findIndex(h => h.handler === handler);
    if (idx !== -1) list.splice(idx, 1);
    if (list.length === 0) this.handlers.delete(type);
  }

  /**
   * 发布事件。
   * immediate=true → 同步执行所有 handler。
   * immediate=false → 放入优先级队列，需显式调用 drain() 消费。
   */
  emit<T extends { type: string }>(event: T, immediate = false): void {
    if (immediate) {
      this.invokeHandlersSync(event);
      return;
    }
    this.enqueue({
      event,
      priority: this.inferPriority(event),
      timestamp: Date.now(),
    });
  }

  /**
   * 消费队列中的所有事件。按优先级 (HIGH → NORMAL → LOW) 处理。
   * 可通过 await 等待完成，或 fire-and-forget。
   */
  async drain(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.highQueue.length > 0 || this.normalQueue.length > 0 || this.lowQueue.length > 0) {
        const entry = this.highQueue.shift()
          ?? this.normalQueue.shift()
          ?? this.lowQueue.shift();
        if (entry) {
          await this.invokeHandlersAsync(entry.event);
        }
      }
    } finally {
      this.processing = false;
    }
  }

  /** 获取队列统计 */
  stats(): { high: number; normal: number; low: number; handlers: number } {
    return {
      high: this.highQueue.length,
      normal: this.normalQueue.length,
      low: this.lowQueue.length,
      handlers: [...this.handlers.values()].reduce((s, v) => s + v.length, 0),
    };
  }

  /** 清空所有 handler 和队列（同步操作） */
  reset(): void {
    this.handlers.clear();
    this.highQueue = [];
    this.normalQueue = [];
    this.lowQueue = [];
    this.processing = false;
  }

  // ── Private ──

  private invokeHandlersSync(event: any): void {
    const type = event.type;
    const list = this.handlers.get(type);
    if (!list?.length) return;
    for (const { handler } of list) {
      try { handler(event); } catch { /* 单 handler 失败不影响其他 */ }
    }
  }

  private async invokeHandlersAsync(event: any): Promise<void> {
    const type = event.type;
    const list = this.handlers.get(type);
    if (!list?.length) return;
    for (const { handler } of list) {
      try { await handler(event); } catch { /* 单 handler 失败不影响其他 */ }
    }
  }

  private enqueue<T>(entry: QueueEntry<T>): void {
    switch (entry.priority) {
      case "HIGH": this.highQueue.push(entry); break;
      case "LOW": this.lowQueue.push(entry); break;
      default: this.normalQueue.push(entry);
    }
  }

  private inferPriority(event: { type: string }): Priority {
    if (event.type.startsWith("amygdala")) return "HIGH";
    if (event.type.startsWith("governance.proposal")) return "HIGH";
    if (event.type.includes("feedback")) return "LOW";
    return "NORMAL";
  }
}
