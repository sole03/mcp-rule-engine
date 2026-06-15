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

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process and fs
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { handleAnalyzeWorkspace } from "../../src/tools/analyze-workspace.js";
import { RuleRepo } from "../../src/storage/rule-repo.js";
import { DiffLogRepo } from "../../src/storage/diff-log-repo.js";
import { MetricRepo } from "../../src/storage/metric-repo.js";

describe("analyze_workspace tool", () => {
  let ruleRepo: RuleRepo;
  let diffLogRepo: DiffLogRepo;
  let metricRepo: MetricRepo;

  beforeEach(() => {
    vi.clearAllMocks();
    ruleRepo = new RuleRepo();
    diffLogRepo = new DiffLogRepo();
    metricRepo = new MetricRepo();
    // Mock git diff to show 3 changed files
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      const c = cmd.toString();
      if (c.includes("diff --name-only")) return "src/utils.ts\nsrc/helper.ts\nnode_modules/foo/index.js\n";
      if (c.includes("hash-object")) return "abc12345\n";
      if (c.includes("show HEAD")) return "// original content\n";
      if (c.includes("show HEAD~1")) return "// original content\n";
      return "";
    });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("// modified content\n");
  });

  it("should analyze git diff and return AnalyzeResult", async () => {
    const result = await handleAnalyzeWorkspace(
      { baseCommit: "HEAD~1", taskId: "test-task-1" },
      ruleRepo, diffLogRepo, metricRepo,
    );
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty("analyzedFiles");
    expect(data).toHaveProperty("skippedFiles");
    expect(data).toHaveProperty("generatedRules");
    expect(data).toHaveProperty("conflicts");
    expect(data).toHaveProperty("errors");
  });

  it("should skip node_modules paths", async () => {
    const result = await handleAnalyzeWorkspace(
      { baseCommit: "HEAD~1" },
      ruleRepo, diffLogRepo, metricRepo,
    );
    const data = JSON.parse(result.content[0].text);
    expect(data.skippedFiles).toBeGreaterThanOrEqual(1);
  });

  it("should return error message when git not available", async () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error("git not found"); });
    const result = await handleAnalyzeWorkspace(
      { baseCommit: "HEAD~1" },
      ruleRepo, diffLogRepo, metricRepo,
    );
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBeDefined();
  });

  it("should handle empty diff output", async () => {
    vi.mocked(execSync).mockImplementation(() => "");
    const result = await handleAnalyzeWorkspace(
      { baseCommit: "HEAD~1" },
      ruleRepo, diffLogRepo, metricRepo,
    );
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBeDefined();
  });
});
