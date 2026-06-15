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

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "./client.js";

export interface DiffLogRecord {
  id: string;
  ruleId?: string; filePath: string; fileExtension: string;
  language: string; projectId?: string;
  originalHash: string; modifiedHash: string; diffContent: string;
  astStatus?: string; diffType: string; operations?: string;
  createdAt: Date;
}

function toRecord(r: Prisma.DiffLogGetPayload<{}>): DiffLogRecord {
  return {
    id: r.id, ruleId: r.ruleId ?? undefined,
    filePath: r.filePath, fileExtension: r.fileExtension,
    language: r.language, projectId: r.projectId ?? undefined,
    originalHash: r.originalHash, modifiedHash: r.modifiedHash,
    diffContent: r.diffContent, astStatus: r.astStatus ?? undefined,
    diffType: r.diffType, operations: r.operations ?? undefined,
    createdAt: r.createdAt,
  };
}

export class DiffLogRepo {
  async create(data: {
    filePath: string; fileExtension: string; language: string;
    projectId?: string; originalHash: string; modifiedHash: string;
    diffContent: string; astStatus?: string; diffType: string;
    operations?: string; ruleId?: string;
  }): Promise<DiffLogRecord> {
    const prisma = getPrismaClient();
    const r = await prisma.diffLog.create({ data });
    return toRecord(r);
  }

  async countByPattern(language: string, patternHash: string, sinceDays: number): Promise<number> {
    const prisma = getPrismaClient();
    const since = new Date(Date.now() - sinceDays * 86400000);
    return prisma.diffLog.count({
      where: { language, originalHash: patternHash, createdAt: { gte: since } },
    });
  }

  async countDistinctFiles(language: string, patternHash: string, sinceDays: number): Promise<number> {
    const prisma = getPrismaClient();
    const since = new Date(Date.now() - sinceDays * 86400000);
    const rows = await prisma.diffLog.findMany({
      where: { language, originalHash: patternHash, createdAt: { gte: since } },
      select: { filePath: true }, distinct: ["filePath"],
    });
    return rows.length;
  }
}
