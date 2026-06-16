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
 * @file Rego Compiler — DSL-to-Rego 编译器
 *
 * 将 ParsedConstraint（从 DSL 编译而来）转换为 OPA 兼容的 Rego 策略。
 * 支持从约束模板和纯 JSON DSL 进行编译。
 */

import { compileSingleConstraint, type ParsedConstraint } from "../constraints/dsl-compiler.js";

// ── Types ──

export interface RegoPolicy {
  id: string;
  package: string;
  rule: string;
  rawRego: string;
  category: string;
  severity: "low" | "medium" | "high" | "critical";
}

export interface CompileOptions {
  category?: string;
  namespace?: string;
}

// ── Rego Compiler ──

export class RegoCompiler {
  private policies: RegoPolicy[] = [];

  private generateId(): string {
    return crypto.randomUUID();
  }

  /**
   * Convert a ParsedConstraint to a Rego policy.
   */
  compile(template: ParsedConstraint, options?: CompileOptions): RegoPolicy {
    const namespace = options?.namespace ?? "mcp.cognition";
    const category = options?.category ?? "security";
    const pkg = `${namespace}.${category}`;
    const safeName = template.name.replace(/[^a-zA-Z0-9_]/g, "_");
    const ruleName = `deny_${safeName}`;
    const denyKey = `${category}/${template.name}`;

    const bodyLines = this.buildRuleBody(template);
    const severity = this.mapSeverity(template.severity);

    const rego = `package ${pkg}

import rego.v1

# ${template.message}
${ruleName} contains msg if {
  some input in input.astNodes
${bodyLines}  msg := {
    "key": "${denyKey}",
    "severity": "${severity}",
    "message": "${template.message}",
    "constraint": "${template.name}"
  }
}
`;

    const policy: RegoPolicy = {
      id: this.generateId(),
      package: pkg,
      rule: ruleName,
      rawRego: rego,
      category,
      severity,
    };

    this.policies.push(policy);
    return policy;
  }

  /**
   * Convert JSON DSL string to Rego (backward compat).
   */
  fromDSL(dslJson: string, options?: CompileOptions): RegoPolicy {
    const parsed = compileSingleConstraint(dslJson);
    if (!parsed) {
      throw new Error(`Failed to parse DSL: ${dslJson.slice(0, 100)}`);
    }
    return this.compile(parsed, options);
  }

  /**
   * Validate a Rego policy string.
   * Checks for basic structural correctness.
   */
  validate(rego: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!rego || rego.trim().length === 0) {
      return { valid: false, errors: ["Rego policy is empty"] };
    }

    if (!/^package\s+\S+/m.test(rego)) {
      errors.push("Missing 'package' declaration");
    }

    if (!/contains\s+msg\s+if\s*\{/.test(rego)) {
      errors.push("Missing rule body: expected 'contains msg if { ... }' pattern");
    }

    if (!/"key"\s*:/.test(rego)) {
      errors.push("Missing required 'key' field in deny message");
    }

    if (!/"severity"\s*:/.test(rego)) {
      errors.push("Missing required 'severity' field in deny message");
    }

    if (!/"message"\s*:/.test(rego)) {
      errors.push("Missing required 'message' field in deny message");
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Return all compiled policies.
   */
  listPolicies(): RegoPolicy[] {
    return [...this.policies];
  }

  /**
   * Build Rego rule body lines from ParsedConstraint.
   * Maps AstTemplate.templateDsl nodeType → Rego input.nodeType check,
   * plus individual field constraints.
   */
  private buildRuleBody(template: ParsedConstraint): string {
    const lines: string[] = [];

    // Add language filter if present
    if (template.language) {
      lines.push(`  input.language == "${template.language}"`);
    }

    for (const ast of template.constraints) {
      lines.push(`  input.nodeType == "${ast.nodeType}"`);

      for (const [fieldPath, fc] of Object.entries(ast.fields)) {
        if (fc.match !== undefined) {
          if (fc.match.startsWith("/") && fc.match.endsWith("/i")) {
            const pattern = fc.match.slice(1, -2);
            lines.push(`  re_match(\`${pattern}\`, input.fields["${fieldPath}"])`);
          } else if (fc.match.startsWith("/")) {
            const pattern = fc.match.slice(1, -1);
            lines.push(`  re_match(\`${pattern}\`, input.fields["${fieldPath}"])`);
          } else {
            lines.push(`  input.fields["${fieldPath}"] == "${fc.match}"`);
          }
        }
        if (fc.exists !== undefined) {
          if (fc.exists) {
            lines.push(`  input.fields["${fieldPath}"] != null`);
          } else {
            lines.push(`  not input.fields["${fieldPath}"]`);
          }
        }
        if (fc.childType !== undefined) {
          lines.push(`  input.fields["${fieldPath}"].nodeType == "${fc.childType}"`);
        }
        if (fc.childCount !== undefined) {
          const condParts: string[] = [];
          if (fc.childCount.min !== undefined) {
            condParts.push(`count(input.fields["${fieldPath}"]) >= ${fc.childCount.min}`);
          }
          if (fc.childCount.max !== undefined) {
            condParts.push(`count(input.fields["${fieldPath}"]) <= ${fc.childCount.max}`);
          }
          if (condParts.length > 0) {
            lines.push(`  ${condParts.join("; ")}`);
          }
        }
      }
    }

    // Add file path filter if present
    if (template.appliesTo) {
      lines.push(`  glob.match("${template.appliesTo}", ["/"], input.filePath)`);
    }

    return lines.join("\n") + "\n";
  }

  /**
   * Map DSL severity to Rego severity.
   */
  private mapSeverity(severity: "REJECT" | "WARN"): "low" | "medium" | "high" | "critical" {
    return severity === "REJECT" ? "critical" : "medium";
  }
}
