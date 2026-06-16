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
 * @file Rule Preview — 语义化 Diff 预览 (Dimension 1.3)
 *
 * 复用 CowSandbox 做纯内存沙箱预览：读文件内容 → 应用规则 pattern → 返回 before/after/diff。
 * 不写入 DB，不产生副作用。
 */

import { readFileSync, existsSync } from "fs";

export interface PreviewResult {
  ruleId: string;
  filePath: string;
  before: string;
  after: string;
  diff: string;
}

/**
 * Preview the effect of a rule's pattern on a file.
 *
 * @param ruleId    The rule ID (for logging only).
 * @param pattern   The rule pattern as a regex string.
 * @param filePath  Path to the target file.
 * @param suggestion Optional replacement string. If omitted, defaults to empty.
 * @returns { before, after, diff: unified diff }
 */
export function previewRule(
  ruleId: string,
  pattern: string,
  filePath: string,
  suggestion?: string,
): PreviewResult {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const before = readFileSync(filePath, "utf8");

  // Apply pattern as a regex replacement
  const regex = new RegExp(pattern, "gm");
  const after = suggestion !== undefined
    ? before.replace(regex, suggestion)
    : before;

  const diff = generateUnifiedDiff(filePath, before, after);

  return { ruleId, filePath, before, after, diff };
}

/**
 * Generate a simple unified diff string.
 */
function generateUnifiedDiff(filePath: string, before: string, after: string): string {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");

  const header = `--- a/${filePath}\n+++ b/${filePath}\n`;
  let result = header;

  // Simple line-by-line diff
  const maxLen = Math.max(beforeLines.length, afterLines.length);
  let hunkLines: string[] = [];
  let hunkStart = -1;
  let changed = false;

  for (let i = 0; i < maxLen; i++) {
    const bl = i < beforeLines.length ? beforeLines[i] : undefined;
    const al = i < afterLines.length ? afterLines[i] : undefined;

    if (bl !== al) {
      if (!changed) {
        hunkStart = i;
        changed = true;
      }
      if (bl !== undefined) hunkLines.push(`-${bl}`);
      if (al !== undefined) hunkLines.push(`+${al}`);
    } else if (changed) {
      // End of change hunk
      result += `@@ -${hunkStart + 1},${beforeLines.slice(hunkStart, i).length} +${hunkStart + 1},${afterLines.slice(hunkStart, i).length} @@\n`;
      result += hunkLines.join("\n") + "\n";
      hunkLines = [];
      changed = false;
    }
  }

  // Flush remaining hunk
  if (changed && hunkLines.length > 0) {
    result += `@@ -${hunkStart + 1},${beforeLines.slice(hunkStart).length} +${hunkStart + 1},${afterLines.slice(hunkStart).length} @@\n`;
    result += hunkLines.join("\n") + "\n";
  }

  return result || header + " (no changes)\n";
}
