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
 * @file Constraint Runtime — 契约即代码运行时
 *
 * 机器可证明的轻量级约束执行器。
 * 将 ParsedConstraint 转化为可检验的不变量。
 * 协议无关的独立模块 — 零外部依赖。
 */

import type { ParsedConstraint } from "./dsl-compiler.js";

// ── Types ──

interface FlatNode {
  path: string;
  type: string;
  text: string;
  name?: string;
  children: string[];
}

export interface ContractEvaluation {
  contractName: string;
  passed: boolean;
  violations: ContractViolation[];
  dependsOn: string[];
  conflictsWith: string[];
}

export interface ContractViolation {
  constraintPath: string;
  expected: string;
  actual: string;
  message: string;
  evidence?: string;
}

export type ConstraintVerdict =
  | { result: "A_VALID"; reason: string; violationsA: number; violationsB: number }
  | { result: "B_VALID"; reason: string; violationsA: number; violationsB: number }
  | { result: "BOTH_VALID"; reason: string; violationsA: number; violationsB: number }
  | { result: "UNDECIDABLE"; reason: string; violationsA: number; violationsB: number };

// ── Core ──

export function evaluateContracts(
  contracts: ParsedConstraint[],
  flatNodes: FlatNode[],
  filePath?: string,
): ContractEvaluation[] {
  const results: ContractEvaluation[] = [];

  for (const contract of contracts) {
    if (contract.appliesTo && filePath && !matchGlob(filePath, contract.appliesTo)) {
      continue;
    }
    const violations = evaluateSingle(contract, flatNodes);
    results.push({
      contractName: contract.name,
      passed: violations.length === 0,
      violations,
      dependsOn: contract.dependsOn,
      conflictsWith: contract.conflicts,
    });
  }

  return results;
}

export function topologicalSort(contracts: ParsedConstraint[]): {
  ordered: string[];
  cycles: string[][];
  conflicts: [string, string][];
} {
  const nameSet = new Set(contracts.map(c => c.name));
  if (nameSet.size === 0) return { ordered: [], cycles: [], conflicts: [] };

  // Build adjacency: X dependsOn Y means edge Y → X (Y must come first)
  const adj = new Map<string, string[]>(); // prerequisite → dependents
  const inDeg = new Map<string, number>();

  for (const c of contracts) {
    if (!inDeg.has(c.name)) inDeg.set(c.name, 0);
    if (!adj.has(c.name)) adj.set(c.name, []);
    for (const dep of c.dependsOn) {
      if (nameSet.has(dep)) {
        // dep is prerequisite; c.name depends on dep
        // Edge: dep → c.name
        if (!adj.has(dep)) adj.set(dep, []);
        adj.get(dep)!.push(c.name);
        inDeg.set(c.name, (inDeg.get(c.name) ?? 0) + 1);
      }
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  const names = Array.from(inDeg.keys());
  for (const name of names) {
    if ((inDeg.get(name) ?? 0) === 0) queue.push(name);
  }

  const ordered: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    ordered.push(node);
    for (const dep of adj.get(node) ?? []) {
      const newDeg = (inDeg.get(dep) ?? 1) - 1;
      inDeg.set(dep, newDeg);
      if (newDeg === 0) queue.push(dep);
    }
  }

  // Detect cycles: any remaining node with inDeg > 0
  const cycles: string[][] = [];
  for (const name of Array.from(inDeg.keys())) {
    if ((inDeg.get(name) ?? 0) > 0) {
      const cycle = findCycle(name, adj, new Set());
      if (cycle.length > 0) cycles.push(cycle);
    }
  }

  // Detect declared conflicts
  const declaredConflicts: [string, string][] = [];
  for (const c of contracts) {
    for (const conflict of c.conflicts) {
      if (nameSet.has(conflict)) {
        declaredConflicts.push([c.name, conflict]);
      }
    }
  }

  return { ordered, cycles, conflicts: declaredConflicts };
}

export function judgeProposals(
  descriptionA: string,
  descriptionB: string,
  contracts: ParsedConstraint[],
): ConstraintVerdict {
  const nodesA = textToFlatNodes(descriptionA);
  const nodesB = textToFlatNodes(descriptionB);

  const evalA = evaluateContracts(contracts, nodesA);
  const evalB = evaluateContracts(contracts, nodesB);

  const violationsA = evalA.reduce((sum, e) => sum + e.violations.length, 0);
  const violationsB = evalB.reduce((sum, e) => sum + e.violations.length, 0);

  if (violationsA === 0 && violationsB > 0) {
    return { result: "A_VALID", reason: `Rule A passes all constraints. Rule B has ${violationsB} violation(s).`, violationsA, violationsB };
  }
  if (violationsB === 0 && violationsA > 0) {
    return { result: "B_VALID", reason: `Rule B passes all constraints. Rule A has ${violationsA} violation(s).`, violationsA, violationsB };
  }
  if (violationsA === 0 && violationsB === 0) {
    return { result: "BOTH_VALID", reason: "Both rules satisfy all constraints. Manual merge recommended.", violationsA, violationsB };
  }
  return { result: "UNDECIDABLE", reason: `Both violate constraints (A:${violationsA}, B:${violationsB}). Manual review needed.`, violationsA, violationsB };
}

// ── Private ──

function evaluateSingle(contract: ParsedConstraint, flatNodes: FlatNode[]): ContractViolation[] {
  const violations: ContractViolation[] = [];

  for (const constraint of contract.constraints) {
    for (const node of flatNodes) {
      if (node.type !== constraint.nodeType) continue;

      for (const field of Object.keys(constraint.fields)) {
        const fc = constraint.fields[field];
        const fieldNode = resolveField(node, field, flatNodes);

        if (!fieldNode) {
          if (fc.exists === true) {
            violations.push({
              constraintPath: `${contract.name}.${constraint.nodeType}.${field}`,
              expected: `${field} should exist`,
              actual: "(missing)",
              message: contract.message,
              evidence: contract.evidence,
            });
          }
          continue;
        }

        if (fc.match !== undefined) {
          const value = fieldNode.text || fieldNode.type;
          if (!matchesPattern(value, fc.match)) {
            violations.push({
              constraintPath: `${contract.name}.${constraint.nodeType}.${field}`,
              expected: `matches "${fc.match}"`,
              actual: value || "(empty)",
              message: contract.message,
              evidence: contract.evidence,
            });
          }
        }

        if (fc.exists === false) {
          violations.push({
            constraintPath: `${contract.name}.${constraint.nodeType}.${field}`,
            expected: `${field} should not exist`,
            actual: fieldNode.text || fieldNode.type,
            message: contract.message,
            evidence: contract.evidence,
          });
        }

        if (fc.childType !== undefined) {
          const match = flatNodes.filter(n => n.type === fc.childType);
          if (match.length === 0) {
            violations.push({
              constraintPath: `${contract.name}.${constraint.nodeType}.${field}.childType`,
              expected: `child of type "${fc.childType}"`,
              actual: "(none matching)",
              message: contract.message,
              evidence: contract.evidence,
            });
          }
        }

        if (fc.childCount !== undefined) {
          const children = flatNodes.filter(n => fieldNode.children.includes(n.path));
          if (fc.childCount.min !== undefined && children.length < fc.childCount.min) {
            violations.push({
              constraintPath: `${contract.name}.${constraint.nodeType}.${field}.childCount`,
              expected: `at least ${fc.childCount.min} children`,
              actual: `${children.length}`,
              message: contract.message,
              evidence: contract.evidence,
            });
          }
          if (fc.childCount.max !== undefined && children.length > fc.childCount.max) {
            violations.push({
              constraintPath: `${contract.name}.${constraint.nodeType}.${field}.childCount`,
              expected: `at most ${fc.childCount.max} children`,
              actual: `${children.length}`,
              message: contract.message,
              evidence: contract.evidence,
            });
          }
        }
      }
    }
  }

  return violations;
}

function resolveField(node: FlatNode, field: string, allNodes: FlatNode[]): FlatNode | null {
  if (node.children) {
    const child = node.children
      .map(p => allNodes.find(n => n.path === p))
      .find(n => n && (n.name === field || n.type === field));
    if (child) return child;
  }
  return allNodes.find(n => n.name === field && node.children.includes(n.path)) ?? null;
}

function matchesPattern(value: string, pattern: string): boolean {
  if (pattern.startsWith("/") && pattern.lastIndexOf("/") > 0) {
    try {
      const lastSlash = pattern.lastIndexOf("/");
      const regexStr = pattern.slice(1, lastSlash);
      const flags = pattern.slice(lastSlash + 1);
      return new RegExp(regexStr, flags).test(value);
    } catch {
      return value === pattern;
    }
  }
  return value === pattern;
}

function matchGlob(filePath: string, glob: string): boolean {
  const regexStr = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "___DS___")
    .replace(/\*/g, "[^/]*")
    .replace(/___DS___/g, ".*")
    .replace(/\?/g, ".");
  try { return new RegExp(`^${regexStr}$`).test(filePath); } catch { return false; }
}

function textToFlatNodes(text: string): FlatNode[] {
  const lines = text.split("\n").filter(Boolean);
  return lines.map((line, i) => ({
    path: `line_${i}`,
    type: guessNodeType(line),
    text: line.trim(),
    name: undefined,
    children: [],
  }));
}

function guessNodeType(line: string): string {
  const t = line.trim();
  if (t.startsWith("import ")) return "import_statement";
  if (t.startsWith("export ")) return "export_statement";
  if (t.startsWith("function ")) return "function_declaration";
  if (t.startsWith("if ")) return "if_statement";
  if (t.startsWith("//") || t.startsWith("/*")) return "comment";
  if (t.includes("(") && t.endsWith(")")) return "call_expression";
  if (t.includes("=")) return "variable_declarator";
  return "expression_statement";
}

function findCycle(name: string, graph: Map<string, string[]>, visited: Set<string>, path: string[] = []): string[] {
  if (visited.has(name)) {
    const idx = path.indexOf(name);
    return idx >= 0 ? [...path.slice(idx), name] : [];
  }
  visited.add(name);
  path.push(name);
  for (const dep of graph.get(name) ?? []) {
    const cycle = findCycle(dep, graph, visited, path);
    if (cycle.length > 0) return cycle;
  }
  path.pop();
  visited.delete(name);
  return [];
}