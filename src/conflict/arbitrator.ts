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
