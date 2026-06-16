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
 * @file Tests for response-validation middleware
 */
import { describe, it, expect } from "vitest";
import { validateToolResponse } from "../../src/guards/response-validation.js";

describe("validateToolResponse", () => {
  it("passes through non-JSON content unchanged", () => {
    const response = { content: [{ type: "text", text: "plain text" }] };
    const result = validateToolResponse("cognition_query", response);
    expect(result.content[0].text).toBe("plain text");
  });

  it("auto-adds validationRequired to cognition_query response", () => {
    const response = { content: [{ type: "text", text: JSON.stringify({ nodes: [] }) }] };
    const result = validateToolResponse("cognition_query", response);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.validationRequired).toBe(true);
  });

  it("auto-adds validationRequired to cognition_validate response", () => {
    const response = { content: [{ type: "text", text: JSON.stringify({ valid: true }) }] };
    const result = validateToolResponse("cognition_validate", response);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.validationRequired).toBe(true);
  });

  it("does not modify validationRequired if already present", () => {
    const response = { content: [{ type: "text", text: JSON.stringify({ nodes: [], validationRequired: false }) }] };
    const result = validateToolResponse("cognition_query", response);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.validationRequired).toBe(false);
  });

  it("does not modify non-cognition tool responses", () => {
    const response = { content: [{ type: "text", text: JSON.stringify({ rules: [] }) }] };
    const result = validateToolResponse("list_rules", response);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.validationRequired).toBeUndefined();
  });

  it("handles empty content array", () => {
    const response = { content: [] };
    const result = validateToolResponse("cognition_query", response);
    expect(result.content).toEqual([]);
  });
});
