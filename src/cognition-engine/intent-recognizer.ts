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
 * @file Intent Recognizer
 * Analyzes code diffs and classifies the developer intent behind them.
 * Maps to three intent levels: REFACTOR, BUGFIX, BOILERPLATE.
 * The result biases Graph Traverser traversal strategy.
 *
 * Reuses: legacy-engine/parsers.ts (parseToAST) for optional AST analysis
 */

import { parseToAST } from "../legacy-engine/parsers.js";
import type { ASTNode } from "../types.js";
import type { IntentResult, IntentType } from "./types.js";

// ── Constants ─────────────────────────────────────────────

const REFACTOR_THRESHOLD = { minFiles: 2, minAddedRatio: 0.3, minNodeTypes: 3 };
const BUGFIX_THRESHOLD = { maxFiles: 2, maxChangedLines: 50, errorKeywordRatio: 0.1 };
const BOILERPLATE_THRESHOLD = { addRemoveRatio: 5.0, minAddedLines: 20 };

const ERROR_KEYWORDS = [
  "error", "undefined", "null", "catch", "throw", "try",
  "fail", "invalid", "missing", "fallback", "guard", "check",
  "assert", "validate", "optional", "??", "?. ", "??=",
];

const REFACTOR_KEYWORDS = [
  "extract", "rename", "move", "split", "merge", "inline",
  "abstract", "interface", "type",
];

// ── Diff Parsing ──────────────────────────────────────────

interface DiffStats {
  filesChanged: number;
  addedLines: number;
  removedLines: number;
  perFile: Map<string, { added: number; removed: number }>;
  hunks: number;
}

function parseDiffStats(diffContent: string): DiffStats {
  const stats: DiffStats = {
    filesChanged: 0,
    addedLines: 0,
    removedLines: 0,
    perFile: new Map(),
    hunks: 0,
  };

  let currentFile = "unknown";
  for (const line of diffContent.split("\n")) {
    if (line.startsWith("diff --git ")) {
      stats.filesChanged++;
      const match = line.match(/diff --git a\/(.+) b\//);
      if (match) currentFile = match[1];
      if (!stats.perFile.has(currentFile)) {
        stats.perFile.set(currentFile, { added: 0, removed: 0 });
      }
    } else if (line.startsWith("@@ ")) {
      stats.hunks++;
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      stats.addedLines++;
      const pf = stats.perFile.get(currentFile);
      if (pf) pf.added++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      stats.removedLines++;
      const pf = stats.perFile.get(currentFile);
      if (pf) pf.removed++;
    }
  }
  return stats;
}

// ── Node Type Analysis ────────────────────────────────────

async function analyzeNodeTypes(
  diffContent: string,
  filePath?: string,
): Promise<string[]> {
  const nodeTypes = new Set<string>();
  const lines = diffContent.split("\n");

  // Try AST analysis on file content (best effort)
  if (filePath) {
    for (const line of lines) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        const code = line.slice(1).trim();
        if (code.length > 3) {
          try {
            const lang = filePath.endsWith(".ts") || filePath.endsWith(".tsx")
              ? "typescript" : filePath.endsWith(".py") ? "python" : "javascript";
            const result = await parseToAST(code, lang);
            collectNodeTypes(result.ast, nodeTypes);
          } catch {
            // Silently continue — AST analysis is best-effort
          }
        }
      }
    }
  }

  // Fallback: keyword-based detection
  const allText = lines.filter(l => l.startsWith("+") || l.startsWith("-")).join(" ").toLowerCase();
  if (!nodeTypes.size) {
    const keywordMap: Record<string, string[]> = {
      function_declaration: ["function", "=>", "=>"],
      class_declaration: ["class "],
      variable_declaration: ["const ", "let ", "var "],
      if_statement: ["if ", "else "],
      try_statement: ["try ", "catch ", "finally"],
      import_statement: ["import ", "require("],
      export_statement: ["export "],
      interface_declaration: ["interface "],
      type_alias: ["type ", "| ", "& "],
      return_statement: ["return "],
    };
    for (const [nt, keywords] of Object.entries(keywordMap)) {
      if (keywords.some(k => allText.includes(k))) {
        nodeTypes.add(nt);
      }
    }
  }

  return [...nodeTypes];
}

function collectNodeTypes(node: ASTNode, types: Set<string>): void {
  types.add(node.type);
  for (const child of node.children) {
    collectNodeTypes(child, types);
  }
}

// ── Intent Classification ─────────────────────────────────

function classifyIntent(
  stats: DiffStats,
  nodeTypes: string[],
  diffContent: string,
): { intent: IntentType; confidence: number; reasoning: string[] } {
  const totalChanged = stats.addedLines + stats.removedLines;
  const addRemoveRatio = stats.removedLines > 0
    ? stats.addedLines / stats.removedLines
    : stats.addedLines > 0 ? Infinity : 0;
  const allText = diffContent.toLowerCase();
  const errorHits = ERROR_KEYWORDS.filter(k => allText.includes(k)).length;
  const errorRatio = allText.length > 0 ? errorHits / (allText.split("\n").length) : 0;
  const refactorHits = REFACTOR_KEYWORDS.filter(k => allText.includes(k)).length;
  const uniqueNodeTypes = new Set(nodeTypes);

  const reasoning: string[] = [];
  let scores = { refactor: 0, bugfix: 0, boilerplate: 0 };

  // REFACTOR signals
  if (stats.filesChanged >= REFACTOR_THRESHOLD.minFiles) {
    scores.refactor += 0.3;
    reasoning.push(`multi-file change (${stats.filesChanged} files)`);
  }
  if (uniqueNodeTypes.size >= REFACTOR_THRESHOLD.minNodeTypes) {
    scores.refactor += 0.2;
    reasoning.push(`diverse AST types affected (${uniqueNodeTypes.size} types)`);
  }
  if (refactorHits > 2) {
    scores.refactor += 0.2;
    reasoning.push('refactoring keywords detected');
  }
  if (stats.hunks > 3 && stats.filesChanged > 1) {
    scores.refactor += 0.3;
    reasoning.push('cross-module structural changes');
  }

  // BUGFIX signals
  if (totalChanged <= BUGFIX_THRESHOLD.maxChangedLines) {
    scores.bugfix += 0.2;
    reasoning.push(`small change footprint (${totalChanged} lines)`);
  }
  if (stats.filesChanged <= BUGFIX_THRESHOLD.maxFiles) {
    scores.bugfix += 0.1;
  }
  if (errorRatio >= BUGFIX_THRESHOLD.errorKeywordRatio) {
    scores.bugfix += 0.3;
      reasoning.push('error-handling keywords present');
  }
  if (uniqueNodeTypes.has("try_statement") || uniqueNodeTypes.has("if_statement")) {
    scores.bugfix += 0.2;
    reasoning.push(`conditional / guard patterns`);
  }

  // BOILERPLATE signals
  if (addRemoveRatio >= BOILERPLATE_THRESHOLD.addRemoveRatio) {
    scores.boilerplate += 0.3;
    reasoning.push(`high add/remove ratio (${addRemoveRatio.toFixed(1)})`);
  }
  if (stats.addedLines >= BOILERPLATE_THRESHOLD.minAddedLines && stats.removedLines < 5) {
    scores.boilerplate += 0.3;
    reasoning.push('net-new code addition');
  }
  if (uniqueNodeTypes.size <= 2 && stats.addedLines > 10) {
    scores.boilerplate += 0.2;
    reasoning.push('repetitive / template-like structure');
  }
  
  const maxScore = Math.max(scores.refactor, scores.bugfix, scores.boilerplate);
  if (maxScore === 0) {
    return { intent: "BUGFIX", confidence: 0.3, reasoning: ["no clear signal"] };
  }
  
  let intent: IntentType;
  if (scores.refactor >= maxScore && scores.refactor >= 0.4) intent = "REFACTOR";
  else if (scores.boilerplate >= maxScore && scores.boilerplate >= 0.3) intent = "BOILERPLATE";
  else intent = "BUGFIX";

  const confidence = Math.min(0.95, maxScore + 0.2);

  if (reasoning.length === 0) reasoning.push("default classification");
  return { intent, confidence, reasoning };
}

// ── Public API ────────────────────────────────────────────

/**
 * Analyze a code diff and classify the developer intent.
 *
 * @param diffContent  Unified diff text (from git diff output)
 * @param filePath     Optional file path for AST analysis
 * @returns Structured intent classification
 */
export async function recognizeIntent(
  diffContent: string,
  filePath?: string,
): Promise<IntentResult> {
  const stats = parseDiffStats(diffContent);
  const nodeTypes = await analyzeNodeTypes(diffContent, filePath);
  const { intent, confidence, reasoning } = classifyIntent(stats, nodeTypes, diffContent);

  return {
    intent,
    confidence,
    reasoning,
    stats: {
      addedLines: stats.addedLines,
      removedLines: stats.removedLines,
      filesChanged: stats.filesChanged,
      nodeTypeChanges: nodeTypes,
    },
  };
}


