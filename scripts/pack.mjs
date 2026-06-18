#!/usr/bin/env node
/**
 * Resilient npm pack wrapper.
 *
 * Falls back to 7z + zlib when npm's built-in tar module hits the
 * "encountered unexpected EOF" bug on certain Windows VM filesystems.
 * On real machines (CI, developer laptops) this just calls `npm pack` directly.
 *
 * Usage:
 *   node scripts/pack.mjs [--dry-run]
 */
import { execSync, spawnSync } from "child_process";
import { readFileSync, createReadStream, createWriteStream, rmSync, statSync, existsSync } from "fs";
import { join, resolve } from "path";
import { createGzip } from "zlib";
import { pipeline } from "stream/promises";

const ROOT = resolve(import.meta.dirname, "..");
const DRY_RUN = process.argv.includes("--dry-run");

function find7z() {
  try {
    return execSync("where 7z 2>nul", { encoding: "utf-8", stdio: "pipe" }).trim().split("\n")[0];
  } catch {
    return null;
  }
}

// ── Try npm pack first ───────────────────────────────────
try {
  const result = execSync(`npm pack --ignore-scripts ${DRY_RUN ? "--dry-run" : ""}`, {
    cwd: ROOT,
    encoding: "utf-8",
    stdio: "pipe",
    timeout: 60_000,
  });
  console.log(result.trim());
  process.exit(0);
} catch (err) {
  const stderr = err.stderr?.toString?.() ?? err.message ?? "";
  if (!/EOF|unexpected EOF/i.test(stderr)) {
    console.error(stderr);
    process.exit(1);
  }
  console.warn("[pack] npm pack EOF (VM bug) — falling back to 7z");
}

// ── Fallback: manual .tgz with 7z + zlib ─────────────────
const sevenZip = find7z();
if (!sevenZip) {
  console.error("[pack] 7z not found — cannot create package. Please run npm publish directly.");
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
const tarballName = `${pkg.name}-${pkg.version}.tgz`;
const tarPath = join(ROOT, tarballName.replace(/\.tgz$/, ".tar"));

// Build file list — use absolute paths for 7z, de-duplicating
const seen = new Set();
const entries = [];
for (const f of ["package.json", "README.md", "LICENSE", ".env.example"]) {
  const fp = join(ROOT, f);
  if (existsSync(fp) && !seen.has(fp)) {
    entries.push(fp);
    seen.add(fp);
  }
}
for (const pattern of (pkg.files || [])) {
  const fp = join(ROOT, pattern);
  if (existsSync(fp) && !seen.has(fp)) {
    entries.push(fp);
    seen.add(fp);
  }
}

if (DRY_RUN) {
  console.log(`Would create ${tarballName} via 7z fallback (${entries.length} entries)`);
  process.exit(0);
}

// Step 1: Create tar with 7z using spawnSync for proper argument passing
const args = ["a", "-ttar", tarPath, ...entries];
const result = spawnSync(sevenZip, args, {
  cwd: ROOT,
  stdio: "pipe",
  timeout: 60_000,
});

if (result.status !== 0) {
  const err = result.stderr?.toString() ?? "";
  console.error("[pack] 7z tar creation failed:", err.slice(0, 500));
  process.exit(1);
}

// Step 2: Gzip
const gzipPath = join(ROOT, tarballName);
try {
  await pipeline(
    createReadStream(tarPath),
    createGzip(),
    createWriteStream(gzipPath),
  );
  rmSync(tarPath, { force: true });
  const sizeKB = (statSync(gzipPath).size / 1024).toFixed(1);
  console.log(`${tarballName} (${sizeKB} KB)`);
} catch {
  console.error("[pack] gzip compression failed");
  process.exit(1);
}
