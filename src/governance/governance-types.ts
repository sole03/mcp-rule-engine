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
 * @file Policy Engine Types
 * Defines the Policy-as-Code type system. Policies are JSON-serializable rules
 * that govern code validation, diff capture, and injection approval.
 */

// ── Policy Definition ─────────────────────────────────────

export type PolicySeverity = "WARN" | "BLOCK";
export type PolicyScope = "global" | "project";
export type PolicyStatus = "active" | "paused" | "testing";

export interface JsonPolicy {
  id: string;
  name: string;
  description: string;
  scope: PolicyScope;
  severity: PolicySeverity;
  status: PolicyStatus;
  priority: number;
  conditions: PolicyCondition[];
  actions: PolicyAction[];
}

// ── Policy Conditions ─────────────────────────────────────

export interface PolicyCondition {
  type: "file_ext" | "file_path_match" | "content_match" | "diff_size" | "tool_name" | "composite";
  // File matching
  extensions?: string[];
  pathPattern?: string;
  // Content matching
  regexPattern?: string;
  // Diff size threshold
  maxDiffLines?: number;
  // Tool name matching
  toolNames?: string[];
  // Composite (AND/OR of sub-conditions)
  operator?: "AND" | "OR";
  conditions?: PolicyCondition[];
}

// ── Policy Actions ────────────────────────────────────────

export type PolicyActionType = "require_approval" | "reject" | "log_warning" | "require_schema_validation";

export interface PolicyAction {
  type: PolicyActionType;
  config?: Record<string, unknown>;
}

// ── Evaluation Types ──────────────────────────────────────

export interface PolicyEvalContext {
  toolName: string;
  filePath?: string;
  language?: string;
  contentHash?: string;
  diffSize?: number;
  projectId?: string;
  metadata?: Record<string, unknown>;
}

export interface PolicyEvalResult {
  policyId: string;
  policyName: string;
  matched: boolean;
  severity: PolicySeverity;
  actions: PolicyAction[];
  reason?: string;
}

export interface PolicyDecision {
  allowed: boolean;
  requiresApproval: boolean;
  warnings: string[];
  matchedPolicies: PolicyEvalResult[];
}
