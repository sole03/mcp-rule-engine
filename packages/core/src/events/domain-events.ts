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
 * @file Domain Events — 领域事件类型定义
 *
 * 所有跨组件通信均通过类型安全的事件进行。
 * 事件类型前缀对应子系统：
 *   cognition.*  — 认知引擎
 *   governance.* — 治理系统
 *   amygdala.*  — 杏仁核直觉系统
 */

// ── 认知域事件 ──

export interface CognitionQueryRequested {
  type: "cognition.query.requested";
  payload: {
    contextHash: string;
    intentHint?: "REFACTOR" | "BUGFIX" | "BOILERPLATE";
    maxDepth?: number;
    correlationId: string;
  };
}

export interface CognitionQueryCompleted {
  type: "cognition.query.completed";
  payload: {
    correlationId: string;
    nodes: { id: string; type: string; abstractionLevel: number; relevanceScore: number }[];
    edges: { id: string; sourceId: string; targetId: string; relation: string; weight: number }[];
    durationMs: number;
    truncated: boolean;
  };
}

export interface CognitionFeedbackRecorded {
  type: "cognition.feedback.recorded";
  payload: {
    nodeId: string;
    edgeId?: string;
    outcome: "ACCEPTED" | "REJECTED" | "MODIFIED";
    weightDelta: number;
    feedbackId: string;
  };
}

// ── 治理域事件 ──

export interface PolicyEvaluated {
  type: "governance.policy.evaluated";
  payload: {
    toolName: string;
    allowed: boolean;
    requiresApproval: boolean;
    matchedPolicyIds: string[];
    warnings: string[];
  };
}

export interface ProposalStatusChanged {
  type: "governance.proposal.status_changed";
  payload: {
    proposalId: string;
    from: string;
    to: "APPROVED" | "REJECTED" | "EXPIRED" | "OVERRIDDEN";
    at: string;
  };
}

export interface ImmuneCycleCompleted {
  type: "governance.immune.cycle_completed";
  payload: {
    coldStartImmune: number;
    autoRenewed: number;
    archived: number;
    revived: number;
    conflictLocked: boolean;
    summary: string;
  };
}

// ── 杏仁核域事件 ──

export interface AmygdalaTriggered {
  type: "amygdala.triggered";
  payload: {
    diffSize: number;
    riskScore: number;
    reason: string;
  };
}

export type DomainEvent =
  | CognitionQueryRequested
  | CognitionQueryCompleted
  | CognitionFeedbackRecorded
  | PolicyEvaluated
  | ProposalStatusChanged
  | ImmuneCycleCompleted
  | AmygdalaTriggered;
