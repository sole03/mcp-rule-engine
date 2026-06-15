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

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { getPrismaClient, disconnectPrisma } from "./storage/client.js";
import { RuleRepo } from "./storage/rule-repo.js";
import { DiffLogRepo } from "./storage/diff-log-repo.js";
import { ConflictRepo } from "./storage/conflict-repo.js";
import { MetricRepo } from "./storage/metric-repo.js";
import { handleCaptureDiff } from "./tools/capture-diff.js";
import { handleQueryRules } from "./tools/query-rules.js";
import { handleConfirmRule } from "./tools/confirm-rule.js";
import { handleResolveConflict } from "./tools/resolve-conflict.js";
import { handleListRules } from "./tools/list-rules.js";
import { handleAnalyzeWorkspace } from "./tools/analyze-workspace.js";
import { handleCognitionQuery, handleCognitionValidate, handleCognitionFeedback } from "./tools/cognition-tools.js";
import { handleApproveInjection } from "./tools/injection-approval.js";
import { handleUpdateConfig } from "./tools/config-tools.js";
import { RESOURCES, readCognitionSchema, readCognitionStats, readCognitionDocs } from "./resources/cognition-resources.js";

const server = new Server({ name: "agent-tuning-reverse-graph", version: "0.1.0" }, { capabilities: { tools: {} } });
const ruleRepo = new RuleRepo();
const diffLogRepo = new DiffLogRepo();
const metricRepo = new MetricRepo();
const conflictRepo = new ConflictRepo(ruleRepo);

async function getMode(): Promise<"silent" | "confirm"> {
  const prisma = getPrismaClient();
  const config = await prisma.appConfig.findUnique({ where: { id: "default" } });
  return (config?.mode as "silent" | "confirm") ?? "silent";
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "analyze_workspace", description: "批量分析工作区变更并生成规则候选", inputSchema: { type: "object", properties: { baseCommit: { type: "string" }, headCommit: { type: "string" }, paths: { type: "array", items: { type: "string" } }, taskId: { type: "string" } }, required: ["baseCommit"] } },
    { name: "capture_diff", description: "分析代码差异并生成规则候选", inputSchema: { type: "object", properties: { filePath: { type: "string" }, originalContent: { type: "string" }, modifiedContent: { type: "string" }, language: { type: "string" }, projectId: { type: "string" } }, required: ["filePath", "originalContent", "modifiedContent", "language"] } },
    { name: "query_rules", description: "查询与当前上下文最相关的规则", inputSchema: { type: "object", properties: { language: { type: "string" }, filePath: { type: "string" }, projectId: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["language", "filePath"] } },
    { name: "confirm_rule", description: "确认/拒绝/编辑/跳过规则候选", inputSchema: { type: "object", properties: { ruleId: { type: "string" }, action: { type: "string", enum: ["accept", "reject", "edit", "skip"] }, editedPattern: { type: "string" }, editedSuggestion: { type: "string" } }, required: ["ruleId", "action"] } },
    { name: "resolve_conflict", description: "解决规则冲突", inputSchema: { type: "object", properties: { conflictId: { type: "string" }, resolution: { type: "string", enum: ["keep_a", "keep_b", "merge", "skip"] }, batchAllSession: { type: "boolean" } }, required: ["conflictId", "resolution"] } },
    { name: "list_rules", description: "列出规则", inputSchema: { type: "object", properties: { language: { type: "string" }, scope: { type: "string", enum: ["project", "user", "global"] }, status: { type: "string", enum: ["active", "pending", "archived"] }, projectId: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case "analyze_workspace": return await handleAnalyzeWorkspace(args as any, ruleRepo, diffLogRepo, metricRepo);
      case "capture_diff": return await handleCaptureDiff(args as any, ruleRepo, diffLogRepo, metricRepo, await getMode());
      case "query_rules": return await handleQueryRules(args as any, ruleRepo, metricRepo);
      case "confirm_rule": return await handleConfirmRule(args as any, ruleRepo, metricRepo);
      case "resolve_conflict": return await handleResolveConflict(args as any, conflictRepo, ruleRepo, metricRepo);
      case "list_rules": return await handleListRules(args as any, ruleRepo);
            case "cognition_query": return await handleCognitionQuery(args as any);
      case "cognition_validate": return await handleCognitionValidate(args as any);
      case "cognition_feedback": return await handleCognitionFeedback(args as any);
      case "cognition_approve_injection": return await handleApproveInjection(args as any);
      case "cognition_update_config": return await handleUpdateConfig(args as any);
      default: throw new McpError(ErrorCode.MethodNotFound, "Unknown tool: " + name);
    }
  } catch (err) {
    if (err instanceof McpError) throw err;
    return { content: [{ type: "text", text: JSON.stringify({ error: String(err) }) }], isError: true };
  }
});

async function main() {
  const prisma = getPrismaClient();
  // Initialize the SQLite database and push schema
  await prisma.$connect();
  await prisma.appConfig.upsert({ where: { id: "default" }, update: {}, create: { id: "default", mode: "silent" } });
  const transport = new StdioServerTransport();
  server.onerror = (err) => console.error("[MCP Error]", err);
  process.on("SIGINT", async () => { await disconnectPrisma(); process.exit(0); });
  process.on("SIGTERM", async () => { await disconnectPrisma(); process.exit(0); });
  await server.connect(transport);
  console.error("Agent Tuning Reverse Graph MCP Server running on stdio");
}

main().catch((err) => { console.error("Fatal error:", err); process.exit(1); });
