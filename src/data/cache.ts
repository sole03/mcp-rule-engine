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
 * @file LRU Cache
 * Simple in-memory LRU cache with TTL support for graph traversal optimization.
 *
 * Cache strategies:
 *   - semanticHash → nodeIds (TTL: 5min)
 *   - nodeId → neighbors (TTL: 2min)
 *   - LRU capacity: 1000 entries
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class LRUCache<T> {
  private map = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private defaultTTLMs: number;

  constructor(maxSize = 1000, defaultTTLMs = 2 * 60 * 1000) {
    this.maxSize = maxSize;
    this.defaultTTLMs = defaultTTLMs;
  }

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    // Evict oldest if at capacity
    if (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }

    this.map.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTTLMs),
    });
  }

  delete(key: string): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }

  /** Prune all expired entries. Returns count of removed entries. */
  pruneExpired(): number {
    let removed = 0;
    const now = Date.now();
    for (const [key, entry] of this.map) {
      if (now > entry.expiresAt) {
        this.map.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /** Return stats for observability. */
  stats(): { size: number; maxSize: number; expired: number } {
    const expired = this.pruneExpired();
    return { size: this.map.size, maxSize: this.maxSize, expired };
  }
}
