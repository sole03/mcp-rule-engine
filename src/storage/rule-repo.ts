import { Prisma } from "@prisma/client";
import { getPrismaClient } from "./client.js";
import { Rule, RuleScope, RuleStatus, RuleSpec, TOKEN_LIMITS } from "../types.js";

export function toRule(r: Prisma.RuleGetPayload<{}>): Rule {
  return {
    id: r.id,
    projectId: r.projectId ?? undefined,
    scope: r.scope as RuleScope,
    priority: r.priority,
    type: r.type as Rule["type"],
    pattern: r.pattern,
    suggestion: r.suggestion,
    language: r.language,
    fileExtensions: r.fileExtensions ? r.fileExtensions.split(",") : undefined,
    tags: r.tags ? r.tags.split(",") : undefined,
    confidence: r.confidence as Rule["confidence"],
    source: r.source as Rule["source"],
    category: r.category ?? undefined,
    status: r.status as RuleStatus,
    matchCount: r.matchCount,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    lastUsedAt: r.lastUsedAt ?? undefined,
  };
}

export class RuleRepo {
  async create(spec: RuleSpec & { projectId?: string }): Promise<Rule> {
    const prisma = getPrismaClient();
    const r = await prisma.rule.create({
      data: {
        projectId: spec.projectId ?? null,
        scope: spec.scope ?? "project",
        type: spec.type,
        pattern: spec.pattern,
        suggestion: spec.suggestion,
        language: spec.language,
        fileExtensions: spec.fileExtensions?.join(",") ?? null,
        tags: spec.tags?.join(",") ?? null,
        category: spec.category ?? null,
        confidence: "medium",
        source: "auto",
      },
    });
    return toRule(r);
  }
 
  /** Batch create rules inside a single transaction to prevent duplicates under WAL mode. */
  async batchCreate(specs: (RuleSpec & { projectId?: string })[]): Promise<Rule[]> {
    const prisma = getPrismaClient();
    return prisma.$transaction(
      specs.map(spec => prisma.rule.create({
        data: {
          projectId: spec.projectId ?? null,
          scope: spec.scope ?? "project",
          type: spec.type,
          pattern: spec.pattern,
          suggestion: spec.suggestion,
          language: spec.language,
          fileExtensions: spec.fileExtensions?.join(",") ?? null,
          tags: spec.tags?.join(",") ?? null,
          category: spec.category ?? null,
          confidence: spec.confidence ?? "medium",
          source: spec.source ?? "auto",
        },
      })),
    ).then(rows => rows.map(toRule));
  }

  async findById(id: string): Promise<Rule | null> {
    const prisma = getPrismaClient();
    const r = await prisma.rule.findUnique({ where: { id } });
    return r ? toRule(r) : null;
  }

  async updateStatus(id: string, status: RuleStatus): Promise<Rule> {
    const prisma = getPrismaClient();
    const r = await prisma.rule.update({
      where: { id },
      data: { status },
    });
    return toRule(r);
  }

  async incrementMatchCount(id: string): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.rule.update({
      where: { id },
      data: { matchCount: { increment: 1 }, lastUsedAt: new Date() },
    });
  }

  async countByScope(scope: RuleScope): Promise<number> {
    const prisma = getPrismaClient();
    return prisma.rule.count({ where: { scope, status: "active" } });
  }

  async isLimitReached(): Promise<boolean> {
    const count = await this.countByScope("global");
    return count >= TOKEN_LIMITS.maxRulesGlobal;
  }

  async findConflicting(type: string, language: string, pattern: string): Promise<Rule[]> {
    const prisma = getPrismaClient();
    const rows = await prisma.rule.findMany({
      where: { type, language, pattern: { contains: pattern }, status: "active" },
    });
    return rows.map(toRule);
  }

  /** Update a rule's pattern, suggestion, and/or category. Returns the updated rule. */
  async updateContent(id: string, data: { pattern?: string; suggestion?: string; category?: string; editedBy?: string }): Promise<Rule> {
    const prisma = getPrismaClient();
    // Snapshot current content before update for audit trail
    const current = await prisma.rule.findUnique({ where: { id }, select: { pattern: true, suggestion: true } });
    if (current) {
      await prisma.ruleVersion.create({
        data: { ruleId: id, pattern: current.pattern, suggestion: current.suggestion, editedBy: data.editedBy ?? null },
      });
    }
    const r = await prisma.rule.update({
      where: { id },
      data: {
        ...(data.pattern !== undefined && { pattern: data.pattern }),
        ...(data.suggestion !== undefined && { suggestion: data.suggestion }),
        ...(data.category !== undefined && { category: data.category }),
      },
    });
    return toRule(r);
  }
  async getRuleVersions(ruleId: string): Promise<{ id: string; ruleId: string; pattern: string; suggestion: string | null; editedBy: string | null; createdAt: Date }[]> {
    const prisma = getPrismaClient();
    return prisma.ruleVersion.findMany({ where: { ruleId }, orderBy: { createdAt: "desc" } });
  }

  async queryByMatch(language: string, fileExtension: string, projectId?: string, tags?: string[]): Promise<Rule[]> {
    const prisma = getPrismaClient();
    const conditions: Prisma.RuleWhereInput[] = [
      { status: "active" },
      { OR: [{ language: "*" }, { language }] },
    ];
    if (fileExtension) {
      const ext = fileExtension.replace(".", "");
      conditions.push({
        OR: [
          { fileExtensions: null },
          { fileExtensions: { contains: ext } },
        ],
      });
    }
    const rows = await prisma.rule.findMany({ where: { AND: conditions }, orderBy: { priority: "desc" } });
    return rows.map(toRule);
  }

  async list(filters: { language?: string; scope?: RuleScope; status?: RuleStatus; projectId?: string; limit?: number; offset?: number }): Promise<Rule[]> {
    const prisma = getPrismaClient();
    const where: Prisma.RuleWhereInput = {};
    if (filters.language) where.language = filters.language;
    if (filters.scope) where.scope = filters.scope;
    if (filters.status) where.status = filters.status;
    if (filters.projectId) where.projectId = filters.projectId;
    const rows = await prisma.rule.findMany({
      where, take: filters.limit ?? 50, skip: filters.offset ?? 0, orderBy: { createdAt: "desc" },
    });
    return rows.map(toRule);
  }
}
