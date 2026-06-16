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
 * @file Structured Generator — LLM 结构化输出封装器
 *
 * 使用 Zod v4 schema 确保 LLM 输出的数据形状 100% 有效。
 * 这是占位实现 — 实际的 LLM 调用由 MCP 传输层完成。
 * Schema 确保在生成时验证数据形状。
 */

import { z } from "zod";

// ── Zod Schemas ──

export const RegoPolicySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(3).max(100),
  description: z.string().min(10).max(500),
  category: z.enum(["security", "architecture", "type", "style"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  rego: z.string().min(1),
  humanExplanation: z.string().min(10).max(300),
});

export type RegoPolicyGenerated = z.infer<typeof RegoPolicySchema>;

export const ProposalInputSchema = z.object({
  requirement: z.string().min(5).max(1000),
  language: z.string().default("typescript"),
  category: z.string().optional(),
});

// ── Options ──

export interface GenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  fewShotExamples?: RegoPolicyGenerated[];
}

// ── Structured Generator ──

export class StructuredGenerator {
  /**
   * Validate raw LLM output against the RegoPolicySchema.
   * Returns success with typed data or failure with error message.
   */
  validateOutput(raw: unknown):
    | { success: true; data: RegoPolicyGenerated }
    | { success: false; error: string } {
    const result = RegoPolicySchema.safeParse(raw);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, error: result.error.message };
  }

  /**
   * Compile the prompt without calling the LLM.
   * Returns system prompt, user prompt, and the zod schema for the transport layer.
   */
  buildPrompt(
    input: z.infer<typeof ProposalInputSchema>,
    options?: GenerateOptions,
  ): {
    systemPrompt: string;
    userPrompt: string;
    schema: typeof RegoPolicySchema;
  } {
    const category = input.category ?? "security";
    const language = input.language;

    const systemPrompt = [
      "You are a Rego policy generator for OPA (Open Policy Agent).",
      `Your task is to generate a ${category} policy for ${language} code analysis.`,
      "",
      "Output Requirements:",
      "- Generate a valid, standalone Rego policy in the 'rego' field.",
      "- Use `deny[msg]` pattern with 'key', 'severity', and 'message' fields.",
      "- The policy must check AST node types and field values.",
      "- Severity must be one of: low, medium, high, critical.",
      "- Provide a human-readable explanation of what the policy does.",
      "",
      "Rego Policy Structure:",
      "package mcp.cognition.<category>",
      "",
      "import rego.v1",
      "",
      "deny[msg] {",
      "  some input in input.astNodes",
      "  input.nodeType == \"...\"",
      "  # additional conditions",
      "  msg := {",
      '    "key": "<category>/<rule-name>",',
      '    "severity": "<level>",',
      '    "message": "<explanation>"',
      "  }",
      "}",
    ].join("\n");

    let fewShotText = "";
    if (options?.fewShotExamples && options.fewShotExamples.length > 0) {
      const examples = options.fewShotExamples
        .map((ex, i) => {
          return [
            `Example ${i + 1}:`,
            `Requirement: ${ex.description}`,
            `Policy Name: ${ex.name}`,
            `Rego:`,
            ex.rego,
            `Explanation: ${ex.humanExplanation}`,
          ].join("\n");
        })
        .join("\n\n---\n\n");
      fewShotText = `\n\nFew-Shot Examples:\n\n${examples}`;
    }

    const userPrompt = [
      `Generate a ${category} Rego policy for the following requirement:`,
      `"${input.requirement}"`,
      "",
      `Language: ${language}`,
      options?.temperature !== undefined
        ? `Temperature: ${options.temperature}`
        : "",
      fewShotText,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      systemPrompt,
      userPrompt,
      schema: RegoPolicySchema,
    };
  }
}
