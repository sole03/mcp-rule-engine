/**
 * Copyright 2026 熊高锐
 *
 * Licensed under the Apache License, Version 2.0
 */

/**
 * @file HTTP Server Entry Point
 * Streamable HTTP transport for multi-client MCP access.
 * Supports Cursor, Claude Desktop, Cline, and custom dashboards.
 *
 * Usage:
 *   node dist/http-server.js
 *   PORT=3000 node dist/http-server.js
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "node:crypto";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

process.env.DATABASE_URL = process.env.DATABASE_URL || "file:./mcp-cognition.db";

import { disconnectPrisma } from "../data/client.js"
import { getPrismaClient } from "../data/client.js";
import { RuleRepo } from "../data/rule-repo.js";
import { DiffLogRepo } from "../data/diff-log-repo.js";
import { ConflictRepo } from "../data/conflict-repo.js";
import { MetricRepo } from "../data/metric-repo.js";
import { handleCaptureDiff } from "./mcp/capture-diff.js";
import { handleQueryRules } from "./mcp/query-rules.js";
import { handleConfirmRule } from "./mcp/confirm-rule.js";
import { handleResolveConflict } from "./mcp/resolve-conflict.js";
import { handleListRules } from "./mcp/list-rules.js";
import { handleAnalyzeWorkspace } from "./mcp/analyze-workspace.js";
import { handleCognitionQuery, handleCognitionValidate, handleCognitionFeedback } from "./mcp/cognition-tools.js";
import { handleApproveInjection } from "./mcp/injection-approval.js";
import { handleUpdateConfig } from "./mcp/config-tools.js";
import { handleWorkflowSubmit, handleWorkflowVote, handleWorkflowStatus, handleWorkflowEscalate } from "./mcp/workflow-tools.js";
import { handleImmuneCycle, handleImmuneStats } from "./mcp/immune-tools.js";
import type { IRuleRepository, IDiffLogRepository, IConflictRepository, IMetricRepository } from "../data/repository-interfaces.js";
import { handleReadResource } from "./cognition-resources.js"
import { RESOURCES } from "./cognition-resources.js";
import { validateInput, AnalyzeWorkspaceSchema, CaptureDiffSchema, QueryRulesSchema, ConfirmRuleSchema, ResolveConflictSchema, ListRulesSchema, CognitionQuerySchema, CognitionValidateSchema, CognitionFeedbackSchema, ApproveInjectionSchema, UpdateConfigSchema } from "../adapters/schemas.js";
import { getPolicyEngine } from "../governance/policy-engine.js"
import { DEFAULT_POLICIES } from "../governance/default-policies.js";
import type { PolicyEvalContext } from "../governance/governance-types.js";
import { logger, logToolExecution, logPolicyDecision } from "../telemetry/logger.js";
import { GovernanceCore } from "./governance-core.js";

// Module-level core for dispatch scope
let core: GovernanceCore;




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
  const uri = request.params.uri;
  return handleReadResource(uri);
});

// ── Tools ─────────────────────────────────────────────────

const TOOLS = [
  { name: "analyze_workspace", description: "Analyze git workspace diff and generate optimization rules", inputSchema: { type: "object", properties: { baseCommit: { type: "string" }, headCommit: { type: "string" }, paths: { type: "array", items: { type: "string" } }, taskId: { type: "string" }, concurrency: { type: "number" }, fileContents: { type: "array", items: { type: "object", properties: { path: { type: "string" }, originalContent: { type: "string" }, modifiedContent: { type: "string" } } } } }, required: ["baseCommit"] } },
  { name: "capture_diff", description: "Capture file diff for rule matching with AST-level analysis", inputSchema: { type: "object", properties: { filePath: { type: "string" }, originalContent: { type: "string" }, modifiedContent: { type: "string" }, language: { type: "string" }, projectId: { type: "string" } }, required: ["filePath", "originalContent", "modifiedContent", "language"] } },
  { name: "query_rules", description: "Query rules matching a given language and file context", inputSchema: { type: "object", properties: { language: { type: "string" }, filePath: { type: "string" }, projectId: { type: "string" }, tags: { type: "array", items: { type: "string" } }, taskId: { type: "string" } }, required: ["language", "filePath"] } },
  { name: "confirm_rule", description: "Confirm, reject, or edit a rule suggestion", inputSchema: { type: "object", properties: { ruleId: { type: "string" }, action: { type: "string", enum: ["accept", "reject", "edit", "skip"] }, editedPattern: { type: "string" }, editedSuggestion: { type: "string" } }, required: ["ruleId", "action"] } },
  { name: "resolve_conflict", description: "Resolve rule conflicts with arbitration strategy", inputSchema: { type: "object", properties: { conflictId: { type: "string" }, resolution: { type: "string", enum: ["keep_a", "keep_b", "merge", "skip"] }, batchAllSession: { type: "boolean" } }, required: ["conflictId", "resolution"] } },
  { name: "list_rules", description: "List rules by language, scope, status", inputSchema: { type: "object", properties: { language: { type: "string" }, scope: { type: "string" }, status: { type: "string" }, projectId: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "cognition_query", description: "Query the cognition graph for relevant nodes", inputSchema: { type: "object", properties: { contextHash: { type: "string" }, intentHint: { type: "string", enum: ["REFACTOR", "BUGFIX", "BOILERPLATE"] }, maxDepth: { type: "number" } }, required: ["contextHash"] } },
  { name: "cognition_validate", description: "Validate code against cognition AST templates", inputSchema: { type: "object", properties: { nodeId: { type: "string" }, targetFileContent: { type: "string" } }, required: ["nodeId", "targetFileContent"] } },
  { name: "cognition_feedback", description: "Submit feedback to refine cognition graph weights", inputSchema: { type: "object", properties: { nodeId: { type: "string" }, edgeId: { type: "string" }, outcome: { type: "string", enum: ["ACCEPTED", "REJECTED", "MODIFIED"] }, comment: { type: "string" } }, required: ["nodeId", "outcome"] } },
  { name: "cognition_approve_injection", description: "Approve or reject an injection proposal", inputSchema: { type: "object", properties: { proposalId: { type: "string" }, decision: { type: "string", enum: ["APPROVE", "REJECT", "OVERRIDE"] } }, required: ["proposalId", "decision"] } },
  { name: "cognition_update_config", description: "Update cognition engine configuration", inputSchema: { type: "object", properties: { key: { type: "string" }, value: { type: "string" } }, required: ["key", "value"] } },
  { name: "workflow_submit", description: "Submit a proposal for multi-reviewer approval workflow", inputSchema: { type: "object", properties: { proposalId: { type: "string" }, config: { type: "object", properties: { reviewStrategy: { type: "string", enum: ["ANY", "ALL", "QUORUM"] }, quorumSize: { type: "number" }, reviewers: { type: "array", items: { type: "string" } }, fallbackReviewer: { type: "string" }, ttlMs: { type: "number" }, autoRejectOnTimeout: { type: "boolean" }, webhooks: { type: "array", items: { type: "string" } }, metadata: { type: "object" } }, required: ["reviewers", "ttlMs"] } }, required: ["proposalId", "config"] } },
  { name: "workflow_vote", description: "Cast a vote on a pending approval request", inputSchema: { type: "object", properties: { approvalId: { type: "string" }, reviewerId: { type: "string" }, decision: { type: "string", enum: ["APPROVED", "REJECTED"] }, comment: { type: "string" } }, required: ["approvalId", "reviewerId", "decision"] } },
  { name: "workflow_status", description: "Get approval request status or list pending for reviewer", inputSchema: { type: "object", properties: { approvalId: { type: "string" }, reviewerId: { type: "string" } } } },
  { name: "immune_cycle", description: "Run a full rule immune cycle: auto-renew, archive, revive, conflict check", inputSchema: { type: "object", properties: {} } },
  { name: "immune_stats", description: "Get rule immune system health stats", inputSchema: { type: "object", properties: {} } },
  { name: "workflow_escalate", description: "Escalate a timed-out approval request", inputSchema: { type: "object", properties: { approvalId: { type: "string" } }, required: ["approvalId"] } },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = request.params.arguments;
  const startTime = performance.now();

  try {
    const policyEngine = getPolicyEngine();
    const ctx = buildPolicyContext(name, args as Record<string, unknown> | undefined);
    const policyDecision = policyEngine.evaluate(ctx);
    logPolicyDecision({
      tool: name,
      matchedPolicyIds: policyDecision.matchedPolicies.map(p => p.policyId),
      blocked: !policyDecision.allowed,
      requiresApproval: policyDecision.requiresApproval,
    });

    if (!policyDecision.allowed) {
      logToolExecution({ tool: name, latencyMs: performance.now() - startTime, outcome: "BLOCKED_BY_POLICY" });
      return { content: [{ type: "text", text: JSON.stringify({ error: "Blocked by policy", policyWarnings: policyDecision.warnings, matchedPolicies: policyDecision.matchedPolicies.map(p => ({ id: p.policyId, name: p.policyName })) }) }], isError: true };
    }

    const result = await dispatchTool(name, args as Record<string, unknown> | undefined);
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
    case "workflow_submit": return await handleWorkflowSubmit(args as any);
    case "workflow_vote": return await handleWorkflowVote(args as any);
    case "workflow_status": return await handleWorkflowStatus(args as any);
    case "workflow_escalate": return await handleWorkflowEscalate(args as any);
    case "immune_cycle": return await handleImmuneCycle(core);
    case "immune_stats": return await handleImmuneStats(core);
    default: throw new McpError(ErrorCode.MethodNotFound, "Unknown tool: " + name);
  }
}

// ── Startup ───────────────────────────────────────────────

async function main() {
  core = new GovernanceCore();
  const prisma = getPrismaClient();
  const policyEngine = getPolicyEngine();
  policyEngine.loadPolicies(DEFAULT_POLICIES);
  logger.info({ policyCount: policyEngine.getAllPolicies().length }, "policy engine initialized");

  await prisma.$connect();

  const vectorStore = core.vectorStore;
  const approvalSvc = core.workflowService;
  const immuneEngine = core.immuneEngine;

  // Warm embeddings

  vectorStore.embedUnembeddedNodes(20).then(count => {
    if (count > 0) logger.info({ embeddedCount: count }, "embedding warmup complete");
  }).catch(() => {});

  await prisma.appConfig.upsert({ where: { id: "default" }, update: {}, create: { id: "default", mode: "silent" } });

  // ── Expired approval cleanup timer (HTTP mode only) ─────

  setInterval(async () => {
    try {
      const { escalated, expired } = await approvalSvc.processExpired();
      if (escalated > 0 || expired > 0) {
        logger.info({ escalated, expired }, "expired approval cleanup");
      }
    } catch { /* best effort */ }
    try {
      const immuneResult = await immuneEngine.runCycle();
      if (immuneResult.autoRenewed > 0 || immuneResult.archived > 0 || immuneResult.revived > 0) {
        logger.info(immuneResult, "immune cycle executed");
      }
    } catch { /* best effort */ }
  }, 60_000); // every 60s

  // ── HTTP Transport ────────────────────────────────────
  const port = parseInt(process.env.PORT ?? "3000", 10);
  const host = process.env.HOST ?? "127.0.0.1";

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Health check
    if (req.url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", version: "1.0.0-alpha.2", uptime: process.uptime() }));
      return;
    }

    // CORS headers for dashboard access
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Create a new transport per request (stateless)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    await server.connect(transport);
    await transport.handleRequest(req, res);
  });

  process.on("SIGINT", async () => {
    logger.info("shutting down HTTP server");
    httpServer.close();
    await disconnectPrisma();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    httpServer.close();
    await disconnectPrisma();
    process.exit(0);
  });

  httpServer.listen(port, host, () => {
    logger.info({ port, host }, "MCP Cognition Engine HTTP server running");
    logger.info("Endpoints: POST /mcp | GET /health");
  });
}

main().catch((err) => {
  logger.fatal({ err }, "fatal startup error");
  process.exit(1);
});
