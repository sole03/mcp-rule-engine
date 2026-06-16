/**
 * Seed Script: Populate Rule Engine with Best Practices from External Sources
 *
 * Sources:
 *   - Airbnb JavaScript Style Guide
 *   - Node.js Best Practices (goldbergyoni)
 *   - JavaScript Algorithms (trekhleb)
 *
 * Each rule becomes:
 *   1. A Rule row (for legacy query_rules tool)
 *   2. A CognitionNode (PATTERN type) for the cognition graph
 */

const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");

const DB_URL = process.env.DATABASE_URL || "file:./prisma/dev.db";
const p = new PrismaClient({ datasources: { db: { url: DB_URL } } });

function cuid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function simpleHash(s) {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

const RULES = [
  // ── Airbnb JavaScript ──────────────────────────────────
  { type: "replace", pattern: "var ", suggestion: "const ", language: "javascript", tags: "style,airbnb", confidence: "high", category: "variables", scope: "project" },
  { type: "replace", pattern: "var ", suggestion: "let ", language: "typescript", tags: "style,airbnb", confidence: "high", category: "variables", scope: "project" },
  { type: "replace", pattern: "new Array(", suggestion: "[]", language: "javascript", tags: "style,airbnb", confidence: "high", category: "arrays", scope: "project" },
  { type: "replace", pattern: "new Object(", suggestion: "{}", language: "javascript", tags: "style,airbnb", confidence: "high", category: "objects", scope: "project" },
  { type: "replace", pattern: "== null", suggestion: "=== null", language: "javascript", tags: "style,airbnb", confidence: "high", category: "comparison", scope: "project" },
  { type: "replace", pattern: "== undefined", suggestion: "=== undefined", language: "javascript", tags: "style,airbnb", confidence: "high", category: "comparison", scope: "project" },
  { type: "replace", pattern: "console.log(", suggestion: "logger.info(", language: "typescript", tags: "logging,bestpractice", confidence: "medium", category: "logging", scope: "project" },
  { type: "replace", pattern: "Object.assign(", suggestion: "{ ...obj }", language: "javascript", tags: "style,airbnb", confidence: "medium", category: "objects", scope: "project" },
  { type: "replace", pattern: "for (let i = 0; i < arr.length; i++)", suggestion: "arr.forEach(", language: "javascript", tags: "style,airbnb", confidence: "medium", category: "iteration", scope: "project" },
  { type: "replace", pattern: "function(", suggestion: "const fn = () =>", language: "javascript", tags: "style,airbnb", confidence: "medium", category: "functions", scope: "project" },
  { type: "replace", pattern: ".then(", suggestion: "await ", language: "javascript", tags: "async,airbnb", confidence: "high", category: "async", scope: "project" },
  { type: "replace", pattern: "eval(", suggestion: "// avoid eval — use JSON.parse or Function constructor", language: "javascript", tags: "security,airbnb", confidence: "high", category: "security", scope: "project" },

  // ── Node.js Best Practices ─────────────────────────────
  { type: "replace", pattern: "process.exit(1)", suggestion: "// Graceful shutdown: server.close() then process.exit()", language: "typescript", tags: "bestpractice,node", confidence: "high", category: "error-handling", scope: "project" },
  { type: "replace", pattern: "throw new Error(", suggestion: "throw new AppError(", language: "typescript", tags: "bestpractice,node", confidence: "medium", category: "error-handling", scope: "project" },
  { type: "replace", pattern: "new Promise(", suggestion: "// Use async/await instead of Promise constructor", language: "javascript", tags: "async,bestpractice", confidence: "medium", category: "async", scope: "project" },
  { type: "replace", pattern: "require(", suggestion: "import ", language: "typescript", tags: "modules,bestpractice", confidence: "medium", category: "modules", scope: "project" },
  { type: "replace", pattern: "try {", suggestion: "// Centralized error handling: wrap with error boundary", language: "typescript", tags: "bestpractice,node", confidence: "low", category: "error-handling", scope: "project" },
  { type: "replace", pattern: "process.env.", suggestion: "config.get(", language: "typescript", tags: "config,bestpractice", confidence: "medium", category: "config", scope: "project" },
  { type: "replace", pattern: "any", suggestion: "unknown", language: "typescript", tags: "typescript,bestpractice", confidence: "high", category: "types", scope: "project" },
  { type: "replace", pattern: "as ", suggestion: "// Prefer type guards over type assertions", language: "typescript", tags: "typescript,bestpractice", confidence: "medium", category: "types", scope: "project" },

  // ── Security ───────────────────────────────────────────
  { type: "replace", pattern: "innerHTML =", suggestion: "textContent =", language: "javascript", tags: "security,xss", confidence: "high", category: "security", scope: "project" },
  { type: "replace", pattern: "http://", suggestion: "https://", language: "javascript", tags: "security", confidence: "medium", category: "security", scope: "project" },
  { type: "replace", pattern: "password", suggestion: "// Use bcrypt/scrypt for password hashing", language: "typescript", tags: "security", confidence: "high", category: "security", scope: "project" },
  { type: "replace", pattern: "Math.random(", suggestion: "crypto.randomBytes(", language: "javascript", tags: "security", confidence: "high", category: "security", scope: "project" },
  { type: "replace", pattern: "exec(", suggestion: "execFile(", language: "javascript", tags: "security,injection", confidence: "high", category: "security", scope: "project" },

  // ── TypeScript-Specific ────────────────────────────────
  { type: "replace", pattern: "interface I", suggestion: "interface ", language: "typescript", tags: "style,typescript", confidence: "low", category: "naming", scope: "project" },
  { type: "replace", pattern: "export default", suggestion: "export ", language: "typescript", tags: "modules", confidence: "low", category: "modules", scope: "project" },
  { type: "replace", pattern: "enum ", suggestion: "// Consider const object or union type instead of enum", language: "typescript", tags: "typescript", confidence: "low", category: "types", scope: "project" },

  // ── Performance ────────────────────────────────────────
  { type: "replace", pattern: ".forEach(async", suggestion: "// forEach with async is a bug — use for...of", language: "javascript", tags: "async,bug", confidence: "high", category: "bugs", scope: "project" },
  { type: "replace", pattern: "JSON.parse(JSON.stringify(", suggestion: "structuredClone(", language: "javascript", tags: "performance", confidence: "medium", category: "performance", scope: "project" },
  { type: "replace", pattern: "delete obj.", suggestion: "// Prefer obj.key = undefined over delete", language: "javascript", tags: "performance", confidence: "low", category: "performance", scope: "project" },

  // ── Testing ────────────────────────────────────────────
  { type: "replace", pattern: "describe(", suggestion: "describe(", language: "typescript", tags: "testing", confidence: "low", category: "testing", scope: "project" },
  { type: "replace", pattern: ".only(", suggestion: "// Remove .only before committing", language: "typescript", tags: "testing,bug", confidence: "high", category: "testing", scope: "project" },
  { type: "replace", pattern: "setTimeout(", suggestion: "// Use vi.useFakeTimers() in tests", language: "typescript", tags: "testing", confidence: "medium", category: "testing", scope: "project" },

  // ── File Management ────────────────────────────────────
  { type: "replace", pattern: "todo", suggestion: "TODO: ", language: "typescript", tags: "style", confidence: "low", category: "comments", scope: "project" },
  { type: "replace", pattern: "fixme", suggestion: "FIXME: ", language: "typescript", tags: "style", confidence: "low", category: "comments", scope: "project" },
];

async function seed() {
  console.log("Seeding", RULES.length, "rules...");

  let ruleCount = 0, nodeCount = 0;

  for (const r of RULES) {
    // 1. Insert into Rule table (skip if duplicate pattern)
    try {
      const existing = await p.rule.findFirst({
        where: { pattern: r.pattern, language: r.language },
      });
      if (!existing) {
        await p.rule.create({
          data: {
            id: cuid(),
            type: r.type,
            pattern: r.pattern,
            suggestion: r.suggestion,
            language: r.language,
            tags: r.tags,
            confidence: r.confidence,
            category: r.category,
            scope: r.scope,
            status: "active",
          },
        });
        ruleCount++;
      }
    } catch (e) {
      // duplicate; skip
    }

    // 2. Insert into CognitionNode (for graph traversal)
    try {
      const hash = simpleHash("PATTERN:" + r.language + ":" + r.pattern);
      const existingNode = await p.cognitionNode.findUnique({
        where: { semanticHash: hash },
      });
      if (!existingNode) {
        await p.cognitionNode.create({
          data: {
            id: cuid(),
            type: "PATTERN",
            semanticHash: hash,
            abstractionLevel: r.category === "security" ? 3 : (r.category === "async" ? 2 : 1),
            payload: JSON.stringify({
              pattern: r.pattern,
              suggestion: r.suggestion,
              language: r.language,
              confidence: r.confidence,
              tags: r.tags.split(","),
              source: "external-seed",
            }),
            metadata: JSON.stringify({ category: r.category, scope: r.scope }),
          },
        });
        nodeCount++;
      }
    } catch (e) {
      // duplicate; skip
    }
  }

  // 3. Create inter-node edges: PRECEDES links between related categories
  const categories = [...new Set(RULES.map(r => r.category))];
  for (let i = 0; i < categories.length - 1; i++) {
    const srcNodes = await p.cognitionNode.findMany({
      where: { metadata: { contains: categories[i] } },
      take: 2,
    });
    const tgtNodes = await p.cognitionNode.findMany({
      where: { metadata: { contains: categories[i + 1] } },
      take: 2,
    });
    for (const src of srcNodes) {
      for (const tgt of tgtNodes) {
        if (src.id === tgt.id) continue;
        try {
          await p.cognitionEdge.create({
            data: {
              id: cuid(),
              sourceId: src.id,
              targetId: tgt.id,
              relation: "PRECEDES",
              weight: 1.0,
            },
          });
        } catch {}
      }
    }
  }

  const [totalRules, totalNodes, totalEdges] = await Promise.all([
    p.rule.count(),
    p.cognitionNode.count(),
    p.cognitionEdge.count(),
  ]);

  console.log(JSON.stringify({
    newRules: ruleCount,
    newNodes: nodeCount,
    totalRules,
    totalNodes,
    totalEdges,
  }, null, 2));

  await p.$disconnect();
}

seed().catch(e => { console.error(e); process.exit(1); });
