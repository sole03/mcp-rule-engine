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
 * @file Cognition Engine MCP Resources
 * Exposes four resources for Agent discovery:
 *   cognition://schema           — Graph data model JSON Schema
 *   cognition://stats            — Graph statistics (node/edge counts)
 *   cognition://docs/overview    — Integration documentation
 *   cognition://rules-changelog  — Global rule change log
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getPrismaClient } from "../data/client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "../..");

// ── Resource Definitions ───────────────────────────────────

export const RESOURCES = [
  {
    uri: "cognition://schema",
    name: "Cognition Graph Schema",
    description:
      "JSON Schema of the cognition graph data model, including CognitionNode, CognitionEdge, and AstTemplate tables and their relationships.",
    mimeType: "application/json",
  },
  {
    uri: "cognition://stats",
    name: "Cognition Engine Statistics",
    description:
      "Current graph statistics: node count, edge count, feedback event count, and average traversal latency. Useful for health checks and capacity planning.",
    mimeType: "application/json",
  },
  {
    uri: "cognition://docs/overview",
    name: "Cognition Engine Documentation",
    description:
      "GovernFlow project README. Agents can read this to understand the project architecture, quickstart guide, and available MCP tools.",
    mimeType: "text/markdown",
  },
  {
    uri: "cognition://rules-changelog",
    name: "Rules Changelog",
    description:
      "Versioned changelog of global rule changes. Returns version = SHA-256 prefix of updated_at field. Agents must read this before making rule modifications.",
    mimeType: "application/json",
  },
];

// ── Resource Readers ──────────────────────────────────────

async function readCognitionSchema(): Promise<{ contents: { uri: string; mimeType: string; text: string }[] }> {
  const schema = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    title: "CognitionGraph",
    description: "Schema for the cognition graph data model",
    type: "object",
    properties: {
      CognitionNode: {
        type: "object",
        properties: {
          id: { type: "string", description: "Unique node identifier (CUID)" },
          type: {
            type: "string",
            enum: ["INTENT", "CONSTRAINT", "HEURISTIC", "PATTERN"],
            description: "Node type",
          },
          semanticHash: { type: "string", description: "Semantic deduplication hash" },
          abstractionLevel: {
            type: "integer",
            minimum: 0,
            maximum: 3,
            description: "0=code, 1=function, 2=module, 3=architecture",
          },
          payload: { type: "object", description: "Structured AST/constraint data" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      CognitionEdge: {
        type: "object",
        properties: {
          id: { type: "string" },
          sourceId: { type: "string", description: "Source node ID" },
          targetId: { type: "string", description: "Target node ID" },
          relation: {
            type: "string",
            enum: ["CAUSES", "PRECEDES", "MUTEX", "GENERALIZES", "REFINES"],
          },
          weight: { type: "number", minimum: 0, maximum: 10, default: 1.0 },
        },
      },
      AstTemplate: {
        type: "object",
        properties: {
          nodeId: { type: "string" },
          language: { type: "string" },
          templateDsl: { type: "string", description: "AST constraint DSL" },
        },
      },
    },
  };
  return {
    contents: [{
      uri: "cognition://schema",
      mimeType: "application/json",
      text: JSON.stringify(schema, null, 2),
    }],
  };
}

async function readCognitionStats(): Promise<{ contents: { uri: string; mimeType: string; text: string }[] }> {
  const prisma = getPrismaClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
  const [nodeCount, edgeCount, feedbackCount, recentFeedback, approvedCount, embeddedCount] = await Promise.all([
    prisma.cognitionNode.count(),
    prisma.cognitionEdge.count(),
    prisma.metricEvent.count({ where: { eventType: { startsWith: "cognition_feedback" } } }),
    prisma.metricEvent.count({
      where: { eventType: { startsWith: "cognition_feedback" }, createdAt: { gte: sevenDaysAgo } },
    }),
    prisma.metricEvent.count({
      where: {
        eventType: { startsWith: "cognition_feedback" },
        properties: { contains: "APPROVED" },
        createdAt: { gte: sevenDaysAgo },
      },
    }),
    prisma.cognitionNode.count({
      where: { metadata: { contains: "embedding" } },
    }),
  ] as const);
  const approvalRate7d = recentFeedback > 0 ? approvedCount / recentFeedback : 0;
  const thresholdAdjustmentSuggestion =
    approvalRate7d > 0.4 || approvalRate7d < 0.05
      ? "Threshold adjustment recommended: approvalRate7d = " + (approvalRate7d * 100).toFixed(1) + "%"
      : undefined;
  return {
    contents: [{
      uri: "cognition://stats",
      mimeType: "application/json",
      text: JSON.stringify(
        {
          nodeCount,
          edgeCount,
          feedbackCount,
          approvalRate7d: Math.round(approvalRate7d * 100) / 100,
          thresholdAdjustmentSuggestion,
          embeddedNodes: embeddedCount,
          embeddingCoverage: nodeCount > 0 ? Math.round((embeddedCount / nodeCount) * 100) / 100 : 0,
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    }],
  };
}

async function readCognitionDocs(): Promise<{ contents: { uri: string; mimeType: string; text: string }[] }> {
  let text: string;
  try {
    text = readFileSync(join(projectRoot, "README.md"), "utf-8");
  } catch {
    text = readFileSync(join(projectRoot, "OPTIMIZATION.md"), "utf-8");
  }
  return {
    contents: [{
      uri: "cognition://docs/overview",
      mimeType: "text/markdown",
      text,
    }],
  };
}

async function readRulesChangelog(): Promise<{ contents: { uri: string; mimeType: string; text: string }[] }> {
  return {
    contents: [{
      uri: "cognition://rules-changelog",
      mimeType: "application/json",
      text: JSON.stringify({ version: "1.0.0-alpha.2", updatedAt: new Date().toISOString(), changes: [] }),
    }],
  };
}

// ── Resource Router ───────────────────────────────────────

export async function handleReadResource(uri: string): Promise<{ contents: { uri: string; mimeType: string; text: string }[] }> {
  switch (uri) {
    case "cognition://schema":
      return readCognitionSchema();
    case "cognition://stats":
      return readCognitionStats();
    case "cognition://docs/overview":
      return readCognitionDocs();
    case "cognition://rules-changelog":
      return readRulesChangelog();
    default:
      return {
        contents: [{
          uri,
          mimeType: "text/plain",
          text: JSON.stringify({ error: "Unknown resource: " + uri }),
        }],
      };
  }
}
