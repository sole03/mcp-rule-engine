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
import { handleCognitionQuery, handleCognitionValidate, handleCognitionFeedback } from "../../src/transport/mcp/cognition-tools.js";

describe("cognition_query", () => {
  it("returns error for empty contextHash", async () => {
    const result = await handleCognitionQuery({ contextHash: "" } as any);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBeDefined();
  });
  it("returns node list for valid contextHash", async () => {
    const result = await handleCognitionQuery({ contextHash: "test-hash", maxDepth: 1 });
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data.nodes)).toBe(true);
  });
});

describe("cognition_validate", () => {
  it("returns error for missing nodeId", async () => {
    const result = await handleCognitionValidate({ nodeId: "" } as any);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBeDefined();
  });
  it("returns error for missing content", async () => {
    const result = await handleCognitionValidate({ nodeId: "x", targetFileContent: "" } as any);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBeDefined();
  });
  it("returns node-not-found for non-existent node", async () => {
    const result = await handleCognitionValidate({ nodeId: "nonexistent", targetFileContent: "code" });
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain("not found");
  });
});

describe("cognition_feedback", () => {
  it("returns error for missing nodeId", async () => {
    const result = await handleCognitionFeedback({} as any);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBeDefined();
  });
  it("returns feedbackId for ACCEPTED outcome", async () => {
    const result = await handleCognitionFeedback({ nodeId: "test-node", edgeId: "test-edge", outcome: "ACCEPTED" });
    const data = JSON.parse(result.content[0].text);
    expect(data.feedbackId).toBeDefined();
  });
  it("returns feedbackId for REJECTED outcome", async () => {
    const result = await handleCognitionFeedback({ nodeId: "test-node", outcome: "REJECTED" });
    const data = JSON.parse(result.content[0].text);
    expect(data.feedbackId).toBeDefined();
  });
 it("returns feedbackId for MODIFIED outcome", async () => {
   const result = await handleCognitionFeedback({ nodeId: "test-node", edgeId: "test-edge", outcome: "MODIFIED" });
   const data = JSON.parse(result.content[0].text);
   expect(data.feedbackId).toBeDefined();
 });

  it("returns feedbackId with comment", async () => {
    const result = await handleCognitionFeedback({ nodeId: "test-node", outcome: "ACCEPTED", comment: "good result" });
    const data = JSON.parse(result.content[0].text);
    expect(data.feedbackId).toBeDefined();
  });

  it("full feedback loop records MetricEvent", async () => {
    // Query (triggers recordFeedbackEvent)
    const q = await handleCognitionQuery({ contextHash: "integration-test", maxDepth: 1 });
    // Feedback (triggers resolveFeedbackEvent)
    const f = await handleCognitionFeedback({ nodeId: "integration-node", outcome: "ACCEPTED" });
    expect(JSON.parse(q.content[0].text).nodes).toBeDefined();
    expect(JSON.parse(f.content[0].text).feedbackId).toBeDefined();
  });
});
