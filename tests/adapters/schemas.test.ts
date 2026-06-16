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

import { describe, it, expect } from "vitest";
import { AnalyzeWorkspaceSchema, CaptureDiffSchema, QueryRulesSchema, ConfirmRuleSchema, ResolveConflictSchema, ListRulesSchema, CognitionQuerySchema, CognitionValidateSchema, CognitionFeedbackSchema, ApproveInjectionSchema, UpdateConfigSchema, validateInput } from "../../src/adapters/schemas.js";

describe("Schema Validation — Legacy Rule Tools", () => {
  it("AnalyzeWorkspaceSchema rejects missing baseCommit", () => {
    const r = validateInput(AnalyzeWorkspaceSchema, {}, "analyze_workspace");
    expect(r.success).toBe(false);
    if (!r.success) {
      const d = JSON.parse(r.error.content[0].text);
      expect(d.error).toContain("analyze_workspace");
      expect(d.code).toBe(-32602);
    }
  });

  it("AnalyzeWorkspaceSchema accepts valid input", () => {
    const r = validateInput(AnalyzeWorkspaceSchema, { baseCommit: "abc123" }, "analyze_workspace");
    expect(r.success).toBe(true);
  });

  it("CaptureDiffSchema rejects missing filePath", () => {
    const r = validateInput(CaptureDiffSchema, { originalContent: "x", modifiedContent: "y", language: "ts" }, "capture_diff");
    expect(r.success).toBe(false);
  });

  it("CaptureDiffSchema accepts valid input", () => {
    const r = validateInput(CaptureDiffSchema, { filePath: "a.ts", originalContent: "x", modifiedContent: "y", language: "ts" }, "capture_diff");
    expect(r.success).toBe(true);
  });

  it("QueryRulesSchema rejects missing language", () => {
    const r = validateInput(QueryRulesSchema, { filePath: "a.ts" }, "query_rules");
    expect(r.success).toBe(false);
  });

  it("QueryRulesSchema accepts valid input", () => {
    const r = validateInput(QueryRulesSchema, { language: "ts", filePath: "a.ts" }, "query_rules");
    expect(r.success).toBe(true);
  });

  it("ConfirmRuleSchema rejects invalid action", () => {
    const r = validateInput(ConfirmRuleSchema, { ruleId: "x", action: "invalid" }, "confirm_rule");
    expect(r.success).toBe(false);
  });

  it("ConfirmRuleSchema accepts valid input", () => {
    const r = validateInput(ConfirmRuleSchema, { ruleId: "x", action: "accept" }, "confirm_rule");
    expect(r.success).toBe(true);
  });

  it("ResolveConflictSchema rejects invalid resolution", () => {
    const r = validateInput(ResolveConflictSchema, { conflictId: "x", resolution: "bad" }, "resolve_conflict");
    expect(r.success).toBe(false);
  });

  it("ResolveConflictSchema accepts valid input", () => {
    const r = validateInput(ResolveConflictSchema, { conflictId: "x", resolution: "keep_a" }, "resolve_conflict");
    expect(r.success).toBe(true);
  });

  it("ListRulesSchema rejects invalid scope", () => {
    const r = validateInput(ListRulesSchema, { scope: "bad" }, "list_rules");
    expect(r.success).toBe(false);
  });

  it("ListRulesSchema accepts empty input (all fields optional)", () => {
    const r = validateInput(ListRulesSchema, {}, "list_rules");
    expect(r.success).toBe(true);
  });
});

describe("Schema Validation — Cognition Tools", () => {
  it("CognitionQuerySchema rejects empty contextHash", () => {
    const r = validateInput(CognitionQuerySchema, { contextHash: "" }, "cognition_query");
    expect(r.success).toBe(false);
  });

  it("CognitionQuerySchema accepts valid input", () => {
    const r = validateInput(CognitionQuerySchema, { contextHash: "hash", maxDepth: 3 }, "cognition_query");
    expect(r.success).toBe(true);
  });

  it("CognitionValidateSchema rejects missing targetFileContent", () => {
    const r = validateInput(CognitionValidateSchema, { nodeId: "n1" }, "cognition_validate");
    expect(r.success).toBe(false);
  });

  it("CognitionValidateSchema accepts valid input", () => {
    const r = validateInput(CognitionValidateSchema, { nodeId: "n1", targetFileContent: "code" }, "cognition_validate");
    expect(r.success).toBe(true);
  });

  it("CognitionFeedbackSchema rejects invalid outcome", () => {
    const r = validateInput(CognitionFeedbackSchema, { nodeId: "n1", outcome: "BAD" }, "cognition_feedback");
    expect(r.success).toBe(false);
  });

  it("CognitionFeedbackSchema accepts valid input", () => {
    const r = validateInput(CognitionFeedbackSchema, { nodeId: "n1", outcome: "ACCEPTED" }, "cognition_feedback");
    expect(r.success).toBe(true);
  });

  it("ApproveInjectionSchema rejects missing proposalId", () => {
    const r = validateInput(ApproveInjectionSchema, { decision: "APPROVE" }, "cognition_approve_injection");
    expect(r.success).toBe(false);
  });

  it("ApproveInjectionSchema accepts valid input", () => {
    const r = validateInput(ApproveInjectionSchema, { proposalId: "prop-1", decision: "APPROVE" }, "cognition_approve_injection");
    expect(r.success).toBe(true);
  });

  it("UpdateConfigSchema rejects missing key", () => {
    const r = validateInput(UpdateConfigSchema, { value: 42 }, "cognition_update_config");
    expect(r.success).toBe(false);
  });

  it("UpdateConfigSchema accepts valid input", () => {
    const r = validateInput(UpdateConfigSchema, { key: "threshold", value: 42 }, "cognition_update_config");
    expect(r.success).toBe(true);
  });
});