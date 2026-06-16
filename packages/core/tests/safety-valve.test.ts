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
 * @file SafetyValve 单元测试
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { SafetyValve } from "../src/sandbox/safety-valve.js";

describe("SafetyValve", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows operations within limits", () => {
    const valve = new SafetyValve();
    for (let i = 0; i < 4; i++) {
      const result = valve.allow("test.ts");
      expect(result.allowed).toBe(true);
      valve.record("test.ts");
    }
  });

  it("blocks when per-file limit exceeded", () => {
    const valve = new SafetyValve();
    for (let i = 0; i < 5; i++) {
      valve.record("test.ts");
    }
    const result = valve.allow("test.ts");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("test.ts");
  });

  it("blocks when global limit exceeded", () => {
    const valve = new SafetyValve();
    for (let i = 0; i < SafetyValve.GLOBAL_LIMIT; i++) {
      valve.record(`file_${i}.ts`);
    }
    const result = valve.allow("new.ts");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Global");
  });

  it("reports fatigue level NORMAL at start", () => {
    const valve = new SafetyValve();
    expect(valve.fatigueLevel()).toBe("NORMAL");
  });

  it("reports fatigue level ELEVATED at 50%", () => {
    const valve = new SafetyValve();
    const half = Math.floor(SafetyValve.GLOBAL_LIMIT * 0.6);
    for (let i = 0; i < half; i++) {
      valve.record(`file_${i}.ts`);
    }
    expect(valve.fatigueLevel()).toBe("ELEVATED");
  });

  it("reports fatigue level CRITICAL at 80%", () => {
    const valve = new SafetyValve();
    const crit = Math.floor(SafetyValve.GLOBAL_LIMIT * 0.85);
    for (let i = 0; i < crit; i++) {
      valve.record(`file_${i}.ts`);
    }
    expect(valve.fatigueLevel()).toBe("CRITICAL");
  });

  it("cooldown reduces per-file count after window", () => {
    vi.useFakeTimers();
    const valve = new SafetyValve();

    valve.record("test.ts");
    valve.record("test.ts");
    valve.record("test.ts");
    valve.record("test.ts");
    valve.record("test.ts");

    // File at limit
    expect(valve.allow("test.ts").allowed).toBe(false);

    // Fast-forward past cooldown
    vi.advanceTimersByTime(SafetyValve.COOLDOWN_MS + 100);

    // Should now allow (count decremented by 1)
    expect(valve.allow("test.ts").allowed).toBe(true);
  });

  it("stats returns correct values", () => {
    const valve = new SafetyValve();
    valve.record("a.ts");
    valve.record("a.ts");
    valve.record("b.ts");

    const s = valve.stats();
    expect(s.globalAttempts).toBe(3);
    expect(s.globalLimit).toBe(SafetyValve.GLOBAL_LIMIT);
    expect(s.fatigueLevel).toBe("NORMAL");
    expect(s.perFile).toHaveLength(2);
  });

  it("reset clears everything", () => {
    const valve = new SafetyValve();
    valve.record("test.ts");
    valve.record("test.ts");
    valve.reset();

    const s = valve.stats();
    expect(s.globalAttempts).toBe(0);
    expect(s.perFile).toHaveLength(0);
  });
});
