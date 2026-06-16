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
 * Integration test for property-tests module:
 * createRuleInvariants + checkProperty wired to real constraint runtime.
 */

import { describe, it, expect } from "vitest";
import { checkProperty, createRuleInvariants } from "../../packages/core/src/verification/property-tests.js";
import { evaluateContracts, topologicalSort } from "../../packages/core/src/constraints/runtime.js";
import { compileConstraints } from "../../packages/core/src/constraints/dsl-compiler.js";
import { ALL_TEMPLATES } from "../../packages/core/src/constraints/templates/index.js";

/**
 * Compile all DSL template strings into ParsedConstraint[].
 * Filter out contracts that use field.*.exists constraints —
 * the property test generators produce simplified flat nodes
 * without expression/returnType/comment fields, so contracts
 * requiring those fields would always fail spuriously.
 */
function compileCompatibleContracts(): any[] {
  const all: any[] = [];
  for (const tpl of ALL_TEMPLATES) {
    const parsed = compileConstraints(tpl);
    for (const p of parsed) {
      let hasExistsConstraint = false;
      for (const ast of p.constraints) {
        for (const fc of Object.values(ast.fields as Record<string, any>)) {
          if (fc.exists !== undefined) {
            hasExistsConstraint = true;
            break;
          }
        }
        if (hasExistsConstraint) break;
      }
      if (!hasExistsConstraint) {
        all.push(p);
      }
    }
  }
  return all;
}

describe("createRuleInvariants integration", () => {
  const contracts = compileCompatibleContracts();

  const invariants = createRuleInvariants({
    evaluateContracts,
    topologicalSort,
    contracts,
  });

  const CI_NUM_TESTS = 20;

  it("no-safe-op-blocked: whitespace patches never cause violations", async () => {
    const config = invariants.find(i => i.name === "no-safe-op-blocked")!;
    expect(config).toBeDefined();

    const result = await checkProperty({ ...config, numTests: CI_NUM_TESTS });

    expect(result.failed).toBe(0);
    expect(result.passed).toBe(CI_NUM_TESTS);
  }, 30000);

  it("merge-no-conflict: two different category rules don't conflict", async () => {
    const config = invariants.find(i => i.name === "merge-no-conflict")!;
    expect(config).toBeDefined();

    const result = await checkProperty({ ...config, numTests: CI_NUM_TESTS });

    expect(result.failed).toBe(0);
    expect(result.passed).toBe(CI_NUM_TESTS);
  });

  it("heal-monotonic: safe patch doesn't increase violation count", async () => {
    const config = invariants.find(i => i.name === "heal-monotonic")!;
    expect(config).toBeDefined();

    const result = await checkProperty({ ...config, numTests: CI_NUM_TESTS });

    expect(result.failed).toBe(0);
    expect(result.passed).toBe(CI_NUM_TESTS);
  }, 30000);

  it("all three invariants exist in createRuleInvariants output", () => {
    const names = invariants.map(i => i.name).sort();
    expect(names).toEqual(["heal-monotonic", "merge-no-conflict", "no-safe-op-blocked"]);
  });

  it("contracts were compiled from ALL_TEMPLATES", () => {
    expect(contracts.length).toBeGreaterThan(0);
  });
});
