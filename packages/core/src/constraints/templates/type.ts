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
 * @file Type Templates — 类型安全约束模板库
 *
 * 类型层面的不变量。确保正确使用 TypeScript 类型系统。
 */

export const TYPE_TEMPLATES: string[] = [

  // ── ban-any ──
  `@constraint ban-any
  .language    = "typescript"
  .nodeType    = "type_annotation"
  .field.type.match      = "any"
  .severity    = WARN
  .scope       = PROJECT
  .evidence    = "TypeScript best practice: 'any' disables type checking. Use 'unknown' or a specific type."
  .message     = "Use of 'any' type detected. Use 'unknown' for truly dynamic values, or define a proper type/interface."
  .appliesTo   = "**/*.ts"`,

  // ── ban-type-assertion ──
  `@constraint ban-type-assertion
  .language    = "typescript"
  .nodeType    = "type_assertion"
  .field.type.exists     = true
  .severity    = WARN
  .scope       = PROJECT
  .evidence    = "TypeScript best practice: type assertions ('as Foo') bypass type checking. Use type guards."
  .message     = "Type assertion (as) detected. Prefer type guards or runtime validation (zod) for type narrowing."
  .appliesTo   = "**/*.ts"`,

  // ── ban-non-null-assertion ──
  `@constraint ban-non-null-assertion
  .language    = "typescript"
  .nodeType    = "non_null_expression"
  .field.expression.exists     = true
  .severity    = REJECT
  .scope       = PROJECT
  .evidence    = "TypeScript best practice: non-null assertions (!) can cause runtime errors. Use optional chaining or null checks."
  .message     = "Non-null assertion (!. operator) detected. Replace with optional chaining (?.) or explicit null check."
  .dependsOn   = []`,

  // ── ban-ts-ignore ──
  `@constraint ban-ts-ignore
  .language    = "typescript"
  .nodeType    = "comment"
  .field.text.match      = "@ts-ignore"
  .severity    = REJECT
  .scope       = PROJECT
  .evidence    = "TypeScript best practice: @ts-ignore suppresses all errors on next line. Use @ts-expect-error with explanation."
  .message     = "@ts-ignore detected. Use @ts-expect-error with a comment explaining why the type error is expected."
  .conflicts   = []`,

  // ── return-type-required ──
  `@constraint return-type-required
  .language    = "typescript"
  .nodeType    = "function_declaration"
  .field.returnType.exists     = true
  .severity    = WARN
  .scope       = PROJECT
  .evidence    = "TypeScript best practice: explicit return types improve readability and catch unintended type widening."
  .message     = "Function missing explicit return type. Add a return type annotation for clarity and safety."
  .appliesTo   = "**/*.ts"`,

  // ── ban-mutable-arrays ──
  `@constraint ban-mutable-arrays
  .language    = "typescript"
  .nodeType    = "call_expression"
  .field.function.match      = "/(\.push|\.pop|\.splice|\.sort|\.reverse|\.shift|\.unshift)$/"
  .severity    = WARN
  .scope       = PROJECT
  .evidence    = "TypeScript best practice: mutating arrays can cause unexpected side effects. Use immutable patterns."
  .message     = "Array mutation method detected. Consider using spread or slice for immutability."
  .appliesTo   = "**/*.ts"`,

  // ── ban-enum ──
  `@constraint ban-enum
  .language    = "typescript"
  .nodeType    = "enum_declaration"
  .field.name.exists     = true
  .severity    = WARN
  .scope       = PROJECT
  .evidence    = "TypeScript best practice: enums add runtime overhead. Use const objects with 'as const' for string unions."
  .message     = "TypeScript enum detected. Consider using string union types or const objects with 'as const' for better tree-shaking."`,
];

export const TYPE_TEMPLATE_META = {
  category: "type" as const,
  description: "TypeScript type-system invariants. No 'any', no assertions, no @ts-ignore.",
  count: TYPE_TEMPLATES.length,
  coverage: ["any", "assertions", "non-null", "ts-ignore", "return-types", "immutability", "enum"],
};
