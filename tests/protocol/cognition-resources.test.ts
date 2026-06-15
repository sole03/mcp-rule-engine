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
 * @file Protocol compliance tests for MCP resources and schemas.
 */
import { describe, it, expect } from "vitest";
import { RESOURCES, readCognitionSchema, readCognitionStats, readCognitionDocs } from "../../src/resources/cognition-resources.js";

describe("Resource Definitions", () => {
 it("exposes 3 resources with cognition:// URIs", () => {
    expect(RESOURCES.length).toBeGreaterThanOrEqual(3);
    for (const r of RESOURCES) {
      expect(r.uri).toMatch(/^cognition:\/\//);
    }
  });

  it("resources have proper descriptions and mime types", () => {
    const schema = RESOURCES.find(r => r.uri === "cognition://schema");
    expect(schema).toBeDefined();
    expect(schema?.mimeType).toBe("application/json");

    const docs = RESOURCES.find(r => r.uri === "cognition://docs");
    expect(docs).toBeDefined();
    expect(docs?.mimeType).toBe("text/markdown");
  });
});

describe("readCognitionSchema", () => {
  it("returns valid JSON schema", async () => {
    const result = await readCognitionSchema();
    const parsed = JSON.parse(result);
    expect(parsed.title).toBe("CognitionGraph");
    expect(parsed.properties).toBeDefined();
    expect(parsed.properties.CognitionNode).toBeDefined();
  });
});

describe("readCognitionStats", () => {
  it("returns stats with expected fields", async () => {
    const result = await readCognitionStats();
    const parsed = JSON.parse(result);
    expect(typeof parsed.nodeCount).toBe("number");
    expect(typeof parsed.edgeCount).toBe("number");
    expect(typeof parsed.feedbackCount).toBe("number");
    expect(parsed.timestamp).toBeDefined();
  });
});

describe("readCognitionDocs", () => {
  it("returns markdown content", async () => {
    const result = await readCognitionDocs();
    expect(result.length).toBeGreaterThan(100);
    expect(result).toContain("cognition_query");
  });
});
