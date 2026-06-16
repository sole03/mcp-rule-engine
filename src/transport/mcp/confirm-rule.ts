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

import type { IRuleRepository } from "../../data/repository-interfaces.js";
import type { IMetricRepository } from "../../data/repository-interfaces.js";
import { ConfirmRuleInput } from "../../core/types.js";

export async function handleConfirmRule(input: ConfirmRuleInput, ruleRepo: IRuleRepository, metricRepo: IMetricRepository) {
  const rule = await ruleRepo.findById(input.ruleId);
  if (!rule) return { content: [{ type: "text", text: JSON.stringify({ error: "Rule not found" }) }], isError: true };
  switch (input.action) {
    case "accept": await ruleRepo.updateStatus(input.ruleId, "active"); break;
    case "reject": await ruleRepo.updateStatus(input.ruleId, "archived"); break;
    case "edit": {
      // Persist the edited pattern and/or suggestion
      const updated = await ruleRepo.updateContent(input.ruleId, {
        pattern: input.editedPattern,
        suggestion: input.editedSuggestion,
      });
      // Read back and verify the update was actually persisted
      const verified = await ruleRepo.findById(input.ruleId);
      if (input.editedPattern !== undefined && verified?.pattern !== input.editedPattern) {
        return {
          content: [{ type: "text", text: JSON.stringify({
            error: "Edit verification failed: pattern was not persisted",
            ruleId: input.ruleId,
            expectedPattern: input.editedPattern,
            actualPattern: verified?.pattern,
          }) }],
          isError: true,
        };
      }
      if (input.editedSuggestion !== undefined && verified?.suggestion !== input.editedSuggestion) {
        return {
          content: [{ type: "text", text: JSON.stringify({
            error: "Edit verification failed: suggestion was not persisted",
            ruleId: input.ruleId,
            expectedSuggestion: input.editedSuggestion,
            actualSuggestion: verified?.suggestion,
          }) }],
          isError: true,
        };
      }
      break;
    }
    case "skip": break;
  }
  await metricRepo.track("rule_confirmed", { ruleId: input.ruleId, action: input.action });
  return { content: [{ type: "text", text: JSON.stringify({ success: true, ruleId: input.ruleId, action: input.action }) }] };
}
