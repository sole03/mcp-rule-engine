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
 * @file Security Templates — 安全约束模板库
 *
 * 覆盖 OWASP Top 10 / CWE 常见安全模式。
 * 每个模板是一个声明式 DSL 字符串，可通过 compileConstraints() 编译。
 */

export const SECURITY_TEMPLATES: string[] = [

  // ── ban-eval: 禁止 eval() ──
  `@constraint ban-eval
  .language    = "typescript"
  .nodeType    = "call_expression"
  .field.function.match      = "eval"
  .severity    = REJECT
  .scope       = GLOBAL
  .evidence    = "CWE-95: Improper Neutralization of Directives in Dynamically Evaluated Code (Eval Injection)"
  .message     = "eval() is forbidden. Use structured parsing (e.g., JSON.parse) or a safe expression evaluator instead."
  .conflicts   = []

@constraint ban-eval-js
  .language    = "javascript"
  .nodeType    = "call_expression"
  .field.function.match      = "eval"
  .severity    = REJECT
  .scope       = GLOBAL
  .evidence    = "CWE-95: Eval Injection"
  .message     = "eval() is forbidden. Use structured parsing or a safe expression evaluator instead."
  .dependsOn   = ["ban-eval"]`,

  // ── ban-innerHTML: 禁止 innerHTML ──
  `@constraint ban-innerHTML
  .language    = "typescript"
  .nodeType    = "member_expression"
  .field.property.match      = "innerHTML"
  .severity    = REJECT
  .scope       = GLOBAL
  .evidence    = "CWE-79: Improper Neutralization of Input During Web Page Generation (Cross-site Scripting)"
  .message     = "Setting innerHTML is an XSS risk. Use textContent or createElement with safe APIs instead."`,

  // ── ban-document-write ──
  `@constraint ban-document-write
  .language    = "typescript"
  .nodeType    = "call_expression"
  .field.function.match      = "document.write"
  .severity    = REJECT
  .scope       = GLOBAL
  .evidence    = "CWE-79: DOM-based XSS via document.write"
  .message     = "document.write() is an XSS vector and breaks CSP. Use DOM API or framework rendering instead."`,

  // ── ban-sql-concat: 禁止 SQL 字符串拼接 ──
  `@constraint ban-sql-concat
  .language    = "typescript"
  .nodeType    = "binary_expression"
  .field.operator.match      = "+"
  .severity    = REJECT
  .scope       = GLOBAL
  .evidence    = "CWE-89: Improper Neutralization of Special Elements used in an SQL Command (SQL Injection)"
  .message     = "String concatenation in SQL query builders is a SQL injection risk. Use parameterized queries."
  .appliesTo   = "**/*.ts"`,

  // ── ban-hardcoded-secret ──
  `@constraint ban-hardcoded-secret
  .language    = "typescript"
  .nodeType    = "variable_declarator"
  .field.name.match      = "/(apiKey|secret|password|token|api_key|private_key|client_secret)/i"
  .severity    = REJECT
  .scope       = GLOBAL
  .evidence    = "CWE-798: Use of Hard-coded Credentials"
  .message     = "Hardcoded credentials detected. Use environment variables or a secrets manager."
  .dependsOn   = []`,

  // ── ban-path-traversal ──
  `@constraint ban-path-traversal
  .language    = "typescript"
  .nodeType    = "call_expression"
  .field.function.match      = "path.join"
  .severity    = WARN
  .scope       = GLOBAL
  .evidence    = "CWE-22: Improper Limitation of a Pathname to a Restricted Directory (Path Traversal)"
  .message     = "path.join with user input may allow path traversal. Sanitize or use path.resolve with a fixed base directory."
  .conflicts   = []`,

  // ── ban-unsafe-regex ──
  `@constraint ban-unsafe-regex
  .language    = "typescript"
  .nodeType    = "new_expression"
  .field.callee.match      = "RegExp"
  .severity    = WARN
  .scope       = GLOBAL
  .evidence    = "CWE-1333: Inefficient Regular Expression Complexity (ReDoS)"
  .message     = "User-controlled RegExp patterns may cause ReDoS. Validate and sanitize user-provided regex patterns."`,

  // ── ban-require-user-input ──
  `@constraint ban-require-user-input
  .language    = "typescript"
  .nodeType    = "call_expression"
  .field.function.match      = "require"
  .severity    = REJECT
  .scope       = GLOBAL
  .evidence    = "CWE-706: Use of Incorrectly-Resolved Name or Reference"
  .message     = "require() with dynamic user input can load arbitrary modules. Use a static allowlist."
  .appliesTo   = "**/*.ts"`,

  // ── ban-weak-crypto ──
  `@constraint ban-weak-crypto
  .language    = "typescript"
  .nodeType    = "call_expression"
  .field.function.match      = "/(createHash.*md5|createHash.*sha1|createCipheriv.*des)/i"
  .severity    = REJECT
  .scope       = GLOBAL
  .evidence    = "CWE-327: Use of a Broken or Risky Cryptographic Algorithm"
  .message     = "Weak cryptographic algorithm detected (MD5, SHA1, DES). Use SHA-256 or AES-GCM instead."
  .dependsOn   = []`,

  // ── require-https ──
  `@constraint require-https
  .language    = "typescript"
  .nodeType    = "string"
  .field.text.match      = "http://"
  .severity    = WARN
  .scope       = GLOBAL
  .evidence    = "CWE-319: Cleartext Transmission of Sensitive Information"
  .message     = "HTTP URL detected. Use HTTPS for all external communications."
  .appliesTo   = "**/*{.ts,.js}"`,
];

/**
 * 安全模板元数据（用于仪表盘分类）。
 */
export const SECURITY_TEMPLATE_META = {
  category: "security" as const,
  description: "CWE-based patterns. No code containing these AST patterns should be committed.",
  count: SECURITY_TEMPLATES.length,
  coverage: ["CWE-95", "CWE-79", "CWE-89", "CWE-798", "CWE-22", "CWE-1333", "CWE-706", "CWE-327", "CWE-319"],
};
