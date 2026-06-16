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
 * @file Prompt Pipeline — DSPy 风格的 Few-Shot 自动编译
 *
 * 使用简单的 bag-of-words Jaccard 相似度对人工批准的示例进行排名，
 * 为给定的需求编译最优的 few-shot 示例集。
 * 示例存储在内存中（在引导期间来自 RuleVersion，无需数据库）。
 */

import type { RegoPolicyGenerated } from "./structured-generator.js";

// ── Types ──

export interface FewShotExample {
  requirement: string;
  regoPolicy: RegoPolicyGenerated;
  approvedBy: string;
  approvedAt: string;
  score: number;
}

export interface PipelineResult {
  prompt: string;
  fewShots: FewShotExample[];
  optimized: boolean;
}

// ── Prompt Pipeline ──

export class PromptPipeline {
  private examples: Array<{
    requirement: string;
    regoPolicy: RegoPolicyGenerated;
    approvedBy: string;
    approvedAt: string;
  }> = [];

  /**
   * Add a human-approved example to the pool.
   */
  addExample(
    requirement: string,
    policy: RegoPolicyGenerated,
    approvedBy: string,
  ): void {
    this.examples.push({
      requirement,
      regoPolicy: policy,
      approvedBy,
      approvedAt: new Date().toISOString(),
    });
  }

  /**
   * Compile the best few-shot examples for a given requirement.
   * Returns ranked examples and an assembled prompt.
   */
  compilePrompt(requirement: string, maxExamples?: number): PipelineResult {
    const maxN = maxExamples ?? 3;
    const ranked = this.rankExamples(requirement);
    const top = ranked.slice(0, maxN);
    const optimized = ranked.length > maxN;

    const prompt = this.assemblePrompt(requirement, top);

    return { prompt, fewShots: top, optimized };
  }

  /**
   * Simple bag-of-words Jaccard similarity for example ranking.
   */
  rankExamples(requirement: string): FewShotExample[] {
    const queryTokens = this.tokenize(requirement);

    const scored = this.examples.map((ex) => {
      const exampleTokens = this.tokenize(ex.requirement);
      const score = this.jaccardSimilarity(queryTokens, exampleTokens);
      return { ...ex, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  /**
   * Tokenize text into a bag of lowercase words.
   */
  private tokenize(text: string): Set<string> {
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9_\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1);
    return new Set(words);
  }

  /**
   * Jaccard similarity: |A ∩ B| / |A ∪ B|
   */
  private jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 0;
    const intersection = new Set([...a].filter((x) => b.has(x)));
    const union = new Set([...a, ...b]);
    return intersection.size / union.size;
  }

  /**
   * Assemble a prompt string from requirement and few-shot examples.
   */
  private assemblePrompt(
    requirement: string,
    fewShots: FewShotExample[],
  ): string {
    const lines: string[] = [
      "Generate a Rego policy for the following requirement:",
      `"${requirement}"`,
    ];

    if (fewShots.length > 0) {
      lines.push("");
      lines.push("Reference Examples:");
      lines.push("");

      for (let i = 0; i < fewShots.length; i++) {
        const ex = fewShots[i];
        lines.push(`### Example ${i + 1}: ${ex.regoPolicy.name}`);
        lines.push(`Requirement: ${ex.requirement}`);
        lines.push(`Policy (Rego):`);
        lines.push(ex.regoPolicy.rego);
        lines.push(`Explanation: ${ex.regoPolicy.humanExplanation}`);
        lines.push(`Approved by: ${ex.approvedBy}`);
        lines.push("");
      }
    }

    return lines.join("\n");
  }
}
