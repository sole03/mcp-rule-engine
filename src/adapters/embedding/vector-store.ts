/**
 * Copyright 2026 熊高锐
 *
 * Licensed under the Apache License, Version 2.0
 */

/**
 * @file Vector Store — SQLite-backed
 * Stores embedding vectors as JSON arrays in CognitionNode.embedding column
 * and provides cosine-similarity nearest-neighbor search.
 *
 * No pgvector dependency — works with existing SQLite schema.
 * For >10K nodes, add HNSW index or switch to pgvector.
 */

import { getPrismaClient } from "../../data/client.js";
import { getEmbeddingService } from "./openai-adapter.js";
import type { CognitionNodeData } from "../../data/cognition-types.js";

function parseJsonField<T>(val: string | null | undefined): T | null {
  if (!val) return null;
  try { return JSON.parse(val) as T; } catch { return null; }
}

export interface VectorSearchResult {
  node: CognitionNodeData;
  score: number; // cosine similarity [0, 1]
}

export class VectorStore {
  /**
   * Generate and store embedding for a single cognition node.
   * Reads node.payload, generates embedding, stores in node metadata.
   */
  async embedNode(nodeId: string, textToEmbed: string): Promise<number[] | null> {
    const prisma = getPrismaClient();
    const service = getEmbeddingService();

    try {
      const result = await service.embed(textToEmbed);

      // Store vector as JSON string in metadata.embedding field
      const node = await prisma.cognitionNode.findUnique({
        where: { id: nodeId },
        select: { metadata: true },
      });
      if (!node) return null;

      const meta = parseJsonField<Record<string, unknown>>(node.metadata) ?? {};
      meta.embedding = result.vector;
      meta.embeddingModel = result.model;
      meta.embeddingDimensions = result.dimensions;

      await prisma.cognitionNode.update({
        where: { id: nodeId },
        data: { metadata: JSON.stringify(meta) },
      });

      return result.vector;
    } catch (err) {
      // Silently skip — embedding is best-effort
      return null;
    }
  }

  /**
   * Batch-embed nodes that don't yet have an embedding.
   * Returns count of nodes newly embedded.
   */
  async embedUnembeddedNodes(batchSize = 20): Promise<number> {
    const prisma = getPrismaClient();
    const service = getEmbeddingService();

    // Find nodes without embeddings. SQLite can't do `metadata NOT LIKE '%embedding%'`
    // reliably, so fetch all and filter in memory.
    const allNodes = await prisma.cognitionNode.findMany({
      select: { id: true, payload: true, metadata: true },
      take: 500,
    });

    const unembedded = allNodes.filter((n) => {
      const meta = parseJsonField<Record<string, unknown>>(n.metadata);
      return !meta?.embedding;
    });

    let count = 0;
    for (let i = 0; i < unembedded.length; i += batchSize) {
      const batch = unembedded.slice(i, i + batchSize);
      const texts: string[] = batch.map((n: any) => {
        const payload = parseJsonField<Record<string, unknown>>(n.payload);
        return String(payload?.suggestion ?? payload?.pattern ?? JSON.stringify(payload));
      });

      try {
        const results = await service.embedBatch(texts);

        for (let j = 0; j < batch.length; j++) {
          const node = batch[j];
          const result = results[j];
          if (!result) continue;

          const meta = parseJsonField<Record<string, unknown>>(node.metadata) ?? {};
          meta.embedding = result.vector;
          meta.embeddingModel = result.model;
          meta.embeddingDimensions = result.dimensions;

          await prisma.cognitionNode.update({
            where: { id: node.id },
            data: { metadata: JSON.stringify(meta) },
          });
          count++;
        }
      } catch {
        // Best effort
      }
    }

    return count;
  }

  /**
   * Search for nearest neighbors by cosine similarity.
   *
   * Strategy: load all nodes with embeddings into memory, compute similarity
   * in JS, return top-K. OK for <10K nodes. For larger scale, add HNSW/IVF.
   */
  async searchSimilar(
    queryText: string,
    topK = 10,
    minScore = 0.3,
  ): Promise<VectorSearchResult[]> {
    const prisma = getPrismaClient();
    const service = getEmbeddingService();

    // 1. Embed the query
    const queryResult = await service.embed(queryText);

    // 2. Load all nodes with embeddings
    const allNodes = await prisma.cognitionNode.findMany({
      select: {
        id: true,
        type: true,
        semanticHash: true,
        abstractionLevel: true,
        payload: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
      take: 500,
    });

    // 3. Filter to nodes with embeddings, compute similarity
    const scored: VectorSearchResult[] = [];

    for (const row of allNodes) {
      const meta = parseJsonField<Record<string, unknown>>(row.metadata);
      const embedding = meta?.embedding as number[] | undefined;
      if (!embedding || !Array.isArray(embedding)) continue;

      const score = service.similarity(queryResult.vector, embedding);
      if (score >= minScore) {
        scored.push({
          node: {
            id: row.id,
            type: row.type as any,
            semanticHash: row.semanticHash,
            abstractionLevel: row.abstractionLevel,
            payload: parseJsonField(row.payload) ?? {},
            metadata: meta,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            astTemplate: null,
          },
          score: Math.round(score * 10000) / 10000,
        });
      }
    }

    // 4. Sort by score descending, return top-K
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }
}

/** Singleton. */
let defaultStore: VectorStore | null = null;
export function getVectorStore(): VectorStore {
  if (!defaultStore) defaultStore = new VectorStore();
  return defaultStore;
}
