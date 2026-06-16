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
 * @file Style Templates — 代码风格约束模板库
 *
 * 风格层面的不变量。确保代码风格一致性。
 */

export const STYLE_TEMPLATES: string[] = [

  // ── ban-console-log ──
  `@constraint ban-console-log
  .language    = "typescript"
  .nodeType    = "call_expression"
  .field.function.match      = "console.log"
  .severity    = WARN
  .scope       = PROJECT
  .evidence    = "Style rule: console.log should not ship to production. Use a structured logger (e.g., pino)."
  .message     = "console.log detected. Use the configured logger or remove before merging."
  .dependsOn   = []`,

  // ── enforce-early-return ──
  `@constraint enforce-early-return
  .language    = "typescript"
  .nodeType    = "if_statement"
  .field.consequence.exists     = true
  .severity    = WARN
  .scope       = PROJECT
  .evidence    = "Style rule: nested if-else chains are hard to read. Use early returns (guard clauses) instead."
  .message     = "Nested if-else detected. Consider early return pattern for improved readability."`,

  // ── ban-magic-numbers ──
  `@constraint ban-magic-numbers
  .language    = "typescript"
  .nodeType    = "number"
  .severity    = WARN
  .scope       = PROJECT
  .evidence    = "Style rule: unnamed numeric literals ('magic numbers') reduce readability. Extract as named constants."
  .message     = "Magic number detected. Extract to a named constant with a descriptive name."
  .appliesTo   = "**/*.ts"`,

  // ── require-jsdoc ──
  `@constraint require-jsdoc
  .language    = "typescript"
  .nodeType    = "function_declaration"
  .field.comment.exists     = true
  .severity    = WARN
  .scope       = PROJECT
  .evidence    = "Style rule: exported functions should have JSDoc comments for IDE intellisense."
  .message     = "Exported function missing JSDoc comment. Add @param and @returns documentation."
  .appliesTo   = "packages/core/src/**"`,

  // ── ban-todo ──
  `@constraint ban-todo
  .language    = "typescript"
  .nodeType    = "comment"
  .field.text.match      = "/TODO|FIXME|HACK/i"
  .severity    = WARN
  .scope       = PROJECT
  .evidence    = "Style rule: TODO/FIXME comments in production code should have an associated issue ticket."
  .message     = "TODO/FIXME/HACK comment detected. Link to an issue tracker ticket or remove before merging."
  .appliesTo   = "**/*.ts"`,

  // ── max-params ──
  `@constraint max-params
  .language    = "typescript"
  .nodeType    = "function_declaration"
  .field.parameters.childCount = { min: 0, max: 4 }
  .severity    = WARN
  .scope       = PROJECT
  .evidence    = "Style rule: functions with >4 parameters are hard to call correctly. Use an options object."
  .message     = "Function has too many parameters (max 4). Extract into an options/params object."
  .appliesTo   = "**/*.ts"`,

  // ── no-empty-catch ──
  `@constraint no-empty-catch
  .language    = "typescript"
  .nodeType    = "catch_clause"
  .field.body.childCount = { min: 1 }
  .severity    = REJECT
  .scope       = PROJECT
  .evidence    = "Style rule: empty catch blocks silently swallow errors. At minimum, log the error."
  .message     = "Empty catch block detected. Log the error or add a comment explaining why it is intentionally ignored."`,

  // ── prefer-template-literals ──
  `@constraint prefer-template-literals
  .language    = "typescript"
  .nodeType    = "binary_expression"
  .field.operator.match      = "+"
  .severity    = WARN
  .scope       = PROJECT
  .evidence    = "Style rule: string concatenation with + is less readable than template literals."
  .message     = "String concatenation detected. Use template literals (\`\`) for string interpolation."
  .appliesTo   = "**/*.ts"`,
];

export const STYLE_TEMPLATE_META = {
  category: "style" as const,
  description: "Code style and readability invariants. Consistent patterns enforced at AST level.",
  count: STYLE_TEMPLATES.length,
  coverage: ["logging", "control-flow", "magic-numbers", "documentation", "parameters", "error-handling", "strings"],
};
