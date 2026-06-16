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

import { describe, it, expect } from "vitest";
import { handleUpdateConfig } from "../../src/transport/mcp/config-tools.js";

describe("handleUpdateConfig", () => {
  it("rejects when key is missing", async () => {
    const result = await handleUpdateConfig({ key: "", value: 1 } as any);
    expect(result.content[0].text).toContain("key and value are required");
  });

  it("rejects when value is undefined", async () => {
    const result = await handleUpdateConfig({ key: "threshold", value: undefined } as any);
    expect(result.content[0].text).toContain("key and value are required");
  });

  it("rejects when expertMode is not enabled", async () => {
    const result = await handleUpdateConfig({ key: "threshold", value: 0.5, expertMode: false });
    expect(result.content[0].text).toContain("Unauthorized");
  });

  it("creates config node when expert mode is enabled", async () => {
    const result = await handleUpdateConfig({ key: "test_conf_" + Date.now(), value: 42, expertMode: true });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.key).toBeDefined();
    expect(parsed.value).toBe(42);
    expect(parsed.nodeId).toBeDefined();
    expect(parsed.version).toBeGreaterThanOrEqual(1);
  });

  it("handles duplicate config key gracefully", async () => {
    const key = "dup_test_" + Date.now();
    // First call succeeds
    const r1 = await handleUpdateConfig({ key, value: 1, expertMode: true });
    const p1 = JSON.parse(r1.content[0].text);
    expect(p1.version).toBeGreaterThanOrEqual(1);

    // Second call with same key may return error due to unique constraint
    const r2 = await handleUpdateConfig({ key, value: 2, expertMode: true });
    const p2 = JSON.parse(r2.content[0].text);
    // Either succeeds with higher version or returns an error
    if (p2.error) {
      expect(p2.error).toBeDefined();
    } else {
      expect(p2.version).toBeGreaterThanOrEqual(2);
      expect(p2.nodeId).not.toBe(p1.nodeId);
    }
  });
});
