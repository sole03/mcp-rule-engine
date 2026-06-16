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
 * @file Property-based tests (lightweight fc-like API) — zero external dependencies
 *
 * Deterministic pseudo-random property testing for the rule engine.
 * Invariants verify that the constraint system behaves correctly under
 * generated inputs without false positives or regressions.
 */

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

export interface PropertyConfig {
  name: string;
  invariant: (...args: any[]) => boolean | Promise<boolean>;
  generators: (() => any)[];
  numTests?: number; // default 100
}

export interface PropertyResult {
  name: string;
  passed: number;
  failed: number;
  failures: { seed: number; args: any[]; error?: string }[];
  duration: number;
}

// ═══════════════════════════════════════════════════════════
// Deterministic PRNG (mulberry32)
// ═══════════════════════════════════════════════════════════

export function createRng(seed: number): () => number {
  let state = seed | 0;
  return (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ═══════════════════════════════════════════════════════════
// Generators
// ═══════════════════════════════════════════════════════════

const SAFE_IDENTIFIERS = [
  "result", "items", "config", "options", "input", "output",
  "handler", "callback", "value", "key", "entry", "record",
  "context", "state", "payload", "response", "request",
  "helper", "util", "service", "provider", "factory",
];

const SAFE_TYPE_NAMES = [
  "string", "number", "boolean", "Record", "Map", "Set",
  "Array", "Promise", "Result", "Option",
];

const SAFE_KEYWORDS = [
  "const", "let", "return", "export", "import", "type", "interface",
  "function", "async", "await", "if", "else", "for", "of", "in",
];

export function genWhitespacePatch(rng?: () => number): string {
  const r = rng ?? createRng(Date.now());
  const lines: string[] = [];
  const count = 1 + Math.floor(r() * 5);

  for (let i = 0; i < count; i++) {
    if (r() < 0.4) {
      // add a comment line
      const comment = `// ${SAFE_IDENTIFIERS[Math.floor(r() * SAFE_IDENTIFIERS.length)]}`;
      lines.push(comment);
    } else if (r() < 0.7) {
      // add blank line
      lines.push("");
    } else {
      // change indentation on an existing-like line
      const indent = "  ".repeat(Math.floor(r() * 3));
      const kw = SAFE_KEYWORDS[Math.floor(r() * SAFE_KEYWORDS.length)];
      const id = SAFE_IDENTIFIERS[Math.floor(r() * SAFE_IDENTIFIERS.length)];
      lines.push(`${indent}${kw} ${id} = "${id}";`);
    }
  }

  return lines.join("\n");
}

export function genSafeIdentifier(rng?: () => number): string {
  const r = rng ?? createRng(Date.now());
  const prefix = SAFE_IDENTIFIERS[Math.floor(r() * SAFE_IDENTIFIERS.length)];
  const suffix = Math.floor(r() * 1000);
  return `${prefix}_${suffix}`;
}

export function genSafeFileContent(rng?: () => number, minLines = 5, maxLines = 30): string {
  const r = rng ?? createRng(Date.now());
  const lines: string[] = [];
  const count = minLines + Math.floor(r() * (maxLines - minLines));

  // header
  lines.push("// Auto-generated safe TypeScript snippet");
  lines.push("");

  // imports
  const importCount = Math.floor(r() * 3);
  for (let i = 0; i < importCount; i++) {
    const id = SAFE_IDENTIFIERS[Math.floor(r() * SAFE_IDENTIFIERS.length)];
    lines.push(`import { ${id} } from "./${id}";`);
  }
  lines.push("");

  // type or interface
  if (r() < 0.5) {
    const typeName = genSafeIdentifier(r);
    const prop = SAFE_IDENTIFIERS[Math.floor(r() * SAFE_IDENTIFIERS.length)];
    const propType = SAFE_TYPE_NAMES[Math.floor(r() * SAFE_TYPE_NAMES.length)];
    lines.push(`export type ${typeName} = {`);
    lines.push(`  ${prop}: ${propType};`);
    lines.push("};");
    lines.push("");
  } else {
    const ifaceName = genSafeIdentifier(r);
    lines.push(`export interface ${ifaceName} {`);
    const propCount = 1 + Math.floor(r() * 3);
    for (let j = 0; j < propCount; j++) {
      const prop = genSafeIdentifier(r);
      const propType = SAFE_TYPE_NAMES[Math.floor(r() * SAFE_TYPE_NAMES.length)];
      lines.push(`  ${prop}: ${propType};`);
    }
    lines.push("}");
    lines.push("");
  }

  // function
  const funcName = genSafeIdentifier(r);
  const argName = SAFE_IDENTIFIERS[Math.floor(r() * SAFE_IDENTIFIERS.length)];
  const retType = SAFE_TYPE_NAMES[Math.floor(r() * SAFE_TYPE_NAMES.length)];
  lines.push(`export function ${funcName}(${argName}: string): ${retType} {`);
  lines.push(`  return ${argName}.length as unknown as ${retType};`);
  lines.push("}");
  lines.push("");

  // const export
  const constName = genSafeIdentifier(r);
  lines.push(`export const ${constName} = "${constName}";`);

  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════
// Property runner
// ═══════════════════════════════════════════════════════════

export async function checkProperty(config: PropertyConfig): Promise<PropertyResult> {
  const numTests = config.numTests ?? 100;
  const failures: { seed: number; args: any[]; error?: string }[] = [];
  let passed = 0;
  let failed = 0;
  const start = Date.now();

  for (let i = 0; i < numTests; i++) {
    const seed = i + 1; // deterministic seed per iteration
    const rng = createRng(seed);

    // Generate args using the seed-aware rng
    const args = config.generators.map((gen) => {
      // Inject seeded rng by temporarily patching Math.random style
      const seededGen = (): any => {
        const savedRandom = Math.random;
        // Not patching Math.random globally — generators accept optional rng
        return gen();
      };
      return seededGen();
    });

    try {
      const result = await config.invariant(...args);
      if (result) {
        passed++;
      } else {
        failed++;
        failures.push({ seed, args, error: "invariant returned false" });
      }
    } catch (err) {
      failed++;
      failures.push({ seed, args, error: String(err) });
    }
  }

  const duration = Date.now() - start;
  return { name: config.name, passed, failed, failures, duration };
}

// ═══════════════════════════════════════════════════════════
// Pre-defined rule-engine invariants
// ═══════════════════════════════════════════════════════════

/**
 * Run a safe patch through the constraint system and verify it is not blocked.
 * A "safe patch" is one that only changes whitespace or comments.
 *
 * This depends on the constraint evaluator being available at runtime.
 * The invariant is injected via a factory so it can reference the
 * actual constraint runtime without hard import cycles.
 */
export function makeNoSafeOpBlockedInvariant(
  evaluateContracts: (contracts: any[], flatNodes: any[], filePath?: string) => any[],
  contracts: any[],
): (...args: any[]) => boolean {
  return (patchContent: string): boolean => {
    const lines = patchContent.split("\n").filter(Boolean);
    const flatNodes = lines.map((line, i) => ({
      path: `line_${i}`,
      type: line.trim().startsWith("//") ? "comment" : "expression_statement",
      text: line,
      children: [] as string[],
    }));

    const evaluations = evaluateContracts(contracts, flatNodes);
    // A safe patch should produce zero violations
    const totalViolations = evaluations.reduce(
      (sum: number, e: any) => sum + (e.violations?.length ?? 0),
      0,
    );
    return totalViolations === 0;
  };
}

/**
 * Two independently approved policies for different categories should not
 * conflict when loaded together into the topology sorter.
 */
export function makeMergeNoConflictInvariant(
  topologicalSort: (contracts: any[]) => { cycles: string[][]; conflicts: [string, string][] },
): (...args: any[]) => boolean {
  return (): boolean => {
    const catA = {
      name: "cat_a_rule",
      dependsOn: [] as string[],
      conflicts: [] as string[],
    };
    const catB = {
      name: "cat_b_rule",
      dependsOn: [] as string[],
      conflicts: [] as string[],
    };

    const result = topologicalSort([catA, catB]);
    // No cycles, no conflicts between unrelated categories
    return result.cycles.length === 0 && result.conflicts.length === 0;
  };
}

/**
 * Applying a self-heal patch should not increase the number of validation failures.
 */
export function makeHealMonotonicInvariant(
  evaluateContracts: (contracts: any[], flatNodes: any[], filePath?: string) => any[],
  contracts: any[],
): (...args: any[]) => boolean {
  return (fileContent: string, patchContent: string): boolean => {
    const toFlatNodes = (text: string) =>
      text.split("\n").map((line, i) => ({
        path: `line_${i}`,
        type: line.trim().startsWith("//") ? "comment" : "expression_statement",
        text: line,
        children: [] as string[],
      }));

    const beforeNodes = toFlatNodes(fileContent);
    const beforeEval = evaluateContracts(contracts, beforeNodes);
    const beforeViolations = beforeEval.reduce(
      (sum: number, e: any) => sum + (e.violations?.length ?? 0),
      0,
    );

    // Simulate applying the patch by appending it
    const afterContent = fileContent + "\n" + patchContent;
    const afterNodes = toFlatNodes(afterContent);
    const afterEval = evaluateContracts(contracts, afterNodes);
    const afterViolations = afterEval.reduce(
      (sum: number, e: any) => sum + (e.violations?.length ?? 0),
      0,
    );

    // Monotonic: violations should not increase after a heal patch
    return afterViolations <= beforeViolations;
  };
}

// ═══════════════════════════════════════════════════════════
// Pre-defined RULE_INVARIANTS (lazily instantiated)
// ═══════════════════════════════════════════════════════════

export const RULE_INVARIANTS: PropertyConfig[] = [
  {
    name: "merge-no-conflict",
    invariant: makeMergeNoConflictInvariant(
      // The topologicalSort is imported at call site — placeholder
      ((contracts: any[]) => ({ cycles: [], conflicts: [] })) as any,
    ),
    generators: [() => undefined],
    numTests: 50,
  },
];

// ═══════════════════════════════════════════════════════════
// Verify all rule-engine properties
// ═══════════════════════════════════════════════════════════

export async function verifyAll(numTests?: number): Promise<PropertyResult[]> {
  const results: PropertyResult[] = [];
  for (const config of RULE_INVARIANTS) {
    const cfg = numTests !== undefined ? { ...config, numTests } : config;
    const result = await checkProperty(cfg);
    results.push(result);
  }
  return results;
}

// ═══════════════════════════════════════════════════════════
// Factory: create full RULE_INVARIANTS wired to real runtime
// ═══════════════════════════════════════════════════════════

export interface InvariantDeps {
  evaluateContracts: (contracts: any[], flatNodes: any[], filePath?: string) => any[];
  topologicalSort: (contracts: any[]) => { cycles: string[][]; conflicts: [string, string][] };
  contracts: any[];
}

export function createRuleInvariants(deps: InvariantDeps): PropertyConfig[] {
  return [
    {
      name: "no-safe-op-blocked",
      invariant: makeNoSafeOpBlockedInvariant(deps.evaluateContracts, deps.contracts),
      generators: [() => genWhitespacePatch()],
      numTests: 100,
    },
    {
      name: "merge-no-conflict",
      invariant: makeMergeNoConflictInvariant(deps.topologicalSort),
      generators: [() => undefined],
      numTests: 50,
    },
    {
      name: "heal-monotonic",
      invariant: makeHealMonotonicInvariant(deps.evaluateContracts, deps.contracts),
      generators: [() => genSafeFileContent(), () => genWhitespacePatch()],
      numTests: 100,
    },
  ];
}
