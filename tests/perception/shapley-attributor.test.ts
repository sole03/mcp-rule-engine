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
import { ShapleyAttributor } from "../../packages/core/src/perception/shapley-attributor.js";

// ── Helpers ──

const TS = "2026-06-15T10:00:00.000Z";

// ── Tests ──

describe("ShapleyAttributor", () => {
  describe("attribute()", () => {
    it("three dimensions: absolute contributions sum to 1.0", () => {
      const attr = new ShapleyAttributor();
      const result = attr.attribute(
        "cpu",
        { a: 12, b: 3, c: 8 },
        { a: 10, b: 5, c: 5 },
        TS,
      );
      expect(result.metric).toBe("cpu");
      expect(result.timestamp).toBe(TS);
      expect(result.dimensions).toHaveLength(3);

      const absSum = result.dimensions.reduce(
        (sum, d) => sum + Math.abs(d.contribution),
        0,
      );
      expect(absSum).toBeCloseTo(1.0, 5);

      // Sorted by absolute contribution (highest first)
      const first = result.dimensions[0];
      expect(Math.abs(first.contribution)).toBeGreaterThanOrEqual(
        Math.abs(result.dimensions[1].contribution),
      );
    });

    it("all zero baseline: contributions sum to 1.0", () => {
      const attr = new ShapleyAttributor();
      const result = attr.attribute(
        "mem",
        { a: 6, b: 4 },
        { a: 0, b: 0 },
        TS,
      );
      expect(result.dimensions).toHaveLength(2);
      const sum = result.dimensions.reduce(
        (s, d) => s + d.contribution,
        0,
      );
      expect(sum).toBeCloseTo(1.0, 5);
      // Both positive → contributions proportional to marginals
      expect(result.dimensions[0].contribution).toBeGreaterThan(0);
      expect(result.dimensions[1].contribution).toBeGreaterThan(0);
    });

    it("single dimension: contribution is 1.0", () => {
      const attr = new ShapleyAttributor();
      const result = attr.attribute(
        "disk",
        { a: 5 },
        { a: 3 },
        TS,
      );
      expect(result.dimensions).toHaveLength(1);
      expect(result.dimensions[0].contribution).toBeCloseTo(1.0, 5);
    });

    it("direction tags: HIGHER when above baseline, NEUTRAL when at baseline", () => {
      const attr = new ShapleyAttributor();
      const result = attr.attribute(
        "latency",
        { a: 15, b: 5 },
        { a: 10, b: 5 },
        TS,
      );

      const dimA = result.dimensions.find((d) => d.dimension === "a")!;
      const dimB = result.dimensions.find((d) => d.dimension === "b")!;

      expect(dimA.direction).toBe("HIGHER");
      expect(dimB.direction).toBe("NEUTRAL");
    });

    it("direction tag LOWER when below baseline", () => {
      const attr = new ShapleyAttributor();
      const result = attr.attribute(
        "errors",
        { a: 3 },
        { a: 10 },
        TS,
      );
      expect(result.dimensions[0].direction).toBe("LOWER");
      expect(result.dimensions[0].contribution).toBeLessThan(0);
    });

    it("returns sorted by absolute contribution descending", () => {
      const attr = new ShapleyAttributor();
      const result = attr.attribute(
        "mixed",
        { a: 100, b: 10, c: 50 },
        { a: 0, b: 0, c: 0 },
        TS,
      );
      const absContribs = result.dimensions.map((d) => Math.abs(d.contribution));
      for (let i = 0; i < absContribs.length - 1; i++) {
        expect(absContribs[i]).toBeGreaterThanOrEqual(absContribs[i + 1]);
      }
    });
  });
});
