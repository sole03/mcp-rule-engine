/**
 * Vitest setup: gives each vitest worker its own SQLite database file.
 * This prevents cross-worker race conditions on cognition tables
 * (the root cause of intermittent FK failures).
 */
import { execSync } from "child_process";
import { unlinkSync, existsSync } from "fs";

const workerId: string =
  process.env.VITEST_WORKER_ID ??
  process.env.VITEST_POOL_ID ??
  "0";

const dbName = `dev-${workerId}.db`;
// Prisma resolves file: relative paths from the prisma/ directory.
const dbDir = "prisma";
const dbPath = `${dbDir}/${dbName}`;
process.env.DATABASE_URL = `file:${dbName}`;

// Delete any stale database from a previous run to guarantee clean state.
// Wal-mode checkpointer files must also be removed.
for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, `${dbPath}-journal`]) {
  if (existsSync(f)) {
    try { unlinkSync(f); } catch { /* best effort */ }
  }
}

// Push the Prisma schema to the worker-specific database (creates tables).
execSync("npx prisma db push --skip-generate", {
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
  stdio: "ignore",
});
