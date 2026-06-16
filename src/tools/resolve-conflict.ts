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

import type { IConflictRepository } from "../storage/repository-interfaces.js";
import type { IRuleRepository } from "../storage/repository-interfaces.js";
import type { IMetricRepository } from "../storage/repository-interfaces.js";
import { applyResolution } from "../conflict/arbitrator.js";
import { ResolveConflictInput } from "../types.js";

export async function handleResolveConflict(input: ResolveConflictInput, conflictRepo: IConflictRepository, ruleRepo: IRuleRepository, metricRepo: IMetricRepository) {
  const conflict = await conflictRepo.findById(input.conflictId);
  if (!conflict) return { content: [{ type: "text", text: JSON.stringify({ error: "Conflict not found" }) }], isError: true };
  const ruleA = await ruleRepo.findById(conflict.ruleAId);
  const ruleB = await ruleRepo.findById(conflict.ruleBId);
  if (!ruleA || !ruleB) return { content: [{ type: "text", text: JSON.stringify({ error: "Referenced rule not found" }) }], isError: true };
  const arbitration = applyResolution(ruleA, ruleB, input.resolution);
  await conflictRepo.resolve(input.conflictId, input.resolution);
  if (arbitration) await ruleRepo.create({ ...arbitration, projectId: ruleA.projectId });
  if (input.batchAllSession) await conflictRepo.setBatchChoice(input.conflictId, "session:" + input.resolution);
  await metricRepo.track("conflict_resolved", { conflictId: input.conflictId, resolution: input.resolution });
  await metricRepo.track("conflict_resolution_distribution", { resolution: input.resolution, conflictId: input.conflictId }).catch(() => {});
  return { content: [{ type: "text", text: JSON.stringify({ success: true, resolution: input.resolution, arbitrationCreated: !!arbitration }) }] };
}
