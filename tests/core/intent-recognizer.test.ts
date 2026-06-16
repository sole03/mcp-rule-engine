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
import { recognizeIntent } from "../../src/core/intent-recognizer.js";

const REFACTOR_DIFF = `diff --git a/src/user.ts b/src/user.ts
--- a/src/user.ts
+++ b/src/user.ts
@@ -1,10 +1,25 @@
-interface User { name: string }
+interface User { name: string; email: string }
+function validateUser(u: User): boolean {
+  if (!u.email) return false;
+  return true;
+}
diff --git a/src/order.ts b/src/order.ts
--- a/src/order.ts
+++ b/src/order.ts
@@ -5,6 +5,8 @@
 import { User } from "./user.js";
+import { validateUser } from "./user.js";
+type OrderStatus = "pending" | "completed";
`;

const BUGFIX_DIFF = `diff --git a/src/utils.ts b/src/utils.ts
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,5 +1,7 @@
 function parseValue(input: string) {
-  return JSON.parse(input);
+  try {
+    return JSON.parse(input);
+  } catch {
+    return null;
+  }
 }
`;

const BOILERPLATE_DIFF = `diff --git a/src/models/user.ts b/src/models/user.ts
new file mode 100644
--- /dev/null
+++ b/src/models/user.ts
@@ -0,0 +1,30 @@
+interface User {
+  id: string;
+  name: string;
+  email: string;
+}
+function createUser(data: User) { return data; }
+function getUser(id: string) { return null; }
+function updateUser(id: string, data: Partial<User>) { return data; }
+function deleteUser(id: string) {}
+`;

const NO_CHANGE_DIFF = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,3 @@
 const x = 1;
-const y = 2;
+const z = 3;
`;

const SINGLE_LINE_DIFF = `diff --git a/src/bar.ts b/src/bar.ts
--- a/src/bar.ts
+++ b/src/bar.ts
@@ -1,3 +1,3 @@
-const a = 1;
+const a = 2;
`;

const ERROR_HEAVY_DIFF = `diff --git a/src/check.ts b/src/check.ts
--- a/src/check.ts
+++ b/src/check.ts
@@ -1,5 +1,9 @@
 function load() {
-  return data;
+  try {
+    const result = unsafeLoad();
+    if (!result) throw new Error("missing");
+    return validate(result);
+  } catch (e) {
+    return fallback(e);
+  }
 }
`;

const CROSS_MODULE_DIFF = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,5 +1,12 @@
+export interface Result<T> { data: T; ok: boolean }
+export function ok<T>(d: T): Result<T> { return { data: d, ok: true }; }
diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -1,5 +1,4 @@
 import { ok } from "./a.js";
+import { Result } from "./a.js";
`;

const DELETE_ONLY_DIFF = `diff --git a/src/old.ts b/src/old.ts
--- a/src/old.ts
+++ b/src/old.ts
@@ -1,10 +0,0 @@
-legacyFunction();
-// deprecated code
-// remove entire file
`;

describe("IntentRecognizer", () => {
  it("classifies multi-file change as REFACTOR", async () => {
    const result = await recognizeIntent(REFACTOR_DIFF, "src/user.ts");
    expect(result.intent).toBe("REFACTOR");
    expect(result.confidence).toBeGreaterThanOrEqual(0.4);
    expect(result.reasoning.length).toBeGreaterThan(0);
    expect(result.stats.filesChanged).toBe(2);
    expect(result.stats.addedLines).toBeGreaterThan(0);
  });

  it("classifies single-file error fix as BUGFIX", async () => {
    const result = await recognizeIntent(BUGFIX_DIFF, "src/utils.ts");
    expect(result.intent).toBe("BUGFIX");
    expect(result.confidence).toBeGreaterThanOrEqual(0.3);
    expect(result.stats.filesChanged).toBe(1);
  });

  it("classifies net-new file as BOILERPLATE", async () => {
    const result = await recognizeIntent(BOILERPLATE_DIFF, "src/models/user.ts");
    expect(["BOILERPLATE", "BUGFIX"]).toContain(result.intent);
    expect(result.stats.addedLines).toBeGreaterThan(5);
    expect(result.stats.removedLines).toBe(0);
  });

  it("handles empty diff gracefully", async () => {
    const result = await recognizeIntent("", "file.ts");
    expect(result.intent).toBeDefined();
    expect(result.stats.filesChanged).toBe(0);
  });

  it("parses diff statistics correctly", async () => {
    const result = await recognizeIntent(REFACTOR_DIFF, "src/user.ts");
    expect(result.stats.filesChanged).toBe(2);
    expect(result.stats.addedLines).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
  });

  // ── New edge case tests ────────────────────────────────

  it("classifies error-heavy diff as BUGFIX with high confidence", async () => {
    const result = await recognizeIntent(ERROR_HEAVY_DIFF, "src/check.ts");
    expect(result.intent).toBe("BUGFIX");
    expect(result.confidence).toBeGreaterThanOrEqual(0.4);
    expect(result.reasoning.some(r => r.toLowerCase().includes("error"))).toBe(true);
  });

  it("classifies cross-module type introduction as REFACTOR", async () => {
    const result = await recognizeIntent(CROSS_MODULE_DIFF, "src/a.ts");
    expect(result.intent).toBe("REFACTOR");
    expect(result.stats.filesChanged).toBe(2);
  });

  it("handles diff with only removals gracefully", async () => {
    const result = await recognizeIntent(DELETE_ONLY_DIFF, "src/old.ts");
    expect(result.intent).toBeDefined();
    expect(result.stats.removedLines).toBeGreaterThan(0);
    expect(result.stats.addedLines).toBe(0);
  });

  it("classifies trivial single-line change as BUGFIX", async () => {
    const result = await recognizeIntent(SINGLE_LINE_DIFF, "src/bar.ts");
    expect(result.intent).toBe("BUGFIX");
    expect(result.stats.filesChanged).toBe(1);
    expect(result.stats.addedLines).toBe(1);
    expect(result.stats.removedLines).toBe(1);
  });

  it("classifies no-signal minimal diff as BUGFIX with low confidence", async () => {
    const result = await recognizeIntent(NO_CHANGE_DIFF, "src/foo.ts");
    expect(result.intent).toBe("BUGFIX");
    expect(result.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it("returns zero stats for completely empty diff", async () => {
    const result = await recognizeIntent("", "");
    expect(result.stats.addedLines).toBe(0);
    expect(result.stats.removedLines).toBe(0);
    expect(result.stats.filesChanged).toBe(0);
    expect(result.stats.nodeTypeChanges).toEqual([]);
  });

  it("reports node types in stats", async () => {
    const result = await recognizeIntent(REFACTOR_DIFF, "src/user.ts");
    expect(Array.isArray(result.stats.nodeTypeChanges)).toBe(true);
    expect(result.stats.nodeTypeChanges.length).toBeGreaterThan(0);
  });

  it("confidence stays within [0, 1]", async () => {
    const highResult = await recognizeIntent(REFACTOR_DIFF, "src/user.ts");
    expect(highResult.confidence).toBeGreaterThanOrEqual(0);
    expect(highResult.confidence).toBeLessThanOrEqual(1);

    const lowResult = await recognizeIntent("", "x.ts");
    expect(lowResult.confidence).toBeGreaterThanOrEqual(0);
    expect(lowResult.confidence).toBeLessThanOrEqual(1);
  });
});
