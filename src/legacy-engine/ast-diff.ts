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

import { ASTNode, AtomicOp, DiffResult, NodeSignature } from "../types.js";
import { buildSignatureMap } from "./ast-node.js";

/** Enhanced signature match using structuralHash (Merkle-tree style). */
function signaturesEqual(a?: NodeSignature, b?: NodeSignature): boolean {
  if (!a || !b) return false;
  return a.structuralHash === b.structuralHash;
}

function findMatchingChild(
  child: ASTNode, candidates: ASTNode[],
  oldSigs: Map<ASTNode, NodeSignature>,
  newSigs: Map<ASTNode, NodeSignature>,
  used: Set<ASTNode>,
): ASTNode | undefined {
  const childSig = oldSigs.get(child);
  if (!childSig) return undefined;
  return candidates.find(c => !used.has(c) && signaturesEqual(newSigs.get(c), childSig));
}

/** Post-process operations: convert DELETE+INSERT pairs with matching content to MOVE.
 *  This handles cross-parent moves that can"t be detected within a single walk level. */
function detectMovesPostProcess(ops: AtomicOp[]): void {
  // Collect deletes and inserts by key (nodeType + originalText or modifiedText)
  const deletes: { op: AtomicOp; key: string }[] = [];
  const inserts: { op: AtomicOp; key: string }[] = [];
  for (const op of ops) {
    if (op.type === "DELETE" && op.originalText) {
      deletes.push({ op, key: op.nodeType + ":" + op.originalText });
    }
    if (op.type === "INSERT" && op.modifiedText) {
      inserts.push({ op, key: op.nodeType + ":" + op.modifiedText });
    }
  }

  // Match delete+insert pairs by key and convert to MOVE
  for (const d of deletes) {
    const matchIdx = inserts.findIndex(i => i.key === d.key);
    if (matchIdx >= 0) {
      const match = inserts[matchIdx];
      d.op.type = "MOVE" as any;
      d.op.modifiedText = match.op.modifiedText;
      d.op.endByte = Math.max(d.op.endByte, match.op.endByte);
      // Mark the matched insert for removal
      match.op.type = "__REMOVED__" as any;
      inserts.splice(matchIdx, 1);
    }
  }

  // Remove marked operations
  for (let i = ops.length - 1; i >= 0; i--) {
    if (ops[i].type === ("__REMOVED__" as any)) {
      ops.splice(i, 1);
    }
  }
}

export function computeDiff(oldAst: ASTNode, newAst: ASTNode): DiffResult {
  const startTime = performance.now();
  try {
    if (!oldAst || !newAst) {
      return { operations: [], status: "failed", confidence: "low", processedBytes: 0, durationMs: performance.now() - startTime, error: "Invalid AST" };
    }
    const oldSigs = buildSignatureMap(oldAst);
    const newSigs = buildSignatureMap(newAst);
    const operations: AtomicOp[] = [];
    const matchedNew = new Set<ASTNode>();

    function walk(oldNode: ASTNode, newNode: ASTNode): void {
      const usedInLevel = new Set<ASTNode>();
      const unmatchedOld: ASTNode[] = [];
      const unmatchedNew: ASTNode[] = [];

      // Phase 1: Exact structural match
      for (const oc of oldNode.children) {
        const match = findMatchingChild(oc, newNode.children, oldSigs, newSigs, usedInLevel);
        if (match) {
          usedInLevel.add(match);
          matchedNew.add(match);
          if (oc.text !== match.text && oc.type === match.type) {
            operations.push({ type: "UPDATE", nodeType: oc.type, originalText: oc.text, modifiedText: match.text, startByte: Math.min(oc.startByte, match.startByte), endByte: Math.max(oc.endByte, match.endByte) });
          }
          walk(oc, match);
        } else {
          unmatchedOld.push(oc);
        }
      }

      for (const nc of newNode.children) {
        if (!usedInLevel.has(nc)) {
          unmatchedNew.push(nc);
        }
      }

      // Phase 2: MOVE detection — same structuralHash, different parent within same level
      const movedSet = new Set<ASTNode>();
      for (const oc of unmatchedOld) {
        const ocSig = oldSigs.get(oc);
        if (!ocSig) {
          operations.push({ type: "DELETE", nodeType: oc.type, originalText: oc.text, startByte: oc.startByte, endByte: oc.endByte, parentType: oldNode.type });
          continue;
        }
        const moveIdx = unmatchedNew.findIndex(nc => {
          if (movedSet.has(nc)) return false;
          const ncSig = newSigs.get(nc);
          return ncSig && ncSig.structuralHash === ocSig.structuralHash;
        });
        if (moveIdx >= 0) {
          const moveTarget = unmatchedNew[moveIdx];
          movedSet.add(moveTarget);
          matchedNew.add(moveTarget);
          operations.push({ type: "MOVE", nodeType: oc.type, originalText: oc.text, modifiedText: moveTarget.text, startByte: Math.min(oc.startByte, moveTarget.startByte), endByte: Math.max(oc.endByte, moveTarget.endByte), parentType: oldNode.type });
        } else {
          operations.push({ type: "DELETE", nodeType: oc.type, originalText: oc.text, startByte: oc.startByte, endByte: oc.endByte, parentType: oldNode.type });
        }
      }

      // Phase 3: Remaining unmatched new → INSERT
      for (const nc of unmatchedNew) {
        if (!movedSet.has(nc)) {
          operations.push({ type: "INSERT", nodeType: nc.type, modifiedText: nc.text, startByte: nc.startByte, endByte: nc.endByte, parentType: newNode.type });
        }
      }
    }

    walk(oldAst, newAst);

    // Post-process: cross-parent MOVE detection
    detectMovesPostProcess(operations);

    const durationMs = performance.now() - startTime;
    const totalNodes = oldAst.children.length + newAst.children.length;
    const threshold = Math.max(totalNodes * 0.6, 1);
    return {
      operations,
      status: operations.length <= threshold ? "success" : "fallback",
      confidence: operations.length <= threshold ? "high" : "low",
      processedBytes: Math.max(oldAst.endByte, newAst.endByte),
      durationMs,
    };
  } catch (err) {
    return { operations: [], status: "failed", confidence: "low", processedBytes: 0, durationMs: performance.now() - startTime, error: String(err) };
  }
}
