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

import { verifyAll } from "../../packages/core/src/verification/property-tests.js";
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("CI verification runner", () => {
  it("verifyAll returns valid results", async () => {
    const results = await verifyAll(10);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r).toHaveProperty("name");
      expect(r).toHaveProperty("passed");
      expect(r.passed).toBeGreaterThanOrEqual(0);
      expect(r).toHaveProperty("failed");
      expect(r).toHaveProperty("duration");
      expect(r.duration).toBeGreaterThanOrEqual(0);
    }
  });

  it("CI workflow file is valid", () => {
    const workflowPath = path.resolve(".github/workflows/rule-verify.yml");
    expect(fs.existsSync(workflowPath)).toBe(true);
    const content = fs.readFileSync(workflowPath, "utf-8");
    expect(content).toContain("name:");
    expect(content).toContain("on:");
    expect(content).toContain("jobs:");
    expect(content).toContain("Property Tests");
    expect(content).toContain("Shadow Replay");
  });
});
