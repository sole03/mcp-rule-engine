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
 * @file Tests for resolve-conflict handler
 */
import { describe, it, expect } from "vitest";
import { handleResolveConflict } from "../../src/transport/mcp/resolve-conflict.js";
import { ConflictRepo } from "../../src/data/conflict-repo.js";
import { RuleRepo } from "../../src/data/rule-repo.js";
import { MetricRepo } from "../../src/data/metric-repo.js";

describe("handleResolveConflict", () => {
  const ruleRepo = new RuleRepo();
  const conflictRepo = new ConflictRepo(ruleRepo);
  const metricRepo = new MetricRepo();

  it("returns error for non-existent conflict", async () => {
    const result = await handleResolveConflict(
      { conflictId: "nonexistent", resolution: "keep_a" },
      conflictRepo,
      ruleRepo,
      metricRepo,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  it("returns error when conflictId is empty", async () => {
    const result = await handleResolveConflict(
      { conflictId: "", resolution: "keep_a" },
      conflictRepo,
      ruleRepo,
      metricRepo,
    );
    expect(result.isError).toBe(true);
  });
});
