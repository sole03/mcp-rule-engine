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

import { describe, it, expect, afterAll } from "vitest";
import { RuleRepo } from "../../src/data/rule-repo.js";
import { disconnectPrisma } from "../../src/data/client.js";

describe("Rule Version Audit", () => {
  const repo = new RuleRepo();

  afterAll(async () => { await disconnectPrisma(); });

  it("creates version snapshot on updateContent", async () => {
    const rule = await repo.create({ type: "replace", pattern: "original_pattern", suggestion: "original_suggestion", language: "typescript" });
    const updated = await repo.updateContent(rule.id, { pattern: "new_pattern", editedBy: "test-user" });
    expect(updated.pattern).toBe("new_pattern");
    const versions = await repo.getRuleVersions(rule.id);
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(versions[0].pattern).toBe("original_pattern");
    expect(versions[0].suggestion).toBe("original_suggestion");
    expect(versions[0].editedBy).toBe("test-user");
  });

  it("preserves version history across multiple edits", async () => {
    const rule = await repo.create({ type: "replace", pattern: "v1", suggestion: "s1", language: "typescript" });
    await repo.updateContent(rule.id, { pattern: "v2", suggestion: "s2" });
    await repo.updateContent(rule.id, { pattern: "v3", suggestion: "s3" });
    const versions = await repo.getRuleVersions(rule.id);
    expect(versions.length).toBe(2);
    expect(versions[0].pattern).toBe("v2");
    expect(versions[1].pattern).toBe("v1");
  });

  it("returns empty array for non-existent rule", async () => {
    const versions = await repo.getRuleVersions("nonexistent-id");
    expect(versions).toEqual([]);
  });
});
