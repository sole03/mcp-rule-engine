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
 * @file CLI Adapter — 独立命令行入口
 *
 * 协议无关内核的 CLI 薄适配器。
 * 从 stdin 读取 JSON 请求，执行 CognitionCore，输出 JSON 到 stdout。
 *
 * 用法：
 *   echo '{"tool":"list_rules","input":{}}' | node dist/cli/cli.js
 *   npx tsx packages/core/src/cli/cli.ts < request.json
 *   npx tsx packages/core/src/cli/cli.ts audit src/packages/core/src src/packages/core/tests
 */

import { CognitionCore, createContainer } from "../index.js";

async function main() {
  const args = process.argv.slice(2);

  // ── audit 子命令 ──
  if (args[0] === "audit") {
    const srcRoot = args[1] ?? "./src";
    const testRoot = args[2] ?? "./tests";
    await runAudit(srcRoot, testRoot);
    return;
  }

  // ── 标准 stdin 模式 ──
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 1_000_000) break; // 1MB limit
  }

  if (!input.trim()) {
    process.stderr.write('Usage: echo ' + "'" + '{"tool":"...","input":{}}' + "'" + ' | cli' + "\n");
    process.stderr.write("Usage: cli audit [srcRoot] [testRoot]" + "\n");
    process.exit(1);
  }

  const { tool, input: toolInput } = JSON.parse(input);
  if (!tool) throw new Error("Missing 'tool' field");

  const core = new CognitionCore(createContainer());
  await core.start();

  const result = await core.execute({ tool, input: toolInput ?? {} });
  process.stdout.write(JSON.stringify(result));
  await core.shutdown();
}

/**
 * 执行 ROI 审计并输出 JSON 报告。
 */
async function runAudit(srcRoot: string, testRoot: string) {
  const { PrismaClient } = await import("@prisma/client");
  const { RoiAuditor } = await import("../audit/roi-auditor.js");
  const fs = await import("node:fs");
  const path = await import("node:path");

  const prisma = new PrismaClient();

  try {
    // 发现模块：扫描 srcRoot 下所有 .ts 文件
    const modulePaths = discoverModules(srcRoot);

    const auditor = new RoiAuditor(prisma, { srcRoot, testRoot });
    const report = await auditor.generateReport(modulePaths);

    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } finally {
    await prisma.$disconnect();
  }

  /**
   * 递归发现指定根目录下的所有 TypeScript 模块。
   * 排除 index.ts、types.ts 等枢纽文件。
   */
  function discoverModules(root: string): string[] {
    const modules: string[] = [];

    function walk(dir: string) {
      let entries: string[];
      try {
        entries = fs.readdirSync(dir);
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry);
        let stat;
        try { stat = fs.statSync(full); } catch { continue; }
        if (stat.isDirectory() && entry !== "node_modules" && entry !== "__tests__") {
          walk(full);
        } else if (stat.isFile() && entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
          const relPath = path.relative(root, full).replace(/\\/g, "/").replace(/\.ts$/, "");
          modules.push(relPath);
        }
      }
    }

    walk(root);
    return modules;
  }
}

main().catch((err) => {
  process.stderr.write("Error: " + err + "\n");
  process.exit(1);
});