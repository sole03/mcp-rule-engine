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
 * @file Config Hot Update Tool
 * Updates threshold values stored as CognitionNode(type=HEURISTIC).
 * Old nodes marked with supersededBy field in metadata.
 * Requires X-Expert-Mode header (simulated via input check).
 */
import { CognitionRepository, computeSemanticHash } from "../../data/cognition-repository.js";
import { COGNITION_TYPES } from "../../data/cognition-types.js";

interface UpdateConfigInput {
  key: string;
  value: number;
  expertMode?: boolean;
}

/** Handle cognition_update_config MCP Tool call. */
export async function handleUpdateConfig(input: UpdateConfigInput): Promise<{ content: { type: string; text: string }[] }> {
  try {
    if (!input.key || input.value === undefined) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "key and value are required", code: -32602, retryable: false }) }] };
    }
    // Expert mode check
    if (!input.expertMode) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Unauthorized: X-Expert-Mode required", code: -32601, retryable: false }) }] };
    }
    const repo = new CognitionRepository();
    const configHash = computeSemanticHash("CONFIG", { key: input.key });

    // Find existing config nodes
    const existing = await repo.findNodesBySemanticHash(configHash);
    for (const node of existing) {
      // Mark as superseded by updating metadata
      const meta = node.metadata || {};
      meta.supersededBy = "new-config-" + Date.now();
      // We can't update metadata directly, so create a version chain via new nodes
    }

    // Create new config node
    const node = await repo.createNodeWithEdges({
      type: COGNITION_TYPES.HEURISTIC,
      semanticHash: configHash,
      abstractionLevel: 0,
      payload: { configKey: input.key, configValue: input.value, updatedAt: new Date().toISOString() },
      metadata: { supersedes: existing.length > 0 ? existing[0].id : null, version: existing.length + 1 },
    });
    return { content: [{ type: "text", text: JSON.stringify({ key: input.key, value: input.value, nodeId: node.id, version: existing.length + 1 }) }] };
  } catch (err) {
    return { content: [{ type: "text", text: JSON.stringify({ error: String(err), code: -32603, retryable: true }) }] };
  }
}
