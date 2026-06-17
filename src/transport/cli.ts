#!/usr/bin/env node
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
 * @file CLI Entry Point (Resilient)
 *
 * Starts the MCP server with graceful degradation:
 * - Schema sync is best-effort — server starts even if it fails
 * - Prisma client auto-generate only when truly missing
 * - EPERM/EACCES errors are non-fatal (sandbox tolerance)
 * - All execSync calls have timeouts
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve as resolvePath } from "node:path";

// ── Helpers ──────────────────────────────────────────────

function warn(msg: string) { console.error("[governflow] " + msg); }

function execSafe(cmd: string, opts: { cwd?: string; timeoutMs?: number } = {}): { ok: boolean; output: string } {
  try {
    const result = execSync(cmd, {
      cwd: opts.cwd,
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
      stdio: "pipe",
      timeout: opts.timeoutMs ?? 15_000,
    });
    return { ok: true, output: result.toString("utf-8").trim() };
  } catch (err: any) {
    const msg = err.stderr?.toString("utf-8")?.trim() ?? err.message ?? String(err);
    return { ok: false, output: msg.slice(0, 300) };
  }
}

function isPermissionError(msg: string): boolean {
  return /EPERM|EACCES|permission denied/i.test(msg);
}

function isTransientError(msg: string): boolean {
  return /timeout|ECONNREFUSED|ENOTFOUND|network|ETIMEDOUT|database is locked/i.test(msg);
}

// ── Project root ─────────────────────────────────────────
const rootDir = resolvePath(import.meta.dirname!, "..", "..");

// ── Resolve database path ────────────────────────────────
function resolveDbUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const dbPath = process.env.COGNITION_DB_PATH ?? join(homedir(), ".cognition", "dev.db");
  const dir = dbPath.replace(/[/\\][^/\\]+$/, "");
  if (!existsSync(dir)) {
    try { mkdirSync(dir, { recursive: true }); } catch { /* ok */ }
  }
  return "file:" + dbPath;
}

// ── Schema Sync ──────────────────────────────────────────
function syncSchema(): void {
  const prismaSchema = join(rootDir, "prisma", "schema.prisma");
  if (!existsSync(prismaSchema)) {
    warn("prisma/schema.prisma not found — skipping schema sync");
    return;
  }

  const isProd = process.env.NODE_ENV === "production";
  const command = isProd
    ? "npx prisma migrate deploy"
    : "npx prisma db push --skip-generate";

  warn("Syncing schema (" + (isProd ? "migrate deploy" : "db push") + ")...");

  const maxRetries = 2;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = execSafe(command, { cwd: rootDir, timeoutMs: 20_000 });
    if (result.ok) {
      warn("Schema sync complete");
      return;
    }
    if (isPermissionError(result.output)) {
      warn("Schema sync skipped (sandbox)");
      return;
    }
    if (attempt < maxRetries && isTransientError(result.output)) {
      warn("Schema sync transient error, retry " + attempt + "/" + maxRetries + ": " + result.output);
      // simple backoff
      Atomics?.wait?.(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000 * attempt);
      continue;
    }
    warn("Schema sync warning: " + result.output);
    return; // non-fatal, continue to start server
  }
}

// ── Prisma Client Check ──────────────────────────────────
function ensurePrismaClient(): void {
  const entry = join(rootDir, "node_modules", ".prisma", "client", "index.js");
  if (existsSync(entry)) return;

  warn("Prisma client not found — running generate...");
  const result = execSafe("npx prisma generate", { cwd: rootDir, timeoutMs: 30_000 });
  if (result.ok) {
    warn("Prisma client generated");
    return;
  }
  if (isPermissionError(result.output)) {
    warn("Skipping prisma generate (sandbox) — ensure pre-generated");
    return;
  }
  // NOT fatal — the import will throw its own error if truly missing
  warn("Prisma generate warning: " + result.output);
}

// ── Main ─────────────────────────────────────────────────

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = resolveDbUrl();
}

ensurePrismaClient();
syncSchema();

// Start the MCP server — this is the only truly fatal failure
import("./index.js").catch((err) => {
  console.error("[governflow] Fatal: cannot start server:", String(err).slice(0, 300));
  process.exit(1);
});
