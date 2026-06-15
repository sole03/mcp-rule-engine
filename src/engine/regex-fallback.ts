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
