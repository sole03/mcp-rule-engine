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
