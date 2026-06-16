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
 * @file DSL Compiler — 声明式约束编译器
 *
 * 将声明式约束 DSL 编译为 AstConstraint + ParsedConstraint。
 * 支持双向转换：DSL → AstConstraint 和 AstConstraint → DSL。
 *
 * DSL 语法规范：
 *   @constraint <constraint-name>
 *     .language    = "<typescript|javascript|python>"
 *     .nodeType    = "<AST node type>"
 *     .field.<name>.match      = "<literal>"
 *     .field.<name>.exists     = <true|false>
 *     .field.<name>.childType  = "<AST node type>"
 *     .field.<name>.childCount = { min: <int>, max: <int> }
 *     .severity    = <REJECT|WARN>
 *     .scope       = <GLOBAL|PROJECT>
 *     .evidence    = "<citation or rationale>"
 *     .message     = "<human-readable explanation>"
 *     .dependsOn   = [<constraint-name>, ...]
 *     .conflicts   = [<constraint-name>, ...]
 *     .appliesTo   = <path-pattern>
 *
 * 本文件是协议无关的独立模块 — 零外部依赖。
 */

// ── Core Types (self-contained, no cross-package imports) ──

/** AST 约束：必须 JSON 可序列化以进行存储。 */
export interface AstConstraint {
  nodeType: string;
  fields: Record<string, FieldConstraint>;
}

/** 单个字段的约束。 */
export interface FieldConstraint {
  match?: string;
  exists?: boolean;
  childType?: string;
  childCount?: { min?: number; max?: number };
}

// ── Parsed Constraint ──

export interface ParsedConstraint {
  name: string;
  constraints: AstConstraint[];
  severity: "REJECT" | "WARN";
  scope: "GLOBAL" | "PROJECT";
  evidence?: string;
  message: string;
  dependsOn: string[];
  conflicts: string[];
  appliesTo?: string;
  language?: string;
}

// ── DSL Compiler ──

export function compileConstraints(dslSource: string): ParsedConstraint[] {
  const results: ParsedConstraint[] = [];
  const blocks = dslSource.split(/^@constraint\s+/m).filter(Boolean);

  for (const block of blocks) {
    const parsed = parseConstraintBlock(block.trim());
    if (parsed && parsed.constraints.length > 0) {
      results.push(parsed);
    }
  }

  return results;
}

export function compileSingleConstraint(dslSource: string): ParsedConstraint | null {
  const results = compileConstraints(dslSource);
  return results.length > 0 ? results[0] : null;
}

export function emitConstraintDSL(constraint: ParsedConstraint): string {
  const lines: string[] = [];
  lines.push(`@constraint ${constraint.name}`);

  if (constraint.language) {
    lines.push(`  .language    = "${constraint.language}"`);
  }

  for (const ast of constraint.constraints) {
    lines.push(`  .nodeType    = "${ast.nodeType}"`);

    for (const [fieldPath, fc] of Object.entries(ast.fields)) {
      if (fc.match !== undefined) {
        lines.push(`  .field.${fieldPath}.match      = "${fc.match}"`);
      }
      if (fc.exists !== undefined) {
        lines.push(`  .field.${fieldPath}.exists     = ${fc.exists}`);
      }
      if (fc.childType !== undefined) {
        lines.push(`  .field.${fieldPath}.childType  = "${fc.childType}"`);
      }
      if (fc.childCount !== undefined) {
        const parts: string[] = [];
        if (fc.childCount.min !== undefined) parts.push(`min: ${fc.childCount.min}`);
        if (fc.childCount.max !== undefined) parts.push(`max: ${fc.childCount.max}`);
        lines.push(`  .field.${fieldPath}.childCount = { ${parts.join(", ")} }`);
      }
    }
  }

  lines.push(`  .severity    = ${constraint.severity}`);
  lines.push(`  .scope       = ${constraint.scope}`);

  if (constraint.evidence) {
    lines.push(`  .evidence    = "${constraint.evidence}"`);
  }
  if (constraint.message) {
    lines.push(`  .message     = "${constraint.message}"`);
  }
  if (constraint.dependsOn.length > 0) {
    lines.push(`  .dependsOn   = [${constraint.dependsOn.map(d => `"${d}"`).join(", ")}]`);
  }
  if (constraint.conflicts.length > 0) {
    lines.push(`  .conflicts   = [${constraint.conflicts.map(c => `"${c}"`).join(", ")}]`);
  }
  if (constraint.appliesTo) {
    lines.push(`  .appliesTo   = "${constraint.appliesTo}"`);
  }

  return lines.join("\n");
}

export function wrapAstConstraints(
  name: string,
  constraints: AstConstraint[],
  overrides?: Partial<Pick<ParsedConstraint, "severity" | "scope" | "evidence" | "message">>,
): ParsedConstraint {
  return {
    name,
    constraints,
    severity: overrides?.severity ?? "REJECT",
    scope: overrides?.scope ?? "GLOBAL",
    evidence: overrides?.evidence,
    message: overrides?.message ?? `Constraint group: ${name}`,
    dependsOn: [],
    conflicts: [],
  };
}

// ── Private ──

function parseConstraintBlock(block: string): ParsedConstraint | null {
  const lines = block.split("\n");
  const name = lines[0].trim();
  if (!name) return null;

  const constraint: ParsedConstraint = {
    name,
    constraints: [],
    severity: "REJECT",
    scope: "GLOBAL",
    message: "",
    dependsOn: [],
    conflicts: [],
  };

  let currentNodeType = "";
  let currentFields: Record<string, FieldConstraint> = {};

  const flushCurrent = () => {
    if (currentNodeType) {
      constraint.constraints.push({
        nodeType: currentNodeType,
        fields: { ...currentFields },
      });
      currentNodeType = "";
      currentFields = {};
    }
  };

  for (const rawLine of lines.slice(1)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const parsed = parseDotLine(line);
    if (!parsed) continue;

    const { key, value } = parsed;

    switch (key) {
      case "language":
        constraint.language = unquote(value);
        break;
      case "nodeType":
        flushCurrent();
        currentNodeType = unquote(value);
        break;
      case "severity":
        constraint.severity = value === "WARN" ? "WARN" : "REJECT";
        break;
      case "scope":
        constraint.scope = value === "PROJECT" ? "PROJECT" : "GLOBAL";
        break;
      case "evidence":
        constraint.evidence = unquote(value);
        break;
      case "message":
        constraint.message = unquote(value);
        break;
      case "dependsOn":
        constraint.dependsOn = parseStringArray(value);
        break;
      case "conflicts":
        constraint.conflicts = parseStringArray(value);
        break;
      case "appliesTo":
        constraint.appliesTo = unquote(value);
        break;
      default: {
        const fieldMatch = key.match(/^field\.(.+?)\.(.+)$/);
        if (fieldMatch) {
          const fieldName = fieldMatch[1];
          const prop = fieldMatch[2];

          if (!currentFields[fieldName]) {
            currentFields[fieldName] = {};
          }

          switch (prop) {
            case "match":
              currentFields[fieldName].match = unquote(value);
              break;
            case "exists":
              currentFields[fieldName].exists = value === "true";
              break;
            case "childType":
              currentFields[fieldName].childType = unquote(value);
              break;
            case "childCount":
              currentFields[fieldName].childCount = parseChildCount(value);
              break;
          }
        }
        break;
      }
    }
  }

  flushCurrent();
  return constraint;
}

function parseDotLine(line: string): { key: string; value: string } | null {
  const match = line.match(/^\.([a-zA-Z_][a-zA-Z0-9_.]*(?:\[(?:\d+)\])?)\s*=\s*(.+)$/);
  if (!match) return null;
  return { key: match[1], value: match[2].trim() };
}

function unquote(s: string): string {
  if ((s.startsWith("\"") && s.endsWith("\"")) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function parseStringArray(s: string): string[] {
  const inner = s.replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!inner) return [];
  return inner.split(",").map(item => unquote(item.trim())).filter(Boolean);
}


// ── Migration Report (Phase 3.3) ──

export interface MigrationReport {
  before: { count: number; avgFields: number };
  after: { count: number; avgFields: number };
  deltas: { countChange: number; coverageChange: number };
}

/**
 * Generate a migration report comparing old constraint list to new parsed constraints.
 * Pure computation — no DB access. Caller provides old/new constraint lists.
 */
export function generateMigrationReport(
  oldConstraints: string[],
  newConstraints: ParsedConstraint[],
): MigrationReport {
  const beforeParsed = oldConstraints.flatMap(src => {
    try { return compileConstraints(src); } catch { return []; }
  });
  const beforeCount = beforeParsed.length;
  const beforeTotalFields = beforeParsed.reduce(
    (sum, c) => sum + c.constraints.reduce((s, ast) => s + Object.keys(ast.fields).length, 0), 0,
  );
  const beforeAvgFields = beforeCount > 0 ? beforeTotalFields / beforeCount : 0;

  const afterCount = newConstraints.length;
  const afterTotalFields = newConstraints.reduce(
    (sum, c) => sum + c.constraints.reduce((s, ast) => s + Object.keys(ast.fields).length, 0), 0,
  );
  const afterAvgFields = afterCount > 0 ? afterTotalFields / afterCount : 0;

  const countChange = afterCount - beforeCount;
  const beforeCoverage = beforeAvgFields;
  const afterCoverage = afterAvgFields;
  const coverageChange = beforeCoverage > 0
    ? (afterCoverage - beforeCoverage) / beforeCoverage
    : afterCoverage > 0 ? 1 : 0;

  return {
    before: { count: beforeCount, avgFields: beforeAvgFields },
    after: { count: afterCount, avgFields: afterAvgFields },
    deltas: { countChange, coverageChange: Math.round(coverageChange * 10000) / 10000 },
  };
}

function parseChildCount(s: string): { min?: number; max?: number } {
  const result: { min?: number; max?: number } = {};
  const inner = s.replace(/^\{/, "").replace(/\}$/, "").trim();
  const parts = inner.split(",");
  for (const part of parts) {
    const [key, val] = part.split(":").map(x => x.trim());
    const num = parseInt(val, 10);
    if (!isNaN(num)) {
      if (key === "min") result.min = num;
      if (key === "max") result.max = num;
    }
  }
  return result;
}
