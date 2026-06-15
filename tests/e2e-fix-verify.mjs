import D from "better-sqlite3";

let ec = 0;
const r = { fixes: {}, meta: { ec: 0, ts: new Date().toISOString() } };
try {
  const d = new D("D:/Desktop/mcp/prisma/data/rules.db");
  const t = d.prepare("SELECT COUNT(*) as c FROM Rule").get();
  r.fixes.rulesExist = { pass: t.c > 0, val: t.c };
  const m = d.prepare("SELECT COUNT(*) as c FROM Rule WHERE status='active' AND (language='*' OR language='typescript') AND (fileExtensions IS NULL OR fileExtensions LIKE '%ts%')").get();
  r.fixes.queryByMatch = { pass: m.c > 0, val: m.c };
  const s = d.prepare("SELECT scope, COUNT(*) as c FROM Rule GROUP BY scope").all();
  r.fixes.scopeDist = { pass: s.length > 0, val: s };
  d.close();
} catch(e) { r.meta.err = e.message; ec = 1; }
r.meta.ec = ec;
console.log(JSON.stringify(r, null, 2));
process.exit(ec);