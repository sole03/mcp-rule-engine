/**
 * @file Shadow Replay CLI — CI 影子日志回放脚本
 *
 * 从 ShadowLog 表读取数据，使用当前规则重放，
 * 输出 shadow-verification-results.json 供 GitHub Actions 消费。
 *
 * Usage: npx tsx scripts/shadow-replay.ts [--limit=100]
 */

import { PrismaClient } from "@prisma/client";
import { ShadowVerifier } from "../packages/core/src/verification/shadow-verifier.js";
import type { ShadowLogProvider } from "../packages/core/src/verification/shadow-verifier.js";
import * as fs from "fs";
import * as path from "path";

const limit = parseInt(process.argv.find(a => a.startsWith("--limit="))?.split("=")[1] ?? "100", 10);

class PrismaShadowLogProvider implements ShadowLogProvider {
  constructor(private prisma: PrismaClient) {}

  async getLogs(limit: number) {
    const logs = await this.prisma.shadowLog.findMany({
      orderBy: { matchedAt: "desc" },
      take: limit,
      select: { id: true, ruleId: true, filePath: true, wouldBlock: true },
    });
    return logs;
  }

  async getRuleById(id: string) {
    const rule = await this.prisma.rule.findUnique({
      where: { id },
      select: { id: true, pattern: true, status: true },
    });
    return rule;
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const provider = new PrismaShadowLogProvider(prisma);
    const verifier = new ShadowVerifier(provider);
    const results = await verifier.verify(limit);

    const outputPath = path.resolve("shadow-verification-results.json");
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`Shadow replay complete: ${results.totalCases} cases, ${results.passed} passed, ${results.newFalsePositives} new FPs`);
    console.log(`Results written to ${outputPath}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Shadow replay failed:", err);
  process.exit(1);
});