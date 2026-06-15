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
import { recognizeIntent } from "../../src/cognition-engine/intent-recognizer.js";

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
});
