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
 * @file Dashboard Server — 认知负载仪表盘 HTTP API + 静态 HTML
 *
 * 轻量级 Node.js HTTP server，提供：
 * - GET  /            → Chart.js HTML 仪表盘
 * - GET  /api/snapshot → 完整 DashboardSnapshot JSON
 * - GET  /api/events?limit=50 → 最近审计事件
 * - GET  /api/alerts → 当前活跃告警
 * - GET  /api/health → 健康检查
 *
 * 用法：
 *   npx tsx packages/dashboard/src/server.ts
 *   → http://localhost:4000
 *
 * 依赖：需要 DATABASE_URL 指向可访问的 SQLite/Postgres 数据库。
 */

import { createServer } from "node:http";
import { PrismaClient } from "@prisma/client";
import { MetricsCollector, DEFAULT_ALERT_RULES } from "../../core/src/dashboard/metrics-collector.js";

const PORT = parseInt(process.env.DASHBOARD_PORT ?? "4000", 10);

// ── HTML Dashboard ──

const DASHBOARD_HTML = getDashboardHTML();

// ── Server ──

async function main() {
  const prisma = new PrismaClient();
  const collector = new MetricsCollector(prisma, DEFAULT_ALERT_RULES);

  const server = createServer(async (req, res) => {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url ?? "/";

    try {
      // ── API Routes ──
      if (url === "/api/snapshot" || url === "/api/snapshot/") {
        const snap = await collector.snapshot();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(snap, null, 2));
        return;
      }

      if (url === "/api/alerts" || url === "/api/alerts/") {
        const alerts = await collector.getAlerts();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(alerts, null, 2));
        return;
      }

      if (url === "/api/events" || url?.startsWith("/api/events?")) {
        const params = new URL(url, "http://localhost");
        const limit = parseInt(params.searchParams.get("limit") ?? "50", 10);
        const events = await collector.getEvents(limit);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(events, null, 2));
        return;
      }

      if (url === "/api/health" || url === "/api/health/") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
        return;
      }

      // ── Static HTML ──
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(DASHBOARD_HTML);
    } catch (err) {
      console.error("[dashboard] error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  server.listen(PORT, () => {
    console.error("[dashboard] Cognition Dashboard running at http://localhost:" + PORT);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.error("[dashboard] shutting down...");
    server.close();
    await prisma.();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[dashboard] fatal startup error:", err);
  process.exit(1);
});

// ── HTML Template ──

function getDashboardHTML(): string {
  return <!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cognition Dashboard — Agent Brain Monitor</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#0f1117;color:#e1e4e8;min-height:100vh}
.header{background:#161b22;border-bottom:1px solid #30363d;padding:16px 24px;display:flex;align-items:center;justify-content:space-between}
.header h1{font-size:20px;font-weight:600;color:#58a6ff}
.header .status{display:flex;gap:12px;align-items:center}
.status-dot{width:10px;height:10px;border-radius:50%}
.status-dot.ok{background:#3fb950;box-shadow:0 0 8px #3fb950}
.status-dot.warn{background:#d29922;box-shadow:0 0 8px #d29922}
.status-dot.crit{background:#f85149;box-shadow:0 0 8px #f85149;animation:pulse 1s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;padding:16px 24px}
.panel{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px}
.panel h2{font-size:14px;font-weight:600;color:#8b949e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px}
.panel .stat-row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px}
.panel .stat-row .label{color:#8b949e}
.panel .stat-row .value{color:#e1e4e8;font-weight:500}
.panel canvas{max-height:200px}
.timeline{grid-column:span 2;max-height:300px;overflow-y:auto}
.timeline .event{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;font-family:monospace;border-bottom:1px solid #21262d}
.timeline .event .time{color:#484f58;min-width:80px}
.timeline .event .type{padding:1px 5px;border-radius:3px;font-size:11px}
.type-amygdala{background:#f8514920;color:#f85149}
.type-self_heal{background:#3fb95020;color:#3fb950}
.type-arbitration{background:#a371f720;color:#a371f7}
.type-governance{background:#58a6ff20;color:#58a6ff}
.type-cognition{background:#d2992220;color:#d29922}
.type-default{background:#30363d;color:#8b949e}
.alerts-panel{grid-column:span 2;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px}
.alerts-panel h2{font-size:14px;font-weight:600;color:#f85149;text-transform:uppercase;margin-bottom:8px}
.alert-item{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:4px;margin-bottom:4px;font-size:13px}
.alert-CRITICAL{background:#f8514920;border-left:3px solid #f85149}
.alert-WARN{background:#d2992220;border-left:3px solid #d29922}
.alert-INFO{background:#58a6ff20;border-left:3px solid #58a6ff}
.refresh{color:#8b949e;font-size:12px}
.loading{display:flex;align-items:center;justify-content:center;height:200px;color:#8b949e}
</style>
</head>
<body>
<div class="header">
  <h1>🧠 Cognition Dashboard</h1>
  <div class="status">
    <span id="fatigueLabel" class="status-dot ok" title="Fatigue Level"></span>
    <span id="alertBadge" style="color:#8b949e;font-size:12px"></span>
    <span class="refresh" id="refreshTime">--</span>
  </div>
</div>

<div id="alertsContainer" class="alerts-panel" style="margin:0 24px"></div>

<div class="grid">
  <div class="panel" id="amygdalaPanel">
    <h2>⚡ Amygdala Intuition</h2>
    <div id="amygdalaStats"></div>
    <canvas id="amygdalaChart"></canvas>
  </div>
  <div class="panel" id="selfHealPanel">
    <h2>🔧 Self-Heal (Cerebellum)</h2>
    <div id="selfHealStats"></div>
    <canvas id="selfHealChart"></canvas>
  </div>
  <div class="panel" id="arbitrationPanel">
    <h2>⚖️ Arbitration (Prefrontal)</h2>
    <div id="arbitrationStats"></div>
    <canvas id="arbitrationChart"></canvas>
  </div>
  <div class="panel" id="cognitionPanel">
    <h2>🧩 Cognition Graph</h2>
    <div id="cognitionStats"></div>
    <canvas id="cognitionChart"></canvas>
  </div>
  <div class="timeline panel" id="timelinePanel">
    <h2>📜 Audit Timeline</h2>
    <div id="timeline"></div>
  </div>
</div>

<script>
let charts = {};

async function refresh() {
  try {
    const res = await fetch("/api/snapshot");
    const snap = await res.json();
    renderSnapshot(snap);
    document.getElementById("refreshTime").textContent = new Date().toLocaleTimeString();
  } catch(e) {
    console.error("Dashboard fetch error:", e);
  }
}

function renderSnapshot(snap) {
  renderAlerts(snap.alerts);
  renderAmygdala(snap.amygdala);
  renderSelfHeal(snap.selfHeal);
  renderArbitration(snap.arbitration);
  renderCognition(snap.cognition);
  updateStatus(snap);
  fetchTimeline();
}

function renderAlerts(alerts) {
  const container = document.getElementById("alertsContainer");
  if (!alerts || alerts.length === 0) {
    container.innerHTML = "";
    container.style.display = "none";
    return;
  }
  container.style.display = "block";
  container.innerHTML = "<h2>🔔 Active Alerts</h2>" +
    alerts.map(a => '<div class="alert-item alert-' + a.severity + '"><strong>[' + a.severity + ']</strong> ' + a.message + ' <span style="margin-left:auto;color:#8b949e">' + a.currentValue + '</span></div>').join("");
  document.getElementById("alertBadge").textContent = alerts.length + " alerts";
  document.getElementById("alertBadge").style.color = alerts.some(a=>a.severity==="CRITICAL") ? "#f85149" : "#d29922";
}

function renderAmygdala(a) {
  document.getElementById("amygdalaStats").innerHTML =
    '<div class="stat-row"><span class="label">24h Triggers</span><span class="value">' + a.triggeredCount24h + '</span></div>' +
    '<div class="stat-row"><span class="label">Avg Risk Score</span><span class="value">' + a.avgRiskScore.toFixed(2) + '</span></div>' +
    '<div class="stat-row"><span class="label">Fatigue Level</span><span class="value" style="color:' + (a.fatigueLevel==="CRITICAL"?"#f85149":a.fatigueLevel==="ELEVATED"?"#d29922":"#3fb950") + '">' + a.fatigueLevel + '</span></div>';
  const ctx = document.getElementById("amygdalaChart").getContext("2d");
  if (charts.amygdala) charts.amygdala.destroy();
  const triggers = a.recentTriggers || [];
  charts.amygdala = new Chart(ctx, {
    type: "line",
    data: {
      labels: triggers.map(t => new Date(t.timestamp).toLocaleTimeString()),
      datasets: [{ label:"Risk Score", data:triggers.map(t=>t.riskScore), borderColor:"#f85149", tension:.3, pointRadius:2 }]
    },
    options: { plugins:{legend:{display:false}}, scales:{x:{display:false},y:{min:0,max:1}} }
  });
}

function renderSelfHeal(s) {
  document.getElementById("selfHealStats").innerHTML =
    '<div class="stat-row"><span class="label">Attempts</span><span class="value">' + s.totalAttempts + '</span></div>' +
    '<div class="stat-row"><span class="label">Success Rate</span><span class="value">' + (s.successRate*100).toFixed(0) + '%</span></div>' +
    '<div class="stat-row"><span class="label">Revert Rate</span><span class="value" style="color:' + (s.revertRate>0.3?"#f85149":"#3fb950") + '">' + (s.revertRate*100).toFixed(0) + '%</span></div>' +
    '<div class="stat-row"><span class="label">Safety Valve</span><span class="value" style="color:' + (s.safetyValveTripped?"#f85149":"#3fb950") + '">' + (s.safetyValveTripped?"TRIPPED":"OK") + '</span></div>';
  const ctx = document.getElementById("selfHealChart").getContext("2d");
  if (charts.selfHeal) charts.selfHeal.destroy();
  charts.selfHeal = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Success","Reverted"],
      datasets: [{ data: [s.successRate*100, s.revertRate*100], backgroundColor:["#3fb950","#f85149"] }]
    },
    options: { plugins:{legend:{position:"bottom",labels:{font:{size:10},color:"#8b949e"}}} }
  });
}

function renderArbitration(a) {
  document.getElementById("arbitrationStats").innerHTML =
    '<div class="stat-row"><span class="label">Total Conflicts</span><span class="value">' + a.totalConflicts + '</span></div>' +
    '<div class="stat-row"><span class="label">Conflict Rate</span><span class="value">' + (a.conflictRate*100).toFixed(1) + '%</span></div>' +
    '<div class="stat-row"><span class="label">Auto-Resolve</span><span class="value">' + (a.autoResolveRate*100).toFixed(0) + '%</span></div>' +
    '<div class="stat-row"><span class="label">Appeals</span><span class="value">' + (a.appealRate*100).toFixed(1) + '%</span></div>';
  const ctx = document.getElementById("arbitrationChart").getContext("2d");
  if (charts.arbitration) charts.arbitration.destroy();
  charts.arbitration = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Auto","Manual"],
      datasets: [{ data: [a.autoResolveRate*100, a.humanRequiredRate*100], backgroundColor:["#3fb950","#d29922"] }]
    },
    options: { plugins:{legend:{display:false}}, scales:{y:{max:100}} }
  });
}

function renderCognition(c) {
  document.getElementById("cognitionStats").innerHTML =
    '<div class="stat-row"><span class="label">Nodes</span><span class="value">' + c.nodeCount + '</span></div>' +
    '<div class="stat-row"><span class="label">Edges</span><span class="value">' + c.edgeCount + '</span></div>' +
    '<div class="stat-row"><span class="label">Embedded</span><span class="value">' + (c.embeddedNodeRatio*100).toFixed(0) + '%</span></div>' +
    '<div class="stat-row"><span class="label">Avg Traversal</span><span class="value">' + c.avgTraversalMs + 'ms</span></div>';
  const ctx = document.getElementById("cognitionChart").getContext("2d");
  if (charts.cognition) charts.cognition.destroy();
  const intents = c.topIntentDistribution || [];
  charts.cognition = new Chart(ctx, {
    type: "bar",
    data: {
      labels: intents.map(i=>i.intent),
      datasets: [{ data:intents.map(i=>i.count), backgroundColor:["#58a6ff","#3fb950","#d29922","#a371f7","#f85149"] }]
    },
    options: { plugins:{legend:{display:false}} }
  });
}

function updateStatus(snap) {
  const dot = document.getElementById("fatigueLabel");
  dot.className = "status-dot " + (snap.amygdala.fatigueLevel === "CRITICAL" ? "crit" : snap.amygdala.fatigueLevel === "ELEVATED" ? "warn" : "ok");
  dot.title = "Fatigue: " + snap.amygdala.fatigueLevel;
}

async function fetchTimeline() {
  try {
    const res = await fetch("/api/events?limit=30");
    const events = await res.json();
    const container = document.getElementById("timeline");
    container.innerHTML = events.map(e => {
      const cat = e.eventType.split(".")[0].split("_")[0];
      const cls = "type-" + (["amygdala","self_heal","conflict","appeal","immune","policy","cognition"].includes(cat) ? cat : "default").replace("conflict","arbitration").replace("appeal","arbitration").replace("immune","governance").replace("policy","governance");
      const time = new Date(e.createdAt).toLocaleTimeString();
      const props = e.properties ? JSON.stringify(e.properties).slice(0,60) : "";
      return '<div class="event"><span class="time">' + time + '</span><span class="type ' + cls + '">' + e.eventType + '</span><span style="color:#8b949e;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + props + '</span></div>';
    }).join("");
  } catch(e) {}
}

refresh();
setInterval(refresh, 10000);
</script>
</body>
</html>;
}
