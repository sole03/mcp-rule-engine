import D from "better-sqlite3";
import { execSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync } from "fs";
import { randomUUID } from "crypto";

let dbPath = "D:/Desktop/mcp/prisma/data/rules.db";
let tmpMode = false;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--db" && i + 1 < process.argv.length) {
    dbPath = process.argv[i + 1];
    tmpMode = dbPath === ":memory:";
    break;
  }
}

if (tmpMode) {
  dbPath = join(tmpdir(), "mcp-e2e-" + Date.now() + ".db");
  execSync("npx prisma db push --skip-generate", {
    cwd: "D:/Desktop/mcp",
    env: { ...process.env, DATABASE_URL: "file:" + dbPath },
    stdio: "pipe",
  });
  const d = new D(dbPath);
  const now = new Date().toISOString();
  for (const s of [
    {sc:"project",tp:"replace",pa:"console.log",su:"console.error",la:"typescript",ex:null,ta:"debug,logging"},
    {sc:"project",tp:"replace",pa:"oldApi",su:"newApi",la:"typescript",ex:".ts",ta:"api"},
    {sc:"global",tp:"convention",pa:"TODO:",su:"FIXME:",la:"javascript",ex:null,ta:null},
    {sc:"user",tp:"replace",pa:"var ",su:"const ",la:"javascript",ex:".js",ta:"style"},
  ]) {
    d.prepare("INSERT INTO Rule (id,scope,type,pattern,suggestion,language,fileExtensions,tags,confidence,source,status,createdAt) VALUES(?,?,?,?,?,?,?,?,'high','auto','active',?)").run(randomUUID(),s.sc,s.tp,s.pa,s.su,s.la,s.ex,s.ta,now);
  }
  const vt = d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='RuleVersion'").get(); r.fixes.versionAudit = { pass: vt !== undefined, val: vt ? vt.name : null }; d.close();
}

const d = new D(dbPath);
let ec = 0;
const r = { fixes: {}, meta: { ec: 0, ts: new Date().toISOString(), db: dbPath } };
try {
  const t = d.prepare("SELECT COUNT(*) as c FROM Rule").get();
  r.fixes.rulesExist = { pass: t.c > 0, val: t.c };
  const m = d.prepare("SELECT COUNT(*) as c FROM Rule WHERE status='active' AND (language='*' OR language='typescript') AND (fileExtensions IS NULL OR fileExtensions LIKE '%ts%')").get();
  r.fixes.queryByMatch = { pass: m.c > 0, val: m.c };
  const s = d.prepare("SELECT scope, COUNT(*) as c FROM Rule GROUP BY scope").all();
  r.fixes.scopeDist = { pass: s.length > 0, val: s };
  d.close();
  if (tmpMode) {
    try { unlinkSync(dbPath); unlinkSync(dbPath + "-wal"); unlinkSync(dbPath + "-shm"); } catch {}
  }
} catch(e) {
  try { d.close(); } catch {}
  r.meta.err = e.message; ec = 1;
}
r.meta.ec = ec;
console.log(JSON.stringify(r, null, 2));
process.exit(ec);

