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
 * @file Shadow Verifier — replay shadow logs against current rules
 *
 * Shadow mode: new rules run in shadow (log-only) before activation.
 * The ShadowVerifier replays logged matches against the current rule set
 * to detect regressions, new false positives, and fixed issues.
 *
 * Protocol-agnostic: accepts a ShadowLogProvider interface so it works
 * with Prisma, a mock DB, or any log source.
 */

// ═══════════════════════════════════════════════════════════
// Interfaces
// ═══════════════════════════════════════════════════════════

export interface ShadowLogEntry {
  id: string;
  ruleId: string;
  filePath: string;
  matchedAt: Date | string;
  wouldBlock: boolean;
}

export interface ShadowRule {
  id: string;
  pattern: string;
  status: string;
}

export interface ShadowLogProvider {
  getLogs(limit?: number): Promise<ShadowLogEntry[]>;
  getRuleById(id: string): Promise<ShadowRule | null>;
}

export interface ShadowCaseDetail {
  caseId: string;
  wouldBlockBefore: boolean;
  wouldBlockAfter: boolean;
  verdict: "PASS" | "NEW_FP" | "FIXED";
}

export interface ShadowVerificationResult {
  totalCases: number;
  passed: number;
  failed: number;
  newFalsePositives: number;
  durationMs: number;
  details: ShadowCaseDetail[];
}

// ═══════════════════════════════════════════════════════════
// Lightweight pattern matcher (no external AST deps)
// ═══════════════════════════════════════════════════════════

function patternMatches(content: string, pattern: string): boolean {
  if (!pattern) return false;

  // Try as a literal substring
  if (content.includes(pattern)) return true;

  // Try as a regex
  try {
    const regex = new RegExp(pattern, "gm");
    return regex.test(content);
  } catch {
    // Not a valid regex — already tried literal match
  }

  return false;
}

// ═══════════════════════════════════════════════════════════
// ShadowVerifier
// ═══════════════════════════════════════════════════════════

export class ShadowVerifier {
  constructor(private provider: ShadowLogProvider) {}

  /**
   * Replay shadow logs against current rules.
   * Returns the verification result with per-case details.
   */
  async verify(limit?: number): Promise<ShadowVerificationResult> {
    const start = Date.now();
    const logs = await this.provider.getLogs(limit);

    const details: ShadowCaseDetail[] = [];
    let passed = 0;
    let failed = 0;
    let newFalsePositives = 0;

    for (const log of logs) {
      const rule = await this.provider.getRuleById(log.ruleId);
      if (!rule) {
        // Rule no longer exists — skip
        continue;
      }

      const wouldBlockBefore = log.wouldBlock;
      const wouldBlockAfter = rule.status === "active" &&
        patternMatches(log.filePath, rule.pattern);

      let verdict: ShadowCaseDetail["verdict"];

      if (wouldBlockBefore === wouldBlockAfter) {
        verdict = "PASS";
        passed++;
      } else if (!wouldBlockBefore && wouldBlockAfter) {
        // Was not blocking before, but now blocks → new false positive
        verdict = "NEW_FP";
        failed++;
        newFalsePositives++;
      } else {
        // Was blocking before, but no longer blocks → fixed
        verdict = "FIXED";
        passed++;
      }

      details.push({
        caseId: log.id,
        wouldBlockBefore,
        wouldBlockAfter,
        verdict,
      });
    }

    return {
      totalCases: details.length,
      passed,
      failed,
      newFalsePositives,
      durationMs: Date.now() - start,
      details,
    };
  }

  /**
   * Export shadow log cases as JSON test fixtures for CI.
   * Writes one JSON file per case to the given output directory.
   * Returns the number of cases exported.
   */
  async exportFixtures(outputDir: string): Promise<number> {
    const logs = await this.provider.getLogs();
    let exported = 0;

    // Dynamic import for Node fs — only needed when exporting
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    await fs.mkdir(outputDir, { recursive: true });

    for (const log of logs) {
      const rule = await this.provider.getRuleById(log.ruleId);
      const fixture = {
        caseId: log.id,
        ruleId: log.ruleId,
        rulePattern: rule?.pattern ?? null,
        ruleStatus: rule?.status ?? null,
        filePath: log.filePath,
        matchedAt: typeof log.matchedAt === "string" ? log.matchedAt : log.matchedAt.toISOString(),
        wouldBlock: log.wouldBlock,
      };

      const filename = path.join(outputDir, `shadow-case-${log.id}.json`);
      await fs.writeFile(filename, JSON.stringify(fixture, null, 2), "utf-8");
      exported++;
    }

    return exported;
  }
}
