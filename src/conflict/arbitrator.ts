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

import { Rule, ConflictResolution, RuleSpec } from "../types.js";

export interface ConflictCheck {
  hasConflict: boolean; reason?: string; scopeKey?: string;
}

export function detectConflict(ruleA: Rule, ruleB: Rule): ConflictCheck {
  if (ruleA.type !== ruleB.type) return { hasConflict: false };
  if (ruleA.language !== ruleB.language) return { hasConflict: false };
  if (ruleA.pattern !== ruleB.pattern) return { hasConflict: false };
  if (ruleA.suggestion === ruleB.suggestion) return { hasConflict: false };
  return {
    hasConflict: true,
    reason: `same scope with different suggestions: "${ruleA.suggestion}" vs "${ruleB.suggestion}"`,
    scopeKey: `${ruleA.scope}:${ruleB.scope}:${ruleA.type}:${ruleA.language}:${ruleA.pattern}`,
  };
}

export function applyResolution(ruleA: Rule, ruleB: Rule, resolution: ConflictResolution): RuleSpec | undefined {
  if (resolution === "keep_a") {
    return { type: ruleA.type, pattern: ruleA.pattern, suggestion: ruleA.suggestion, language: ruleA.language, scope: ruleA.scope, tags: [...new Set([...(ruleA.tags ?? []), ...(ruleB.tags ?? [])])], category: "arbitration", source: "arbitration" };
  }
  if (resolution === "keep_b") {
    return { type: ruleB.type, pattern: ruleB.pattern, suggestion: ruleB.suggestion, language: ruleB.language, scope: ruleB.scope, tags: [...new Set([...(ruleA.tags ?? []), ...(ruleB.tags ?? [])])], category: "arbitration", source: "arbitration" };
  }
  if (resolution === "merge") {
    return { type: "convention", pattern: ruleA.pattern, suggestion: `${ruleA.suggestion}\n// Alternative: ${ruleB.suggestion}`, language: ruleA.language, confidence: "medium", category: "arbitration", source: "arbitration" };
  }
  return undefined;
}
