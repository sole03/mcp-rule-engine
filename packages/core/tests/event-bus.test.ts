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
 * @file EventBus 单元测试
 */

import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../src/events/bus.js";

describe("EventBus", () => {
  it("creates an empty bus", () => {
    const bus = new EventBus();
    const stats = bus.stats();
    expect(stats.high).toBe(0);
    expect(stats.normal).toBe(0);
    expect(stats.low).toBe(0);
    expect(stats.handlers).toBe(0);
  });

  it("registers and invokes a handler synchronously", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("test.event", handler);
    bus.emit({ type: "test.event", payload: { value: 42 } }, true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not invoke handler for different event type", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("test.event", handler);
    bus.emit({ type: "other.event", payload: {} }, true);
    expect(handler).not.toHaveBeenCalled();
  });

  it("invokes multiple handlers (same priority = registration order)", () => {
    const bus = new EventBus();
    const calls: string[] = [];
    bus.on("test.event", () => { calls.push("A"); }, "NORMAL");
    bus.on("test.event", () => { calls.push("B"); }, "NORMAL");
    bus.emit({ type: "test.event", payload: {} }, true);
    expect(calls).toEqual(["A", "B"]);
  });

  it("invokes handlers in priority order", () => {
    const bus = new EventBus();
    const calls: string[] = [];
    bus.on("test.event", () => { calls.push("LOW"); }, "LOW");
    bus.on("test.event", () => { calls.push("HIGH"); }, "HIGH");
    bus.on("test.event", () => { calls.push("NORMAL"); }, "NORMAL");
    bus.emit({ type: "test.event", payload: {} }, true);
    expect(calls).toEqual(["HIGH", "NORMAL", "LOW"]);
  });

  it("routes amygdala events to HIGH priority queue", async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("amygdala.triggered", handler, "HIGH");
    bus.emit({ type: "amygdala.triggered", payload: { diffSize: 500, riskScore: 0.9, reason: "large diff" } });
    await bus.drain();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("isolates handler exceptions", () => {
    const bus = new EventBus();
    const goodHandler = vi.fn();
    const badHandler = vi.fn(() => { throw new Error("boom"); });
    bus.on("test.event", badHandler);
    bus.on("test.event", goodHandler);
    bus.emit({ type: "test.event", payload: {} }, true);
    expect(badHandler).toHaveBeenCalled();
    expect(goodHandler).toHaveBeenCalled();
  });

  it("removes a handler via off()", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("test.event", handler);
    bus.off("test.event", handler);
    bus.emit({ type: "test.event", payload: {} }, true);
    expect(handler).not.toHaveBeenCalled();
  });

  it("reset clears handlers and queues", async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("test.event", handler);
    // 异步 emit → 队列里有事件
    bus.emit({ type: "test.event", payload: {} });
    // reset 等待 drain 完成后清空
    await bus.reset();

    const stats = bus.stats();
    expect(stats.handlers).toBe(0);
    expect(stats.high).toBe(0);
    expect(stats.normal).toBe(0);
    expect(stats.low).toBe(0);
  });

  it("processes events asynchronously via drain()", async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("test.event", handler);
    bus.emit({ type: "test.event", payload: {} });
    await bus.drain();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("stats reflects queue state before drain", () => {
    const bus = new EventBus();
    bus.on("event.a", () => {});
    bus.emit({ type: "amygdala.triggered", payload: { diffSize: 1, riskScore: 0.5, reason: "" } });
    // 在 drain 之前读取 stats → 应该还有队列条目
    const stats = bus.stats();
    expect(stats.handlers).toBe(1);
    expect(stats.high).toBe(1);
    expect(stats.normal).toBe(0);
    expect(stats.low).toBe(0);
  });
});
