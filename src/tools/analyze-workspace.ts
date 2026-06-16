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

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import type { IRuleRepository } from "../storage/repository-interfaces.js";
import type { IDiffLogRepository } from "../storage/repository-interfaces.js";
import type { IMetricRepository } from "../storage/repository-interfaces.js";
import { computeDiffWithFallback } from "../legacy-engine/parsers.js";
import { evaluateRuleCandidate } from "../legacy-engine/rule-generator.js";
import { detectConflict } from "../conflict/arbitrator.js";
import {
  AnalyzeWorkspaceInput, AnalyzeResult, Rule, RuleSpec, RuleConfidence,
  RULE_GENERATION_THRESHOLDS, SKIP_PATTERNS,
} from "../types.js";

function normalizePath(p: string): string { return p.replace(/\\/g, "/"); }

function isSkipped(filePath: string): boolean {
  return SKIP_PATTERNS.some(pat => pat.test(normalizePath(filePath)));
}

const EXT_LANG: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "javascript",
  mjs: "javascript", cjs: "javascript", py: "python", go: "go",
};

function detectLang(filePath: string): string | null {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANG[ext] ?? null;
}

function git(args: string): string {
  try {
    return execSync(`git ${args}`, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }).trim();
  } catch { return ""; }
}

const CONCURRENCY = 5;

export async function handleAnalyzeWorkspace(
  input: AnalyzeWorkspaceInput,
  ruleRepo: IRuleRepository, diffLogRepo: IDiffLogRepository, metricRepo: IMetricRepository,
) {
  const startTime = performance.now();
  const head = input.headCommit ?? "HEAD";
  const result: AnalyzeResult = { analyzedFiles: 0, skippedFiles: 0, generatedRules: [], conflicts: [], errors: [] };
  const warnings: string[] = [];

  // Check rule limits before processing (P1)
  const limitInfo = await ruleRepo.getLimitInfo(input.taskId);
  if (limitInfo.reached) {
    warnings.push(`规则库已达上限：全局 ${limitInfo.globalCount}/${limitInfo.globalMax}，项目 ${limitInfo.projectCount}/${limitInfo.projectMax}。建议归档或导出旧规则。`);
  }

  const diffOut = git(`diff --name-only ${input.baseCommit} ${head}`);
  // Non-git mode: process fileContents directly with concurrency
  if (input.fileContents && input.fileContents.length > 0) {
    result.analyzedFiles = input.fileContents.length;
    const cc = input.concurrency ?? CONCURRENCY;
    for (let i = 0; i < input.fileContents.length; i += cc) {
      await Promise.all(input.fileContents.slice(i, i + cc).map(async (fc) => {
      const lang = detectLang(fc.path);
      if (!lang) { result.skippedFiles++; return; }
      try {
        const diffR = await computeDiffWithFallback(fc.originalContent ?? "", fc.modifiedContent, lang as string);
        if (diffR.operations.length > 0) {
          const evalR = evaluateRuleCandidate(diffR.operations, lang as string, 1, 1, RULE_GENERATION_THRESHOLDS.repeatWindowDays);
          if (evalR.generate && evalR.ruleCandidate) {
            result.generatedRules.push({ rule: evalR.ruleCandidate, filePath: fc.path });
          }
        }
      } catch (err) {
        result.errors.push({ filePath: fc.path, error: String(err) });
      }
      }));
    }
    await metricRepo.track("analyze_workspace", { taskId: input.taskId, analyzedFiles: result.analyzedFiles, rulesGenerated: result.generatedRules.length, source: input.taskId ? "codex" : "manual" });
    return { content: [{ type: "text", text: JSON.stringify({ ...result, warnings: warnings.length > 0 ? warnings : undefined }) }] };
  }
  if (!diffOut) {
    return { content: [{ type: "text", text: JSON.stringify({ error: "No diff output or git unavailable", result, warnings: warnings.length > 0 ? warnings : undefined }) }] };
  }

  const files = diffOut.split("\n").filter(Boolean).filter(f => !isSkipped(f));
  result.skippedFiles = diffOut.split("\n").filter(Boolean).length - files.length;

  async function processFile(fp: string): Promise<void> {
    try {
      const lang = detectLang(fp);
      if (!lang || !existsSync(fp)) return;

      const original = git(`show ${input.baseCommit}:${normalizePath(fp)}`);
      if (!original) return;
      const modified = readFileSync(fp, "utf-8");
      if (original === modified) return;

      const diffR = await computeDiffWithFallback(original, modified, lang);
      if (diffR.operations.length === 0) return;

      const origHash = git(`hash-object ${normalizePath(fp)}`).substring(0, 8);
      const distinctFiles = await diffLogRepo.countDistinctFiles(lang, origHash, RULE_GENERATION_THRESHOLDS.repeatWindowDays);
      const repeatCount = await diffLogRepo.countByPattern(lang, origHash, RULE_GENERATION_THRESHOLDS.repeatWindowDays);

      const evalR = evaluateRuleCandidate(diffR.operations, lang, distinctFiles + 1, repeatCount + 1, RULE_GENERATION_THRESHOLDS.repeatWindowDays);
      if (!evalR.generate || !evalR.ruleCandidate) return;

      // Skip rule creation if limits are reached (P1)
      if (!limitInfo.reached) {
        // Conflict check
        const existing = await ruleRepo.findConflicting(evalR.ruleCandidate.type, lang, evalR.ruleCandidate.pattern);
        for (const ex of existing) {
          const check = detectConflict(
            { ...ex, tags: ex.tags ?? [] } as unknown as Rule,
            { ...evalR.ruleCandidate, id: "", createdAt: new Date(), updatedAt: new Date(), matchCount: 0, priority: 1.0, status: "pending" as any, source: "auto" as any } as unknown as Rule,
          );
          if (check.hasConflict) {
            result.conflicts.push({ ruleA: evalR.ruleCandidate, ruleB: ex, reason: check.reason! });
          }
        }
      }

      // Log diff
      const modHash = git(`hash-object ${normalizePath(fp)}`).substring(0, 8);
      await diffLogRepo.create({
        filePath: fp, fileExtension: "." + (fp.split(".").pop() ?? ""), language: lang,
        originalHash: origHash, modifiedHash: modHash,
        diffContent: JSON.stringify(diffR.operations), astStatus: diffR.status,
        diffType: diffR.operations[0]?.type ?? "update", operations: JSON.stringify(diffR.operations),
      });

      if (!limitInfo.reached) {
        result.generatedRules.push({ rule: evalR.ruleCandidate, filePath: fp });
      }
      result.analyzedFiles++;
    } catch (err) {
      result.errors.push({ filePath: fp, error: String(err) });
    }
  }

  // Process with concurrency limit
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    await Promise.all(files.slice(i, i + CONCURRENCY).map(processFile));
  }

  const durationMs = performance.now() - startTime;
  await metricRepo.track("analyze_workspace", {
    taskId: input.taskId, analyzedFiles: result.analyzedFiles,
    rulesGenerated: result.generatedRules.length, conflictsFound: result.conflicts.length,
    source: "codex", durationMs,
  });

  return { content: [{ type: "text", text: JSON.stringify({ ...result, warnings: warnings.length > 0 ? warnings : undefined }) }] };
}
