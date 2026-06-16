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
 * @file Policy Condition Evaluator
 * Evaluates individual policy conditions against a context.
 */

import type { PolicyCondition, PolicyEvalContext } from "./governance-types.js";

export function evaluateCondition(condition: PolicyCondition, ctx: PolicyEvalContext): boolean {
  switch (condition.type) {
    case "file_ext":
      return evaluateFileExt(condition, ctx);
    case "file_path_match":
      return evaluateFilePath(condition, ctx);
    case "content_match":
      return evaluateContentMatch(condition, ctx);
    case "diff_size":
      return evaluateDiffSize(condition, ctx);
    case "tool_name":
      return evaluateToolName(condition, ctx);
    case "composite":
      return evaluateComposite(condition, ctx);
    default:
      return false;
  }
}

function evaluateFileExt(cond: PolicyCondition, ctx: PolicyEvalContext): boolean {
  if (!ctx.filePath || !cond.extensions) return false;
  const ext = ctx.filePath.split(".").pop()?.toLowerCase() ?? "";
  return cond.extensions.map(e => e.toLowerCase().replace(/^\./, "")).includes(ext);
}

function evaluateFilePath(cond: PolicyCondition, ctx: PolicyEvalContext): boolean {
  if (!ctx.filePath || !cond.pathPattern) return false;
  try {
    const regex = new RegExp(cond.pathPattern, "i");
    return regex.test(ctx.filePath);
  } catch {
    return false;
  }
}

function evaluateContentMatch(cond: PolicyCondition, ctx: PolicyEvalContext): boolean {
  if (!cond.regexPattern || !ctx.contentHash) return false;
  try {
    const regex = new RegExp(cond.regexPattern, "i");
    return regex.test(ctx.contentHash);
  } catch {
    return false;
  }
}

function evaluateDiffSize(cond: PolicyCondition, ctx: PolicyEvalContext): boolean {
  if (cond.maxDiffLines === undefined || ctx.diffSize === undefined) return false;
  return ctx.diffSize > cond.maxDiffLines;
}

function evaluateToolName(cond: PolicyCondition, ctx: PolicyEvalContext): boolean {
  if (!cond.toolNames) return false;
  return cond.toolNames.includes(ctx.toolName);
}

function evaluateComposite(cond: PolicyCondition, ctx: PolicyEvalContext): boolean {
  if (!cond.conditions || cond.conditions.length === 0) return false;
  const results = cond.conditions.map(c => evaluateCondition(c, ctx));
  if (cond.operator === "OR") return results.some(Boolean);
  return results.every(Boolean); // default AND
}

