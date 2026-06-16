/**
 * Copyright 2026 熊高锐
 *
 * Licensed under the Apache License, Version 2.0
 */

/**
 * @file Embedding Service Adapter
 * Supports: DeepSeek, OpenAI (any OpenAI-compatible API), mock fallback.
 *
 * Configuration:
 *   EMBEDDING_PROVIDER = "deepseek" | "openai" | "mock"  (default: "deepseek")
 *   DEEPSEEK_API_KEY / OPENAI_API_KEY                     (env or constructor)
 *   EMBEDDING_BASE_URL                                     (override API endpoint)
 */

import type { IEmbeddingService, EmbeddingResult } from "./types.js";

type EmbeddingProvider = "deepseek" | "openai" | "mock";

interface EmbeddingConfig {
  provider?: EmbeddingProvider;
  apiKey?: string;
  model?: string;
  dimensions?: number;
  baseUrl?: string;
}

interface APIEmbedResponse {
  data: { embedding: number[]; index: number }[];
  model: string;
}

const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string; dimensions: number; envKey: string }> = {
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1/embeddings",
    model: "deepseek-chat",
    dimensions: 1024,
    envKey: "DEEPSEEK_API_KEY",
  },
  openai: {
    baseUrl: "https://api.openai.com/v1/embeddings",
    model: "text-embedding-3-small",
    dimensions: 512,
    envKey: "OPENAI_API_KEY",
  },
  mock: {
    baseUrl: "",
    model: "mock-fnv1a",
    dimensions: 512,
    envKey: "",
  },
};

export class EmbeddingService implements IEmbeddingService {
  private provider: EmbeddingProvider;
  private apiKey: string;
  private model: string;
  private dimensions: number;
  private baseUrl: string;

  constructor(opts?: EmbeddingConfig) {
    const provider = opts?.provider ??
      (process.env.EMBEDDING_PROVIDER as EmbeddingProvider) ??
      "deepseek";
    this.provider = provider;

    const defaults = PROVIDER_DEFAULTS[provider];
    this.apiKey = opts?.apiKey ??
      (defaults.envKey ? process.env[defaults.envKey] ?? "" : "");
    this.model = opts?.model ?? defaults.model;
    this.dimensions = opts?.dimensions ?? defaults.dimensions;
    this.baseUrl = opts?.baseUrl ?? defaults.baseUrl;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    if (this.provider === "mock" || !this.apiKey) {
      return texts.map((t) => this.mockEmbed(t));
    }

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + this.apiKey,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        dimensions: this.dimensions,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(
        this.provider + " Embedding API error " + response.status + ": " + err.slice(0, 200),
      );
    }

    const body = (await response.json()) as APIEmbedResponse;
    return body.data.map((d) => ({
      vector: d.embedding,
      dimensions: d.embedding.length,
      model: body.model,
    }));
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

  /** Deterministic mock embedding using FNV-1a hash. No API needed. */
  private mockEmbed(text: string): EmbeddingResult {
    const dim = this.dimensions;
    const vec: number[] = new Array(dim);
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
      h >>>= 0;
    }
    for (let i = 0; i < dim; i++) {
      h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
      h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
      h ^= h >>> 16;
      vec[i] = ((h >>> 0) % 1000) / 1000 - 0.5;
    }
    let norm = 0;
    for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < dim; i++) vec[i] /= norm;
    return { vector: vec, dimensions: dim, model: "mock-fnv1a" };
  }
}

/** Singleton. Reads EMBEDDING_PROVIDER and key from env. */
let defaultService: IEmbeddingService | null = null;

export function getEmbeddingService(): IEmbeddingService {
  if (!defaultService) {
    defaultService = new EmbeddingService();
  }
  return defaultService;
}

export function resetEmbeddingService(): void {
  defaultService = null;
}
