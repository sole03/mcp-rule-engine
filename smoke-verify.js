const D = require("better-sqlite3");
const d = new D("D:/Desktop/mcp/prisma/data/rules.db");
try {
  console.log("=== Event Distribution ===");
  console.table(d.prepare("SELECT eventType, COUNT(*) as cnt FROM MetricEvent GROUP BY eventType").all());
  console.log("=== Source Tag Verification ===");
  console.table(d.prepare("SELECT json_extract(properties,'$.source') as src, COUNT(*) as cnt FROM MetricEvent WHERE eventType='tool_call_count' GROUP BY src").all());
  console.log("=== Token Budget Utilization ===");
  console.table(d.prepare("SELECT json_extract(properties,'$.taskId') as task_id, json_extract(properties,'$.utilizedTokens') as tokens, json_extract(properties,'$.budgetPercent') || '"'"'%'"'"' as pct FROM MetricEvent WHERE eventType='"'"'token_budget_utilization_rate'"'"' ORDER BY rowid DESC LIMIT 5").all());
  console.log("=== Resolution Distribution ===");
  console.table(d.prepare("SELECT json_extract(properties,'$.resolution') as resolution, COUNT(*) as cnt FROM MetricEvent WHERE eventType='conflict_resolution_distribution' GROUP BY resolution").all());
  console.log("✅ Verification complete");
} catch (e) {
  console.error("❌ DB query failed:", e.message);
  process.exit(1);
} finally { d.close(); }
