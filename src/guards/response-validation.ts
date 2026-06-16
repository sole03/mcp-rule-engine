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
 * @file Response Validation Middleware
 * Validates tools/call responses for Schema compliance.
 * Auto-adds validationRequired if missing, logs WARN.
 */
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, "../../logs");

export function validateToolResponse(toolName: string, response: { content: { type: string; text: string }[] }): { content: { type: string; text: string }[] } {
  try {
    for (const item of response.content) {
      if (item.type !== "text") continue;
      const data = JSON.parse(item.text);
      if ((toolName === "cognition_query" || toolName === "cognition_validate") && data.validationRequired === undefined) {
        data.validationRequired = true;
        item.text = JSON.stringify(data);
        logWarn("Auto-patched validationRequired for " + toolName);
      }
    }
  } catch { /* non-JSON content */ }
  return response;
}

function logWarn(msg: string): void {
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    writeFileSync(join(LOG_DIR, "validation-warnings.log"), "[" + new Date().toISOString() + "] WARN: " + msg + "\n", { flag: "a" });
  } catch { /* silent */ }
}
