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
 * @file Tests for list-rules handler
 */
import { describe, it, expect } from "vitest";
import { handleListRules } from "../../src/transport/mcp/list-rules.js";
import { RuleRepo } from "../../src/data/rule-repo.js";

describe("handleListRules", () => {
  const repo = new RuleRepo();

  it("returns empty list when no rules match", async () => {
    const result = await handleListRules(
      { language: "nonexistent_lang", scope: "project" },
      repo,
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.rules).toBeDefined();
    expect(Array.isArray(parsed.rules)).toBe(true);
  });

  it("returns rules filtered by language", async () => {
    const result = await handleListRules(
      { language: "typescript" },
      repo,
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed.rules)).toBe(true);
    for (const r of parsed.rules) {
      expect(r.language).toBe("typescript");
    }
  });

  it("returns total count", async () => {
    const result = await handleListRules(
      { language: "typescript" },
      repo,
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(typeof parsed.total).toBe("number");
    expect(parsed.total).toBe(parsed.rules.length);
  });

  it("respects limit parameter", async () => {
    const result = await handleListRules(
      { language: "typescript", limit: 2 },
      repo,
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.rules.length).toBeLessThanOrEqual(2);
  });

  it("includes expected rule fields", async () => {
    const result = await handleListRules(
      { language: "typescript" },
      repo,
    );
    const parsed = JSON.parse(result.content[0].text);
    if (parsed.rules.length > 0) {
      const rule = parsed.rules[0];
      expect(rule.id).toBeDefined();
      expect(rule.type).toBeDefined();
      expect(rule.pattern).toBeDefined();
    }
  });
});
