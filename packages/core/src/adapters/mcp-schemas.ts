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
 * @file MCP Tool & Resource Definitions — 纯数据声明
 *
 * 从 mcp-adapter.ts 分离，使适配器主体保持精简。
 * 本文件不含任何业务逻辑。
 */

export const TOOL_DEFINITIONS = [
  {
    name: "analyze_workspace",
    description: "Analyze the entire workspace and generate rules",
    inputSchema: { type: "object", properties: { baseCommit: { type: "string" }, headCommit: { type: "string" }, paths: { type: "array", items: { type: "string" } }, taskId: { type: "string" }, concurrency: { type: "number" }, fileContents: { type: "array" } }, required: ["baseCommit"] },
  },
  {
    name: "capture_diff",
    description: "Capture a code diff and store it for rule generation",
    inputSchema: { type: "object", properties: { filePath: { type: "string" }, originalContent: { type: "string" }, modifiedContent: { type: "string" }, language: { type: "string" }, projectId: { type: "string" } }, required: ["filePath", "originalContent", "modifiedContent", "language"] },
  },
  {
    name: "query_rules",
    description: "Query rules by language and file path",
    inputSchema: { type: "object", properties: { language: { type: "string" }, filePath: { type: "string" }, projectId: { type: "string" }, tags: { type: "array", items: { type: "string" } }, taskId: { type: "string" } }, required: ["language", "filePath"] },
  },
  {
    name: "confirm_rule",
    description: "Confirm, reject, or edit a generated rule",
    inputSchema: { type: "object", properties: { ruleId: { type: "string" }, action: { type: "string", enum: ["accept", "reject", "edit", "skip"] }, editedPattern: { type: "string" }, editedSuggestion: { type: "string" } }, required: ["ruleId", "action"] },
  },
  {
    name: "resolve_conflict",
    description: "Resolve a conflict between two rules",
    inputSchema: { type: "object", properties: { conflictId: { type: "string" }, resolution: { type: "string", enum: ["keep_a", "keep_b", "merge", "skip"] }, batchAllSession: { type: "boolean" } }, required: ["conflictId", "resolution"] },
  },
  {
    name: "list_rules",
    description: "List all rules with optional filters",
    inputSchema: { type: "object", properties: { language: { type: "string" }, scope: { type: "string" }, status: { type: "string" }, projectId: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } },
  },
  {
    name: "cognition_query",
    description: "Query the cognition graph by context hash",
    inputSchema: { type: "object", properties: { contextHash: { type: "string" }, intentHint: { type: "string", enum: ["REFACTOR", "BUGFIX", "BOILERPLATE"] }, maxDepth: { type: "number" } }, required: ["contextHash"] },
  },
  {
    name: "cognition_validate",
    description: "Validate code against AST templates",
    inputSchema: { type: "object", properties: { nodeId: { type: "string" }, targetFileContent: { type: "string" } }, required: ["nodeId", "targetFileContent"] },
  },
  {
    name: "cognition_feedback",
    description: "Provide feedback to update edge weights",
    inputSchema: { type: "object", properties: { nodeId: { type: "string" }, edgeId: { type: "string" }, outcome: { type: "string", enum: ["ACCEPTED", "REJECTED", "MODIFIED"] }, comment: { type: "string" } }, required: ["nodeId", "outcome"] },
  },
  {
    name: "cognition_approve_injection",
    description: "Approve or reject an injection proposal",
    inputSchema: { type: "object", properties: { proposalId: { type: "string" }, decision: { type: "string", enum: ["APPROVE", "REJECT", "OVERRIDE"] } }, required: ["proposalId", "decision"] },
  },
  {
    name: "cognition_update_config",
    description: "Hot-update configuration thresholds (expert mode)",
    inputSchema: { type: "object", properties: { key: { type: "string" }, value: {} }, required: ["key", "value"] },
  },
  {
    name: "governance_pause_arbitrator",
    description: "Pause automatic arbitration for N minutes — human veto protocol",
    inputSchema: { type: "object", properties: { minutes: { type: "number" } }, required: ["minutes"] },
  },
  {
    name: "governance_rollback_arbitration",
    description: "Rollback auto-resolved conflicts within a time window — human override",
    inputSchema: { type: "object", properties: { since: { type: "string", description: "ISO 8601 datetime — conflicts resolved after this timestamp will be rolled back" } }, required: ["since"] },
  },
  {
    name: "preview_rule",
    description: "Preview the effect of a rule's pattern on a file (semantic diff preview)",
    inputSchema: { type: "object", properties: { ruleId: { type: "string" }, filePath: { type: "string" } }, required: ["ruleId", "filePath"] },
  },
  {
    name: "developer_satisfaction",
    description: "Record developer satisfaction score (1-5) with optional feedback — feeds the anti-overengineering loop",
    inputSchema: { type: "object", properties: { score: { type: "number", minimum: 1, maximum: 5 }, feedback: { type: "string" } }, required: ["score"] },
  },
];

export const RESOURCE_DEFINITIONS = [
  { uri: "cognition://schema", name: "Cognition Graph Schema", description: "JSON Schema of the cognition graph data model", mimeType: "application/json" },
  { uri: "cognition://stats", name: "Cognition Engine Statistics", description: "Graph statistics (node/edge counts)", mimeType: "application/json" },
  { uri: "cognition://docs/overview", name: "Cognition Engine Documentation", description: "Full MCP tool documentation", mimeType: "text/markdown" },
  { uri: "cognition://rules-changelog", name: "Rules Changelog", description: "Versioned rule change log", mimeType: "application/json" },
];
