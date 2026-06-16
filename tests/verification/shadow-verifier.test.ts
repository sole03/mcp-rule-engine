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
 * Integration test for ShadowVerifier using a mock ShadowLogProvider.
 */

import { describe, it, expect } from "vitest";
import { ShadowVerifier } from "../../packages/core/src/verification/shadow-verifier.js";
import type { ShadowLogProvider, ShadowLogEntry, ShadowRule } from "../../packages/core/src/verification/shadow-verifier.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Mock ShadowLogProvider

class MockShadowLogProvider implements ShadowLogProvider {
  private logs: ShadowLogEntry[];
  private rules: Map<string, ShadowRule>;

  constructor(logs: ShadowLogEntry[], rules: ShadowRule[]) {
    this.logs = logs;
    this.rules = new Map(rules.map(r => [r.id, r]));
  }

  async getLogs(limit?: number): Promise<ShadowLogEntry[]> {
    const all = [...this.logs];
    return limit !== undefined ? all.slice(0, limit) : all;
  }

  async getRuleById(id: string): Promise<ShadowRule | null> {
    return this.rules.get(id) ?? null;
  }
}

// Test data
// ShadowVerifier uses patternMatches(log.filePath, rule.pattern):
// first literal substring, then regex.

function makeLogs(): ShadowLogEntry[] {
  return [
    {
      id: "case-1",
      ruleId: "rule-utils",
      filePath: "src/utils.ts",
      matchedAt: "2026-06-01T00:00:00Z",
      wouldBlock: true,
    },
    {
      id: "case-2",
      ruleId: "rule-utils",
      filePath: "src/helpers.ts",
      matchedAt: "2026-06-02T00:00:00Z",
      wouldBlock: false,
    },
    {
      id: "case-3",
      ruleId: "rule-parser",
      filePath: "src/parser.ts",
      matchedAt: "2026-06-03T00:00:00Z",
      wouldBlock: true,
    },
    {
      id: "case-4",
      ruleId: "rule-parser",
      filePath: "src/legacy-parser.ts",
      matchedAt: "2026-06-04T00:00:00Z",
      wouldBlock: true,
    },
    {
      id: "case-5",
      ruleId: "rule-unknown",
      filePath: "src/mystery.ts",
      matchedAt: "2026-06-05T00:00:00Z",
      wouldBlock: true,
    },
  ];
}

function makeRules(): ShadowRule[] {
  return [
    { id: "rule-utils", pattern: "utils", status: "active" },
    // Regex: matches "parser.ts" but not "legacy-parser.ts"
    { id: "rule-parser", pattern: "/parser\\.ts$/", status: "inactive" },
  ];
}

describe("ShadowVerifier with mock provider", () => {
  const logs = makeLogs();
  const rules = makeRules();
  const provider = new MockShadowLogProvider(logs, rules);
  const verifier = new ShadowVerifier(provider);

  describe("verify()", () => {
    it("processes all shadow logs and returns correct totals", async () => {
      const result = await verifier.verify();

      // case-1: rule-utils active, "src/utils.ts" contains "utils" → true, wouldBlockBefore=true → PASS
      // case-2: rule-utils active, "src/helpers.ts" does NOT contain "utils" → false, wouldBlockBefore=false → PASS
      // case-3: rule-parser inactive, regex matches "parser.ts" → true, wouldBlockBefore=true
      //         wouldBlockAfter=false (inactive) → FIXED
      // case-4: rule-parser inactive, regex DOES NOT match "legacy-parser.ts" → false, wouldBlockBefore=true → FIXED
      // case-5: rule-unknown missing → skipped

      expect(result.totalCases).toBe(4);
      expect(result.passed).toBe(4);
      expect(result.failed).toBe(0);
      expect(result.newFalsePositives).toBe(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("classifies PASS for unchanged blocking state", async () => {
      const result = await verifier.verify();
      const passCases = result.details.filter(d => d.verdict === "PASS");
      expect(passCases.length).toBe(2);
      const ids = passCases.map(d => d.caseId).sort();
      expect(ids).toEqual(["case-1", "case-2"]);
    });

    it("classifies FIXED when previously blocking rule is now inactive", async () => {
      const result = await verifier.verify();
      const fixedCases = result.details.filter(d => d.verdict === "FIXED");
      expect(fixedCases.length).toBe(2);
      const ids = fixedCases.map(d => d.caseId).sort();
      expect(ids).toEqual(["case-3", "case-4"]);
    });

    it("classifies NEW_FP correctly when inactive rule becomes active", async () => {
      const fpLogs: ShadowLogEntry[] = [
        {
          id: "fp-1",
          ruleId: "rule-x",
          filePath: "src/harmful.ts",
          matchedAt: "2026-06-06T00:00:00Z",
          wouldBlock: false,
        },
      ];
      const fpRules: ShadowRule[] = [
        { id: "rule-x", pattern: "harmful", status: "active" },
      ];
      const fpVerifier = new ShadowVerifier(
        new MockShadowLogProvider(fpLogs, fpRules),
      );

      const result = await fpVerifier.verify();
      expect(result.totalCases).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.newFalsePositives).toBe(1);
      expect(result.details[0].verdict).toBe("NEW_FP");
    });

    it("respects the limit parameter", async () => {
      const result = await verifier.verify(2);
      expect(result.totalCases).toBeLessThanOrEqual(2);
    });
  });

  describe("exportFixtures()", () => {
    it("writes JSON fixture files to a temp directory", async () => {
      const tmpDir = path.join(os.tmpdir(), "shadow-fixtures-" + Date.now());
      try {
        const count = await verifier.exportFixtures(tmpDir);
        expect(count).toBe(logs.length);

        for (const log of logs) {
          const filePath = path.join(tmpDir, "shadow-case-" + log.id + ".json");
          expect(fs.existsSync(filePath)).toBe(true);

          const raw = fs.readFileSync(filePath, "utf-8");
          const fixture = JSON.parse(raw);
          expect(fixture.caseId).toBe(log.id);
          expect(fixture.ruleId).toBe(log.ruleId);
          expect(fixture.filePath).toBe(log.filePath);
          expect(fixture.wouldBlock).toBe(log.wouldBlock);
          expect(fixture.matchedAt).toBeTruthy();
        }
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("handles missing rules gracefully (null pattern/status)", async () => {
      const tmpDir = path.join(os.tmpdir(), "shadow-fixtures-orphan-" + Date.now());
      try {
        const count = await verifier.exportFixtures(tmpDir);
        expect(count).toBe(logs.length);

        const orphanPath = path.join(tmpDir, "shadow-case-case-5.json");
        expect(fs.existsSync(orphanPath)).toBe(true);
        const fixture = JSON.parse(fs.readFileSync(orphanPath, "utf-8"));
        expect(fixture.rulePattern).toBeNull();
        expect(fixture.ruleStatus).toBeNull();
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
