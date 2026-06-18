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
 * @file Zod input validation schemas for all MCP tools.
 * Schema-first approach: validate inputs at handler entry, fail fast with isError=true.
 */

import { z } from "zod";

// ── Legacy Rule Engine Tools ───────────────────────────────

export const AnalyzeWorkspaceSchema = z.object({
  baseCommit: z.string().min(1, "baseCommit is required"),
  headCommit: z.string().optional(),
  paths: z.array(z.string()).optional(),
  taskId: z.string().optional(),
  concurrency: z.number().int().positive().optional(),
  fileContents: z.array(z.object({
    path: z.string().min(1),
    originalContent: z.string().optional(),
    modifiedContent: z.string(),
  })).optional(),
});

export const CaptureDiffSchema = z.object({
  filePath: z.string().min(1, "filePath is required"),
  originalContent: z.string().optional().default(""),
  modifiedContent: z.string().min(1, "modifiedContent is required"),
  language: z.string().min(1, "language is required"),
  projectId: z.string().optional(),
});

export const QueryRulesSchema = z.object({
  language: z.string().min(1, "language is required"),
  filePath: z.string().min(1, "filePath is required"),
  projectId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  taskId: z.string().optional(),
});

export const ConfirmRuleSchema = z.object({
  ruleId: z.string().min(1, "ruleId is required"),
  action: z.enum(["accept", "reject", "edit", "skip"]),
  editedPattern: z.string().optional(),
  editedSuggestion: z.string().optional(),
});

export const ResolveConflictSchema = z.object({
  conflictId: z.string().min(1, "conflictId is required"),
  resolution: z.enum(["keep_a", "keep_b", "merge", "skip"]),
  batchAllSession: z.boolean().optional(),
});

export const ListRulesSchema = z.object({
  language: z.string().optional(),
  scope: z.enum(["project", "user", "global"]).optional(),
  status: z.enum(["active", "pending", "archived"]).optional(),
  projectId: z.string().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().min(0).optional(),
});

// ── Cognition Engine Tools ─────────────────────────────────

export const CognitionQuerySchema = z.object({
  contextHash: z.string().min(1, "contextHash is required"),
  intentHint: z.enum(["REFACTOR", "BUGFIX", "BOILERPLATE"]).optional(),
  maxDepth: z.number().int().positive().optional(),
});

export const CognitionValidateSchema = z.object({
  nodeId: z.string().min(1, "nodeId is required"),
  targetFileContent: z.string().min(1, "targetFileContent is required"),
});

export const CognitionFeedbackSchema = z.object({
  nodeId: z.string().min(1, "nodeId is required"),
  edgeId: z.string().optional(),
  outcome: z.enum(["ACCEPTED", "REJECTED", "MODIFIED"]),
  comment: z.string().optional(),
});

export const ApproveInjectionSchema = z.object({
  proposalId: z.string().min(1, "proposalId is required"),
  decision: z.enum(["APPROVE", "REJECT", "OVERRIDE"]),
});

export const UpdateConfigSchema = z.object({
  key: z.string().min(1, "key is required"),
  value: z.number(),
  expertMode: z.boolean().optional(),
});

export const GovernancePauseSchema = z.object({
  minutes: z.number().min(1).max(1440),
});

export const GovernanceRollbackSchema = z.object({
  since: z.string().min(1, "since (ISO datetime) is required"),
});

// ── Validation Helper ──────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate input against a zod schema. Returns validated data or structured error.
 * Use at the top of every tool handler.
 */
// NOTE: zod v4 uses .issues (not .errors) on ZodError. See https://zod.dev/v4
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  args: unknown,
  toolName: string,
): { success: true; data: T } | { success: false; error: { content: { type: string; text: string }[] } } {
  const result = schema.safeParse(args);
  if (!result.success) {
    const details = result.error.issues.map(e => ({
      field: e.path.join(".") || "(root)",
      message: e.message,
    }));
    return {
      success: false,
      error: {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: `Invalid arguments for ${toolName}`,
            code: -32602,
            details,
            retryable: false,
          }),
        }],
      },
    };
  }
  return { success: true, data: result.data };
}
