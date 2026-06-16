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
 * Phase 3.2 Human Veto Protocol Handlers
 *
 * Tools: governance_pause_arbitrator, governance_rollback_arbitration
 */

import { getPrismaClient } from "../../data/client.js";
import { logger } from "../../telemetry/logger.js";

// ── Pause state (mirrors ConstraintArbitrator static in packages/core) ──
// These are kept in sync at the MCP handler level since src/ cannot
// directly import from packages/core/ (separate rootDir).
let _pausedUntil: number = 0;

export function isArbitratorPaused(): boolean {
  return Date.now() < _pausedUntil;
}

export function getPausedUntil(): number {
  return _pausedUntil;
}

export async function handlePauseArbitrator(input: {
  minutes: number;
}): Promise<{ content: { type: string; text: string }[] }> {
  try {
    const minutes = Math.max(1, Math.min(input.minutes, 1440)); // clamp 1 min – 24 hr
    _pausedUntil = Date.now() + minutes * 60_000;
    const until = new Date(_pausedUntil).toISOString();
    logger.info({ minutes, pausedUntil: until }, "arbitrator paused");

    // Record metric event
    const prisma = getPrismaClient();
    await prisma.metricEvent.create({
      data: {
        eventType: "arbitrator_paused",
        properties: JSON.stringify({ minutes, pausedUntil: until }),
      },
    });

    return { content: [{ type: "text", text: JSON.stringify({ paused: true, minutes, pausedUntil: until }) }] };
  } catch (e) {
    return { content: [{ type: "text", text: JSON.stringify({ error: String(e), code: -32603, retryable: true }) }] };
  }
}

export async function handleRollbackArbitration(input: {
  since: string;
}): Promise<{ content: { type: string; text: string }[] }> {
  try {
    const since = new Date(input.since);
    if (isNaN(since.getTime())) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Invalid ISO datetime for since", code: -32602, retryable: false }) }] };
    }

    const prisma = getPrismaClient();

    // Find all conflict records: resolution starts with AUTO_ + resolvedAt >= since
    const autoResolved = await prisma.conflictRecord.findMany({
      where: {
        resolution: { startsWith: "AUTO_" },
        resolvedAt: { gte: since },
      },
    });

    if (autoResolved.length === 0) {
      return { content: [{ type: "text", text: JSON.stringify({ rolledBack: 0, message: "No auto-resolved conflicts found in the window" }) }] };
    }

    // Rollback: set resolution to null, resolvedAt to null
    const ids = autoResolved.map(r => r.id);
    await prisma.conflictRecord.updateMany({
      where: { id: { in: ids } },
      data: {
        resolution: null,
        resolvedAt: null,
      },
    });

    // Record a MetricEvent for each rollback
    for (const record of autoResolved) {
      await prisma.metricEvent.create({
        data: {
          eventType: "arbitration_rolled_back",
          properties: JSON.stringify({
            conflictId: record.id,
            previousResolution: record.resolution,
            resolvedAt: record.resolvedAt?.toISOString(),
            rolledBackAt: new Date().toISOString(),
            since: since.toISOString(),
          }),
        },
      });
    }

    logger.info({ count: autoResolved.length, since: since.toISOString() }, "arbitration rolled back");

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          rolledBack: autoResolved.length,
          conflictIds: ids,
          since: since.toISOString(),
        }),
      }],
    };
  } catch (e) {
    return { content: [{ type: "text", text: JSON.stringify({ error: String(e), code: -32603, retryable: true }) }] };
  }
}
