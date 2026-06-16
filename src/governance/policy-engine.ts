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
 * @file Policy Engine
 * Core evaluation engine: loads JSON policies, evaluates them against tool
 * invocation contexts, and returns structured decisions.
 *
 * Policies are loaded from a JSON config and can be hot-reloaded without
 * code changes. This is the Policy-as-Code foundation.
 */

import { evaluateCondition } from "./condition-evaluator.js";
import type { JsonPolicy, PolicyEvalContext, PolicyEvalResult, PolicyDecision } from "./governance-types.js";

export class PolicyEngine {
  private policies: Map<string, JsonPolicy> = new Map();

  constructor(policies: JsonPolicy[] = []) {
    this.loadPolicies(policies);
  }

  /** Load or reload policies from JSON definitions. */
  loadPolicies(policies: JsonPolicy[]): void {
    this.policies.clear();
    for (const policy of policies) {
      this.policies.set(policy.id, policy);
    }
  }

  /** Add or update a single policy. */
  upsertPolicy(policy: JsonPolicy): void {
    this.policies.set(policy.id, policy);
  }

  /** Remove a policy by id. */
  removePolicy(policyId: string): boolean {
    return this.policies.delete(policyId);
  }

  /** Get all active policies, sorted by priority (highest first). */
  getActivePolicies(): JsonPolicy[] {
    return [...this.policies.values()]
      .filter(p => p.status === "active")
      .sort((a, b) => b.priority - a.priority);
  }

  /** Get all policies regardless of status. */
  getAllPolicies(): JsonPolicy[] {
    return [...this.policies.values()];
  }

  /**
   * Evaluate all active policies against a tool invocation context.
   * Returns a structured decision with matched policies and actions.
   */
  evaluate(ctx: PolicyEvalContext): PolicyDecision {
    const activePolicies = this.getActivePolicies();
    const matchedPolicies: PolicyEvalResult[] = [];
    const warnings: string[] = [];
    let blocked = false;
    let requiresApproval = false;

    for (const policy of activePolicies) {
      const allConditionsMet = policy.conditions.length === 0 ||
        policy.conditions.every(c => evaluateCondition(c, ctx));

      if (!allConditionsMet) continue;

      const result: PolicyEvalResult = {
        policyId: policy.id,
        policyName: policy.name,
        matched: true,
        severity: policy.severity,
        actions: policy.actions,
        reason: `Policy "${policy.name}" matched for tool "${ctx.toolName}"`,
      };

      matchedPolicies.push(result);

      // Process actions
      for (const action of policy.actions) {
        switch (action.type) {
          case "reject":
            blocked = true;
            warnings.push(`[BLOCKED by ${policy.name}] ${policy.description}`);
            break;
          case "require_approval":
            requiresApproval = true;
            warnings.push(`[APPROVAL by ${policy.name}] ${policy.description}`);
            break;
          case "log_warning":
            warnings.push(`[WARN from ${policy.name}] ${policy.description}`);
            break;
          case "require_schema_validation":
            // This action is handled by the caller (schema validation layer)
            break;
        }
      }
    }

    return {
      allowed: !blocked,
      requiresApproval,
      warnings,
      matchedPolicies,
    };
  }

  /**
   * Quick check: does this context need approval?
   * Faster than full evaluate() when only the approval decision is needed.
   */
  needsApproval(ctx: PolicyEvalContext): boolean {
    for (const policy of this.getActivePolicies()) {
      const met = policy.conditions.length === 0 ||
        policy.conditions.every(c => evaluateCondition(c, ctx));
      if (met && policy.actions.some(a => a.type === "require_approval" || a.type === "reject")) {
        return true;
      }
    }
    return false;
  }
}

/** Singleton instance for the process. Policies are loaded once at startup. */
let defaultEngine: PolicyEngine | null = null;

export function getPolicyEngine(): PolicyEngine {
  if (!defaultEngine) {
    defaultEngine = new PolicyEngine();
  }
  return defaultEngine;
}

export function resetPolicyEngine(): void {
  defaultEngine = null;
}
