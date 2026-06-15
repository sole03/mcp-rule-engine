import { ASTNode, NodeSignature } from "../types.js";

function simpleHash(s: string): string {
  if (!s) return "0";
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(16);
}

export function computeSignature(node: ASTNode, childSigs?: NodeSignature[], hashFn?: (s: string) => string): NodeSignature {
  const hash = (hashFn ?? simpleHash);
  const childStructHashes = childSigs
    ? childSigs.map(s => s.structuralHash)
    : node.children.map(c => computeSignature(c, undefined, hashFn).structuralHash);
  const structuralHash = hash(node.type + "[" + childStructHashes.join(",") + "]");
  const childTypes = node.children.map(c => c.type).join(",");
  return {
    type: node.type,
    textHash: hash(node.text),
    childrenCount: node.children.length,
    childTypesHash: hash(childTypes),
    structuralHash,
  };
}

export function buildSignatureMap(node: ASTNode, hashFn?: (s: string) => string): Map<ASTNode, NodeSignature> {
  const map = new Map<ASTNode, NodeSignature>();
  function walk(n: ASTNode): void {
    for (const child of n.children) walk(child);
    const childSigs = n.children.map(c => map.get(c)!);
    map.set(n, computeSignature(n, childSigs, hashFn));
  }
  walk(node);
  return map;
}
