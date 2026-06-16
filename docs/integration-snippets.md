# MCP Integration Snippets

Ready-to-copy JSON configuration snippets for all major MCP clients.

## Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "cognition-engine": {
      "command": "npx",
      "args": ["-y", "mcp-cognition-engine@latest"],
      "env": {
        "COGNITION_DB_PATH": "~/.cognition/dev.db"
      }
    }
  }
}
```

After adding, open Cursor → Settings → MCP and click **Test Connection**.

## Claude Desktop

Add to `claude_desktop_config.json` (or `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "cognition-engine": {
      "command": "npx",
      "args": ["-y", "mcp-cognition-engine@latest"],
      "env": {
        "COGNITION_DB_PATH": "~/.cognition/dev.db"
      }
    }
  }
}
```

Restart Claude Desktop. The cognition engine tools should appear in the MCP tool list.

## VS Code (GitHub Copilot Chat / MCP Extension)

Add to `.vscode/mcp.json` or User `settings.json`:

```json
{
  "mcp": {
    "servers": {
      "cognition-engine": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "mcp-cognition-engine@latest"],
        "env": {
          "COGNITION_DB_PATH": "~/.cognition/dev.db"
        }
      }
    }
  }
}
```

Open VS Code Command Palette → 'MCP: Restart Servers'.

## Local Development (from source)

If you cloned the repo and want to run locally:

```json
{
  "mcpServers": {
    "cognition-engine": {
      "command": "node",
      "args": ["dist/cli.js"],
      "env": {
        "COGNITION_DB_PATH": "./prisma/dev.db"
      }
    }
  }
}
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COGNITION_DB_PATH` | `~/.cognition/dev.db` | Path to the SQLite database file. Created automatically if missing. |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "Database not found" | Delete the DB file and restart — it will auto-initialize. |
| Connection timeout | Make sure `prisma` is available in `npx` cache. First run may take 30s for npm install. |
| Tool not appearing | Check MCP client logs for parse errors. Verify the JSON snippet syntax. |
