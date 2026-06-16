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

import { getPrismaClient } from "./client.js";

import type { IMetricRepository } from "./repository-interfaces.js";
export class MetricRepo implements IMetricRepository {
  async track(eventType: string, properties?: Record<string, unknown>): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.metricEvent.create({
      data: {
        eventType,
        properties: properties ? JSON.stringify(properties) : null,
      },
    });
  }

  async count(eventType: string, sinceMinutes?: number): Promise<number> {
    const prisma = getPrismaClient();
    const where: Record<string, unknown> = { eventType };
    if (sinceMinutes) {
      where.createdAt = { gte: new Date(Date.now() - sinceMinutes * 60000) };
    }
    return prisma.metricEvent.count({ where: where as any });
  }
}
