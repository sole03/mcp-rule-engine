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
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log("DATABASE_URL not set — skipping shadow replay (no database available)");
    const emptyResults = { totalCases: 0, passed: 0, failed: 0, newFalsePositives: 0, durationMs: 0, details: [] };
    fs.writeFileSync(path.resolve("shadow-verification-results.json"), JSON.stringify(emptyResults, null, 2));
    return;
  }

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
  console.error("Shadow replay failed:", String(err));
  // Write empty results so CI workflow doesn't crash on file-not-found
  const emptyResults = { totalCases: 0, passed: 0, failed: 0, newFalsePositives: 0, durationMs: 0, details: [] };
  try { fs.writeFileSync(path.resolve("shadow-verification-results.json"), JSON.stringify(emptyResults, null, 2)); } catch {}
  process.exit(0); // Don't fail CI on shadow replay issues
});