/**
 * Copyright 2026 熊高锐
 *
 * Licensed under the Apache License, Version 2.0
 */

/**
 * @file Local Embedding Adapter
 * Uses @xenova/transformers (ONNX runtime, no GPU needed) to produce
 * semantic embeddings locally. No API key or network required.
 *
 * Model: Xenova/all-MiniLM-L6-v2 (384 dimensions, ~80MB download)
 * First call downloads the model, subsequent calls are instant.
 */

import type { IEmbeddingService, EmbeddingResult } from "./types.js";
import { pipeline } from "@xenova/transformers";
import type { FeatureExtractionPipeline } from "@xenova/transformers";

let extractor: FeatureExtractionPipeline | null = null;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractor) {
    extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2") as FeatureExtractionPipeline;
  }
  return extractor;
}

/** Average-pool token embeddings into a single vector. */
function meanPool(tensor: any, attentionMask?: any): number[] {
  const dim = tensor.dims[1];
  const seqLen = tensor.dims[0];
  const vec = new Array(dim).fill(0);
  for (let i = 0; i < seqLen; i++) {
    const w = attentionMask ? attentionMask.data[i] : 1;
    for (let j = 0; j < dim; j++) {
      vec[j] += tensor.data[i * dim + j] * w;
    }
  }
  const weightSum = attentionMask
    ? attentionMask.data.reduce((a: number, b: number) => a + b, 0)
    : seqLen;
  for (let j = 0; j < dim; j++) vec[j] /= weightSum;

  // L2 normalize
  let norm = 0;
  for (let j = 0; j < dim; j++) norm += vec[j] * vec[j];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let j = 0; j < dim; j++) vec[j] /= norm;

  return vec;
}

export class LocalEmbeddingService implements IEmbeddingService {
  private dimensions = 384;
  private model = "Xenova/all-MiniLM-L6-v2";

  async embed(text: string): Promise<EmbeddingResult> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const extractor = await getExtractor();

    const results: EmbeddingResult[] = [];
    for (const text of texts) {
      const output = await extractor(text, { pooling: "mean", normalize: true });
      const vec = Array.from(output.data as Float32Array);
      results.push({
        vector: vec,
        dimensions: vec.length,
        model: this.model,
      });
    }

    return results;
  }

  similarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error("Vector dimension mismatch: " + a.length + " vs " + b.length);
    }
    let dot = 0, norma = 0, normb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      norma += a[i] * a[i];
      normb += b[i] * b[i];
    }
    if (norma === 0 || normb === 0) return 0;
    return dot / (Math.sqrt(norma) * Math.sqrt(normb));
  }
}
