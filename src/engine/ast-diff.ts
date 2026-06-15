import { ASTNode, AtomicOp, DiffResult, NodeSignature } from "../types.js";
import { buildSignatureMap } from "./ast-node.js";

/** Enhanced signature match using structuralHash (Merkle-tree style).
 *  Structurally identical subtrees match even if text differs,
 *  detecting text changes as UPDATE instead of DELETE+INSERT. */
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
  const sig = oldSigs.get(child);
  if (!sig) return undefined;
  return candidates.find(c => !used.has(c) && signaturesEqual(newSigs.get(c), sig));
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

    // Root-level comparison: detect UPDATE when root text changes but type stays same
    if (oldAst.text !== newAst.text && oldAst.type === newAst.type) {
      operations.push({
        type: "UPDATE", nodeType: oldAst.type,
        originalText: oldAst.text, modifiedText: newAst.text,
        startByte: Math.min(oldAst.startByte, newAst.startByte),
        endByte: Math.max(oldAst.endByte, newAst.endByte),
      });
    }

    function walk(oldNode: ASTNode, newNode: ASTNode): void {
      const usedInLevel = new Set<ASTNode>();
      for (const oc of oldNode.children) {
        const match = findMatchingChild(oc, newNode.children, oldSigs, newSigs, usedInLevel);
        if (match) {
          usedInLevel.add(match);
          if (oc.text !== match.text && oc.type === match.type) {
            operations.push({ type: "UPDATE", nodeType: oc.type, originalText: oc.text, modifiedText: match.text, startByte: Math.min(oc.startByte, match.startByte), endByte: Math.max(oc.endByte, match.endByte) });
          }
          walk(oc, match);
        } else {
          operations.push({ type: "DELETE", nodeType: oc.type, originalText: oc.text, startByte: oc.startByte, endByte: oc.endByte, parentType: oldNode.type });
        }
      }
      for (const nc of newNode.children) {
        if (!usedInLevel.has(nc)) {
          operations.push({ type: "INSERT", nodeType: nc.type, modifiedText: nc.text, startByte: nc.startByte, endByte: nc.endByte, parentType: newNode.type });
        }
      }
    }

    walk(oldAst, newAst);
    const durationMs = performance.now() - startTime;
    // totalNodes counts total children at root; threshold scales with tree size
    const totalChildren = oldAst.children.length + newAst.children.length;
    const threshold = Math.max(totalChildren * 0.6, 1);
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
