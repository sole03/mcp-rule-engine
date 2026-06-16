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
import { ConflictResolution } from "../types.js";
import type { IRuleRepository } from "./repository-interfaces.js";

export interface ConflictRecord {
  id: string; ruleAId: string; ruleBId: string;
  scopeKey: string; resolution?: ConflictResolution;
  batchChoice?: string; resolvedAt?: Date; createdAt: Date;
}

import type { IConflictRepository } from "./repository-interfaces.js";
export class ConflictRepo implements IConflictRepository {
  constructor(private ruleRepo: IRuleRepository) {}

  async findById(id: string): Promise<ConflictRecord | null> {
    const prisma = getPrismaClient();
    const r = await prisma.conflictRecord.findUnique({ where: { id } });
    if (!r) return null;
    return {
      id: r.id, ruleAId: r.ruleAId, ruleBId: r.ruleBId,
      scopeKey: r.scopeKey, resolution: r.resolution as ConflictResolution | undefined,
      batchChoice: r.batchChoice ?? undefined, resolvedAt: r.resolvedAt ?? undefined,
      createdAt: r.createdAt,
    };
  }

  async findExisting(ruleAId: string, ruleBId: string): Promise<ConflictRecord | null> {
    const prisma = getPrismaClient();
    const r = await prisma.conflictRecord.findFirst({
      where: { OR: [{ ruleAId, ruleBId }, { ruleAId: ruleBId, ruleBId: ruleAId }] },
      orderBy: { createdAt: "desc" },
    });
    if (!r) return null;
    return {
      id: r.id, ruleAId: r.ruleAId, ruleBId: r.ruleBId,
      scopeKey: r.scopeKey, resolution: r.resolution as ConflictResolution | undefined,
      batchChoice: r.batchChoice ?? undefined, resolvedAt: r.resolvedAt ?? undefined,
      createdAt: r.createdAt,
    };
  }

  async create(data: { ruleAId: string; ruleBId: string; scopeKey: string }): Promise<ConflictRecord> {
    const prisma = getPrismaClient();
    const r = await prisma.conflictRecord.create({ data });
    return { id: r.id, ruleAId: r.ruleAId, ruleBId: r.ruleBId, scopeKey: r.scopeKey, createdAt: r.createdAt };
  }

  async resolve(id: string, resolution: ConflictResolution): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.conflictRecord.update({
      where: { id }, data: { resolution, resolvedAt: new Date() },
    });
  }

  async setBatchChoice(id: string, choice: string): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.conflictRecord.update({
      where: { id }, data: { batchChoice: choice },
    });
  }
}

