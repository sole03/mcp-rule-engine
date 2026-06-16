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
 * @file Architecture Templates — 架构约束模板库
 *
 * 跨模块不变量。确保代码结构符合预设架构决策。
 */

export const ARCHITECTURE_TEMPLATES: string[] = [

  // ── ban-circular-import ──
  `@constraint ban-circular-import
  .language    = "typescript"
  .nodeType    = "import_statement"
  .field.source.match      = "/(\.\.\/)+src\//i"
  .severity    = REJECT
  .scope       = PROJECT
  .evidence    = "Architecture rule: src/ must not import from a parent src/ via relative paths — use module aliases."
  .message     = "Circular or parent-level import detected. Use configured path aliases (e.g., @core/, @data/) instead of relative paths beyond one level."
  .dependsOn   = []
  .conflicts   = []`,

  // ── enforce-layer-boundary ──
  `@constraint enforce-layer-boundary
  .language    = "typescript"
  .nodeType    = "import_statement"
  .field.source.match      = "/data/"
  .severity    = REJECT
  .scope       = PROJECT
  .evidence    = "Architecture rule: /adapters/ must not import /data/ directly. Use repository interfaces."
  .message     = "Layer violation: adapter importing data layer directly. Inject repository interfaces via DI instead."
  .appliesTo   = "**/adapters/**"`,

  // ── max-file-size ──
  `@constraint max-file-size
  .language    = "typescript"
  .nodeType    = "program"
  .field.statements.childCount = { min: 0, max: 400 }
  .severity    = WARN
  .scope       = PROJECT
  .evidence    = "Architecture rule: files exceeding 400 statements should be split into smaller modules."
  .message     = "File exceeds recommended size (400+ statements). Consider splitting into smaller modules."
  .appliesTo   = "**/*.ts"`,

  // ── max-function-size ──
  `@constraint max-function-size
  .language    = "typescript"
  .nodeType    = "function_declaration"
  .field.body.childCount = { min: 0, max: 50 }
  .severity    = WARN
  .scope       = PROJECT
  .evidence    = "Architecture rule: functions should not exceed 50 statements for readability and testability."
  .message     = "Function too large (50+ statements). Extract sub-functions or use a helper module."`,

  // ── no-unrestricted-globals ──
  `@constraint no-unrestricted-globals
  .language    = "typescript"
  .nodeType    = "identifier"
  .field.name.match      = "/(global|process\.env|window)/"
  .severity    = WARN
  .scope       = GLOBAL
  .evidence    = "Architecture rule: direct global access makes testing difficult. Use DI or context injection."
  .message     = "Direct global access detected. Inject dependencies instead of accessing globals directly."
  .appliesTo   = "**/*.ts"`,

  // ── enforce-single-export-default ──
  `@constraint enforce-single-export-default
  .language    = "typescript"
  .nodeType    = "export_statement"
  .field.default.exists     = true
  .severity    = WARN
  .scope       = PROJECT
  .evidence    = "Architecture rule: prefer named exports for tree-shaking and IDE discoverability."
  .message     = "Default export detected. Prefer named exports for better tree-shaking and IDE auto-import."
  .appliesTo   = "packages/core/src/**"`,

  // ── no-side-effects ──
  `@constraint no-side-effects
  .language    = "typescript"
  .nodeType    = "expression_statement"
  .field.expression.exists     = true
  .severity    = WARN
  .scope       = PROJECT
  .evidence    = "Architecture rule: top-level side effects in utility modules break tree-shaking and testing."
  .message     = "Top-level side effect detected in module scope. Wrap in a function or move to an initialization entry point."
  .appliesTo   = "**/!(index).ts"`,

  // ── enforce-null-checks ──
  `@constraint enforce-null-checks
  .language    = "typescript"
  .nodeType    = "member_expression"
  .field.object.exists     = true
  .severity    = WARN
  .scope       = PROJECT
  .evidence    = "Architecture rule: accessing properties on potentially-null values without null check."
  .message     = "Potential null dereference. Add null check or use optional chaining (?.) operator."
  .appliesTo   = "**/*.ts"`,
];

export const ARCHITECTURE_TEMPLATE_META = {
  category: "architecture" as const,
  description: "Module-level structure invariants. Cross-cutting concerns enforced at AST level.",
  count: ARCHITECTURE_TEMPLATES.length,
  coverage: ["layering", "size-limits", "imports", "exports", "globals", "null-safety"],
};
