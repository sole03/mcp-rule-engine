# MCP Production-Grade Integration Guide

> For: Cursor, Claude Desktop, Cline / Roo Code
> Last updated: 2026-06-17

---

## 1. Quick Start

### Prerequisites
- Node.js >= 18
- npm >= 9

### Start the Server

```bash
# stdio mode (default for Cursor / Claude Desktop)
npm run build && node dist/cli.js

# HTTP mode (for Cline / Roo Code remote agents)
TRANSPORT=http PORT=3000 npm run build && node dist/cli.js
```

---

## 2. Agent Configuration

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "cognition-engine": {
      "command": "node",
      "args": ["dist/cli.js"],
      "env": {
        "DATABASE_URL": "file:./dev.db"
      }
    }
  }
}
```

Restart Cursor. Check Settings > MCP for green status indicator.

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cognition-engine": {
      "command": "node",
      "args": ["path/to/mcp-rule-engine/dist/cli.js"],
      "env": {
        "DATABASE_URL": "file:./dev.db"
      }
    }
  }
}
```

### Cline / Roo Code (HTTP)

```json
{
  "mcpServers": {
    "cognition-engine": {
      "url": "http://localhost:3000",
      "transport": "streamable-http"
    }
  }
}
```

---

## 3. Tool Reference

### cognition_query

Query the cognition graph by context hash. Returns relevant nodes sorted by relevance.

```json
{
  "contextHash": "abc123",
  "intentHint": "BUGFIX",
  "maxDepth": 3
}
```

### cognition_validate

Validate code against an AST template.

```json
{
  "nodeId": "node-123",
  "targetFileContent": "function foo() { return 1; }"
}
```

### cognition_feedback

Provide feedback to refine future queries.

```json
{
  "nodeId": "node-123",
  "edgeId": "edge-456",
  "outcome": "ACCEPTED",
  "comment": "Useful constraint"
}
```

---

## 4. Resources

| URI | Type | Content |
|-----|------|---------|
| `cognition://schema` | application/json | Data model schema |
| `cognition://stats` | application/json | Graph statistics |
| `cognition://docs` | text/markdown | Full documentation |

---

## 5. Error Handling

| Code | Meaning | Retryable |
|------|---------|-----------|
| `-32602` | Invalid parameters | false |
| `-32603` | Internal engine error | true |
| `-32001` | Traversal timeout | true |

All error responses include a `retryable` boolean field.

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Tool list not loading | Missing environment variables | Set `DATABASE_URL` |
| Server exits immediately | Prisma client not generated | Run `npx prisma generate` |
| HTTP connection refused | Wrong port or server not running | Check `PORT` env var. Start with `npm run start:http` |
| "Tool not found" | SDK version mismatch | Use @modelcontextprotocol/sdk >= 1.0 |
| Resource returns empty | Database not migrated | Run `npx prisma migrate deploy` |

