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
 * @file MCP Server Entry Point
 * Main Cognition Engine & Trust Governance MCP Server.
 *
 * Tools: analyze_workspace, capture_diff, query_rules, confirm_rule,
 *        resolve_conflict, list_rules, cognition_query, cognition_validate,
 *        cognition_feedback, cognition_approve_injection, cognition_update_config
 *
 * Resources: cognition://schema, cognition://stats, cognition://docs/overview,
 *            cognition://rules-changelog
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

process.env.DATABASE_URL = process.env.DATABASE_URL || "file:./mcp-cognition.db";

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
import type { IRuleRepository, IDiffLogRepository, IConflictRepository, IMetricRepository } from "./storage/repository-interfaces.js";
import { RESOURCES, handleReadResource } from "./resources/cognition-resources.js";
import {
  validateInput,
  AnalyzeWorkspaceSchema,
  CaptureDiffSchema,
  QueryRulesSchema,
  ConfirmRuleSchema,
  ResolveConflictSchema,
  ListRulesSchema,
  CognitionQuerySchema,
  CognitionValidateSchema,
  CognitionFeedbackSchema,
  ApproveInjectionSchema,
  UpdateConfigSchema,
} from "./schemas/index.js";
import { getPolicyEngine, DEFAULT_POLICIES } from "./policy-engine/index.js";
import type { PolicyEvalContext } from "./policy-engine/index.js";
import { logger, logToolExecution, logPolicyDecision } from "./observability/index.js";

// ── Server ────────────────────────────────────────────────

const server = new Server(
  { name: "mcp-cognition-engine", version: "1.0.0-alpha.2" },
  { capabilities: { tools: {}, resources: {} } },
);

const ruleRepo: IRuleRepository = new RuleRepo();
const diffLogRepo: IDiffLogRepository = new DiffLogRepo();
const metricRepo: IMetricRepository = new MetricRepo();
const conflictRepo: IConflictRepository = new ConflictRepo(ruleRepo);

async function getMode(): Promise<"silent" | "confirm"> {
  const prisma = getPrismaClient();
  const config = await prisma.appConfig.findUnique({ where: { id: "default" } });
  return (config?.mode as "silent" | "confirm") ?? "silent";
}

function buildPolicyContext(name: string, args: Record<string, unknown> | undefined): PolicyEvalContext {
  const a = args ?? {};
  return {
    toolName: name,
    filePath: typeof a.filePath === "string" ? a.filePath : undefined,
    language: typeof a.language === "string" ? a.language : undefined,
    contentHash: typeof a.contextHash === "string" ? a.contextHash : undefined,
    diffSize: a.originalContent && a.modifiedContent
      ? Math.abs(String(a.modifiedContent).length - String(a.originalContent).length)
      : undefined,
    projectId: typeof a.projectId === "string" ? a.projectId : undefined,
    metadata: a as Record<string, unknown>,
  };
}

// ── Resources ─────────────────────────────────────────────

server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES }));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  return handleReadResource(request.params.uri.toString());
});

// ── Tools ─────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "analyze_workspace", description: "Analyze a git workspace diff for rule violations",
      inputSchema: { type: "object", properties: { baseCommit: { type: "string" }, headCommit: { type: "string" }, paths: { type: "array", items: { type: "string" } }, taskId: { type: "string" } }, required: ["baseCommit"] } },
    { name: "capture_diff", description: "Capture and analyze a code diff for rule violations",
      inputSchema: { type: "object", properties: { filePath: { type: "string" }, originalContent: { type: "string" }, modifiedContent: { type: "string" }, language: { type: "string" }, projectId: { type: "string" } }, required: ["filePath", "originalContent", "modifiedContent", "language"] } },
    { name: "query_rules", description: "Query rules by language and file path",
      inputSchema: { type: "object", properties: { language: { type: "string" }, filePath: { type: "string" }, projectId: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["language", "filePath"] } },
    { name: "confirm_rule", description: "Accept, reject, edit, or skip a suggested rule",
      inputSchema: { type: "object", properties: { ruleId: { type: "string" }, action: { type: "string", enum: ["accept", "reject", "edit", "skip"] }, editedPattern: { type: "string" }, editedSuggestion: { type: "string" } }, required: ["ruleId", "action"] } },
    { name: "resolve_conflict", description: "Resolve a rule conflict",
      inputSchema: { type: "object", properties: { conflictId: { type: "string" }, resolution: { type: "string", enum: ["keep_a", "keep_b", "merge", "skip"] }, batchAllSession: { type: "boolean" } }, required: ["conflictId", "resolution"] } },
    { name: "list_rules", description: "List rules with optional filters",
      inputSchema: { type: "object", properties: { language: { type: "string" }, scope: { type: "string", enum: ["project", "user", "global"] }, status: { type: "string", enum: ["active", "pending", "archived"] }, projectId: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
    { name: "cognition_query", description: "Query the cognition graph from a context hash",
      inputSchema: { type: "object", properties: { contextHash: { type: "string" }, intentHint: { type: "string", enum: ["REFACTOR", "BUGFIX", "BOILERPLATE"] }, maxDepth: { type: "number" } }, required: ["contextHash"] } },
    { name: "cognition_validate", description: "Validate code content against an AST template",
      inputSchema: { type: "object", properties: { nodeId: { type: "string" }, targetFileContent: { type: "string" } }, required: ["nodeId", "targetFileContent"] } },
    { name: "cognition_feedback", description: "Submit feedback to adjust edge weights",
      inputSchema: { type: "object", properties: { nodeId: { type: "string" }, edgeId: { type: "string" }, outcome: { type: "string", enum: ["ACCEPTED", "REJECTED", "MODIFIED"] }, comment: { type: "string" } }, required: ["nodeId", "outcome"] } },
    { name: "cognition_approve_injection", description: "Approve, reject, or override a pending injection proposal",
      inputSchema: { type: "object", properties: { proposalId: { type: "string" }, decision: { type: "string", enum: ["APPROVE", "REJECT", "OVERRIDE"] } }, required: ["proposalId", "decision"] } },
    { name: "cognition_update_config", description: "Update server configuration",
      inputSchema: { type: "object", properties: { mode: { type: "string", enum: ["silent", "confirm"] }, data: { type: "object" } } } },
  ],
}));

// ── Tool Dispatch ─────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const startTime = performance.now();

  try {
    const policyEngine = getPolicyEngine();
    const policyCtx = buildPolicyContext(name, args as Record<string, unknown> | undefined);
    const policyDecision = policyEngine.evaluate(policyCtx);

    logPolicyDecision({
      tool: name,
      matchedPolicyIds: policyDecision.matchedPolicies.map(p => p.policyId),
      blocked: !policyDecision.allowed,
      requiresApproval: policyDecision.requiresApproval,
    });

    if (!policyDecision.allowed) {
      logToolExecution({ tool: name, latencyMs: performance.now() - startTime, outcome: "BLOCKED_BY_POLICY" });
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Blocked by policy", policyWarnings: policyDecision.warnings, matchedPolicies: policyDecision.matchedPolicies.map(p => ({ id: p.policyId, name: p.policyName })) }) }],
        isError: true,
      };
    }

    const result = await dispatchTool(name, args as Record<string, unknown> | undefined);

    if (policyDecision.warnings.length > 0 && result.content?.[0]?.text) {
      try {
        const parsed = JSON.parse(result.content[0].text);
        if (typeof parsed === "object" && !Array.isArray(parsed)) {
          parsed._policyWarnings = policyDecision.warnings;
          parsed._requiresApproval = policyDecision.requiresApproval;
          result.content[0].text = JSON.stringify(parsed);
        }
      } catch { /* not JSON, leave as-is */ }
    }

    const latencyMs = performance.now() - startTime;
    logToolExecution({ tool: name, latencyMs, outcome: "ALLOW" });
    return result;
  } catch (err) {
    const latencyMs = performance.now() - startTime;
    logger.error({ tool: name, latencyMs, err }, "tool execution error");
    if (err instanceof McpError) throw err;
    return { content: [{ type: "text", text: JSON.stringify({ error: String(err) }) }], isError: true };
  }
});

async function dispatchTool(name: string, args: Record<string, unknown> | undefined) {
  switch (name) {
    case "analyze_workspace": { const v = validateInput(AnalyzeWorkspaceSchema, args, name); if (!v.success) return v.error; return await handleAnalyzeWorkspace(v.data as any, ruleRepo, diffLogRepo, metricRepo); }
    case "capture_diff": { const v = validateInput(CaptureDiffSchema, args, name); if (!v.success) return v.error; return await handleCaptureDiff(v.data as any, ruleRepo, diffLogRepo, metricRepo, await getMode()); }
    case "query_rules": { const v = validateInput(QueryRulesSchema, args, name); if (!v.success) return v.error; return await handleQueryRules(v.data as any, ruleRepo, metricRepo); }
    case "confirm_rule": { const v = validateInput(ConfirmRuleSchema, args, name); if (!v.success) return v.error; return await handleConfirmRule(v.data as any, ruleRepo, metricRepo); }
    case "resolve_conflict": { const v = validateInput(ResolveConflictSchema, args, name); if (!v.success) return v.error; return await handleResolveConflict(v.data as any, conflictRepo, ruleRepo, metricRepo); }
    case "list_rules": { const v = validateInput(ListRulesSchema, args, name); if (!v.success) return v.error; return await handleListRules(v.data as any, ruleRepo); }
    case "cognition_query": { const v = validateInput(CognitionQuerySchema, args, name); if (!v.success) return v.error; return await handleCognitionQuery(v.data as any); }
    case "cognition_validate": { const v = validateInput(CognitionValidateSchema, args, name); if (!v.success) return v.error; return await handleCognitionValidate(v.data as any); }
    case "cognition_feedback": { const v = validateInput(CognitionFeedbackSchema, args, name); if (!v.success) return v.error; return await handleCognitionFeedback(v.data as any); }
    case "cognition_approve_injection": { const v = validateInput(ApproveInjectionSchema, args, name); if (!v.success) return v.error; return await handleApproveInjection(v.data as any); }
    case "cognition_update_config": { const v = validateInput(UpdateConfigSchema, args, name); if (!v.success) return v.error; return await handleUpdateConfig(v.data as any); }
    default: throw new McpError(ErrorCode.MethodNotFound, "Unknown tool: " + name);
  }
}

// ── Startup ───────────────────────────────────────────────

async function main() {
  const prisma = getPrismaClient();
  const policyEngine = getPolicyEngine();
  policyEngine.loadPolicies(DEFAULT_POLICIES);
  logger.info({ policyCount: policyEngine.getAllPolicies().length }, "policy engine initialized");

  await prisma.$connect();
  await prisma.appConfig.upsert({ where: { id: "default" }, update: {}, create: { id: "default", mode: "silent" } });

  const transport = new StdioServerTransport();
  server.onerror = (err) => logger.error({ err }, "MCP server error");

  process.on("SIGINT", async () => { await disconnectPrisma(); process.exit(0); });
  process.on("SIGTERM", async () => { await disconnectPrisma(); process.exit(0); });

  await server.connect(transport);
  logger.info("MCP Cognition Engine running on stdio");
}

main().catch((err) => {
  logger.fatal({ err }, "fatal startup error");
  process.exit(1);
});



