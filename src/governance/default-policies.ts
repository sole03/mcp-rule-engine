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
 * @file Default Policies
 * Built-in policy definitions. These are shipped with the engine and can be
 * extended/overridden by user-provided JSON policy files.
 */

import type { JsonPolicy } from "./governance-types.js";

export const DEFAULT_POLICIES: JsonPolicy[] = [
  {
    id: "policy-large-diff-approval",
    name: "Large Diff Approval",
    description: "Diffs exceeding 200 lines require explicit approval before injection.",
    scope: "project",
    severity: "WARN",
    status: "active",
    priority: 100,
    conditions: [
      { type: "tool_name", toolNames: ["capture_diff"] },
      { type: "diff_size", maxDiffLines: 200 },
    ],
    actions: [
      { type: "require_approval" },
      { type: "log_warning" },
    ],
  },
  {
    id: "policy-config-tool-log",
    name: "Config Change Logging",
    description: "All config changes must be logged for audit trail.",
    scope: "global",
    severity: "WARN",
    status: "active",
    priority: 80,
    conditions: [
      { type: "tool_name", toolNames: ["cognition_update_config"] },
    ],
    actions: [
      { type: "log_warning" },
    ],
  },
  {
    id: "policy-approval-tool-isolation",
    name: "Approval Tool Isolation",
    description: "The approve_injection tool itself cannot trigger further approvals.",
    scope: "global",
    severity: "WARN",
    status: "active",
    priority: 120,
    conditions: [
      { type: "tool_name", toolNames: ["cognition_approve_injection"] },
    ],
    actions: [
      { type: "log_warning" },
    ],
  },
  {
    id: "policy-temp-files-cleanup",
    name: "Temporary File Cleanup",
    description: "Temporary test/helper files generated during a task should be deleted after completion. Exceptions: tests/, docs/, .codex/.",
    scope: "project",
    severity: "WARN",
    status: "active",
    priority: 60,
    conditions: [
      { type: "composite", operator: "AND", conditions: [
        { type: "file_path_match", pathPattern: "^(?!.*(?:tests|docs|\\.codex)\\/).*\\.(?:test\\.tmp|temp\\.|__.*__)" },
      ]},
    ],
    actions: [
      { type: "log_warning" },
    ],
  },
  {
    id: "policy-schema-validation-required",
    name: "Schema Validation Required",
    description: "All tool inputs must pass zod schema validation before execution.",
    scope: "global",
    severity: "BLOCK",
    status: "active",
    priority: 200,
    conditions: [],
    actions: [
      { type: "require_schema_validation" },
    ],
  },
];
