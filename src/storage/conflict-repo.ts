import { Prisma } from "@prisma/client";
import { getPrismaClient } from "./client.js";
import { ConflictResolution } from "../types.js";
import { RuleRepo } from "./rule-repo.js";

export interface ConflictRecord {
  id: string; ruleAId: string; ruleBId: string;
  scopeKey: string; resolution?: ConflictResolution;
  batchChoice?: string; resolvedAt?: Date; createdAt: Date;
}

export class ConflictRepo {
  constructor(private ruleRepo: RuleRepo) {}

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
