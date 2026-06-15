import { writeFileSync } from "node:fs";

export function generateOpenAPISchema(serverName: string, serverVersion: string): object {
  return {
    openapi: "3.1.0",
    info: { title: serverName, version: serverVersion, description: "MCP Rule Engine — OpenAPI schema" },
    servers: [{ url: "mcp://local", description: "MCP stdio transport" }],
    paths: {
      "/tools/analyze_workspace": { post: { summary: "Analyze workspace", requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { baseCommit: { type: "string" }, headCommit: { type: "string" }, paths: { type: "array", items: { type: "string" } }, fileContents: { type: "array", items: { type: "object", properties: { path: { type: "string" }, originalContent: { type: "string" }, modifiedContent: { type: "string" } } } }, taskId: { type: "string" }, concurrency: { type: "integer", default: 5 } }, required: ["baseCommit"] } } } }, responses: { "200": { description: "AnalyzeResult" } } } },
      "/tools/query_rules": { post: { summary: "Query rules", requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { language: { type: "string" }, filePath: { type: "string" }, tags: { type: "array", items: { type: "string" } }, taskId: { type: "string" } }, required: ["language","filePath"] } } } }, responses: { "200": { description: "Scored rules" } } } },
      "/tools/confirm_rule": { post: { summary: "Confirm/edit/skip", requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { ruleId: { type: "string" }, action: { type: "string", enum: ["accept","reject","edit","skip"] }, editedPattern: { type: "string" }, editedSuggestion: { type: "string" } }, required: ["ruleId","action"] } } } }, responses: { "200": { description: "Result" } } } },
      "/tools/resolve_conflict": { post: { summary: "Resolve conflict", requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { conflictId: { type: "string" }, resolution: { type: "string", enum: ["keep_a","keep_b","merge","skip"] }, batchAllSession: { type: "boolean" } }, required: ["conflictId","resolution"] } } } }, responses: { "200": { description: "Result" } } } },
      "/tools/list_rules": { post: { summary: "List rules", requestBody: { content: { "application/json": { schema: { type: "object", properties: { language: { type: "string" }, scope: { type: "string", enum: ["project","user","global"] }, status: { type: "string", enum: ["active","pending","archived"] }, projectId: { type: "string" }, limit: { type: "integer" }, offset: { type: "integer" } } } } } }, responses: { "200": { description: "Rule list" } } } }
    }
  } as const;
}

export function exportOpenAPISchema(filePath: string, serverName = "MCP Rule Engine", serverVersion = "0.6.0"): void {
  writeFileSync(filePath, JSON.stringify(generateOpenAPISchema(serverName, serverVersion), null, 2), "utf-8");
}
