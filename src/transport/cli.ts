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
 * @file CLI Entry Point
 * Handles database initialization with schema-aware push before starting
 * the MCP server. Runs prisma db push unconditionally to sync schema changes
 * (new tables, indexes) without data loss.
 *
 * Priority: COGNITION_DB_PATH env > DATABASE_URL env > ~/.cognition/dev.db
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve as resolvePath } from "node:path";

// ── Resolve database path ────────────────────────────────
// Respect DATABASE_URL if already set (e.g., from MCP config env)
// Otherwise use COGNITION_DB_PATH or the default home-directory path.

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
// Always push schema on startup. This is safe because prisma db push
// only adds missing tables/columns and never drops data.
// If DATABASE_URL was set externally (e.g., MCP config), it stays.

function syncSchema(): void {
  const prismaSchema = join(import.meta.dirname!, "..", "prisma", "schema.prisma");
  if (!existsSync(prismaSchema)) {
    console.error("Warning: prisma/schema.prisma not found — skipping schema sync");
    return;
  }

  const isProd = process.env.NODE_ENV === "production";
  const command = isProd
    ? "npx prisma migrate deploy"
    : "npx prisma db push --skip-generate";

  console.error("[mcp-cognition-engine] Syncing schema (" + (isProd ? "prod: migrate deploy" : "dev: db push") + ")...");
  try {
    execSync(command, {
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
      stdio: "pipe",
    });
    console.error("[mcp-cognition-engine] Schema sync complete");
  } catch (err) {
    const errMsg = String(err);
    console.error("[mcp-cognition-engine] Schema sync warning:", errMsg.slice(0, 200));
  }
}

// ── Prisma Client Generation ──────────────────────────────
// If postinstall was skipped (e.g. CI with --ignore-scripts),
// generate the Prisma client on first run.

function ensurePrismaClient(): void {
  try {
    const entry = resolvePath(import.meta.dirname!, "..", "node_modules", ".prisma", "client", "index.js");
    if (!existsSync(entry)) throw new Error("Prisma client not generated");
  } catch {
    console.error("[mcp-cognition-engine] Prisma client not found — running generate...");
    try {
      execSync("npx prisma generate", {
        cwd: resolvePath(import.meta.dirname!, ".."),
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
        stdio: "pipe",
      });
      console.error("[mcp-cognition-engine] Prisma client generated");
    } catch (err) {
      console.error("[mcp-cognition-engine] Failed to generate Prisma client:", String(err));
      process.exit(1);
    }
  }
}

// ── Main ──────────────────────────────────────────────────

// Only set if not already provided (e.g., by MCP env config)
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = resolveDbUrl();
}

ensurePrismaClient();
syncSchema();

// Import and run the server
import("./index.js").catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

