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
 * @file MCP Adapter — 薄适配器，仅做协议翻译
 *
 * 将 MCP 协议调用翻译为 CognitionCore.execute() 调用。
 * 不包含任何业务逻辑 — 策略评估、工具路由全部委托给内核。
 *
 * 对比旧版 src/transport/index.ts (235行，包含策略+Schema+模式+预热)：
 * 此适配器将减少到 ~80 行纯协议适配代码。
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

import { CognitionCore, createContainer } from "../../packages/core/src/index.js";
import type { ExecuteResult } from "../../packages/core/src/index.js";

// ── 工具定义（纯声明，无业务逻辑）──

const TOOL_DEFINITIONS = [
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
];

// ── 资源定义 ──

const RESOURCE_DEFINITIONS = [
  { uri: "cognition://schema", name: "Cognition Graph Schema", description: "JSON Schema of the cognition graph data model", mimeType: "application/json" },
  { uri: "cognition://stats", name: "Cognition Engine Statistics", description: "Graph statistics (node/edge counts)", mimeType: "application/json" },
  { uri: "cognition://docs/overview", name: "Cognition Engine Documentation", description: "Full MCP tool documentation", mimeType: "text/markdown" },
  { uri: "cognition://rules-changelog", name: "Rules Changelog", description: "Versioned rule change log", mimeType: "application/json" },
];

// ── MCP Server ──

async function main() {
  const server = new Server(
    { name: "mcp-cognition-engine", version: "1.0.0-alpha.3" },
    { capabilities: { tools: {}, resources: {} } },
  );

  // 创建内核（通过 DI 容器注入所有子系统）
  const core = new CognitionCore(createContainer());
  await core.start();

  // ── Tools ──

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const result: ExecuteResult = await core.execute({
      tool: name,
      input: (args ?? {}) as Record<string, unknown>,
    });
    return {
      content: result.content,
      isError: result.isError,
    } as any;
  });

  // ── Resources ──

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: RESOURCE_DEFINITIONS,
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const { uri } = req.params;
    // 委托给旧 resource handler（保持向后兼容）
    try {
      const { handleReadResource, RESOURCES } = await import("../cognition-resources.js");
      return await handleReadResource(uri);
    } catch {
      throw new McpError(ErrorCode.InvalidParams, `Unknown resource: ${uri}`);
    }
  });

  // ── Transport ──

  const transport = new StdioServerTransport();
  server.onerror = (err) => console.error("[mcp-adapter] server error:", err);

  process.on("SIGINT", async () => { await core.shutdown(); process.exit(0); });
  process.on("SIGTERM", async () => { await core.shutdown(); process.exit(0); });

  await server.connect(transport);
  console.error("[mcp-adapter] MCP Cognition Engine running on stdio");
}

main().catch((err) => {
  console.error("[mcp-adapter] fatal startup error:", err);
  process.exit(1);
});
