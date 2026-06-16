/**
 * Copyright 2026 熊高锐
 *
 * Licensed under the Apache License, Version 2.0
 */

/**
 * @file Embedding Service Interface
 * Pluggable embedding backend. Implementations: OpenAI, local ONNX, mock.
 */

export interface EmbeddingResult {
  vector: number[];
  dimensions: number;
  model: string;
}

export interface IEmbeddingService {
  /** Embed a single text string. */
  embed(text: string): Promise<EmbeddingResult>;

  /** Embed multiple texts in batch. */
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;

  /** Cosine similarity between two vectors. Range: [-1, 1] */
  similarity(a: number[], b: number[]): number;
}
