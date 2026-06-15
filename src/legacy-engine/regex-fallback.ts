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
 * @deprecated LEGACY ENGINE MODULE — Preserved for reference only.
 * Do NOT modify. The new cognition-engine module replaces this entire subsystem.
 * See src/cognition-engine/ for the replacement.
 */

import { AtomicOp, DiffResult } from "../types.js";

export function regexDiff(original: string, modified: string): DiffResult {
  const startTime = performance.now();
  try {
    const origLines = original.split("\n");
    const modLines = modified.split("\n");
    const ops: AtomicOp[] = [];
    const maxLen = Math.max(origLines.length, modLines.length);
    for (let i = 0; i < maxLen; i++) {
      if (i >= origLines.length) {
        ops.push({ type: "INSERT", nodeType: "line", modifiedText: modLines[i], startByte: 0, endByte: 0 });
      } else if (i >= modLines.length) {
        ops.push({ type: "DELETE", nodeType: "line", originalText: origLines[i], startByte: 0, endByte: 0 });
      } else if (origLines[i] !== modLines[i]) {
        ops.push({ type: "UPDATE", nodeType: "line", originalText: origLines[i], modifiedText: modLines[i], startByte: 0, endByte: 0 });
      }
    }
    return { operations: ops, status: "fallback", confidence: "medium", processedBytes: Math.max(original.length, modified.length), durationMs: performance.now() - startTime };
  } catch (err) {
    return { operations: [], status: "failed", confidence: "low", processedBytes: 0, durationMs: performance.now() - startTime, error: String(err) };
  }
}
