# MCP Rule Engine

An MCP server that captures code modifications, generates reusable rules, and injects them into AI agent context. Provides audit trail for every rule change.

## Features

- **Rule capture**: Analyze code diffs via AST (Tree-sitter) and extract repeatable patterns as structured rules
- **Deterministic matching**: Language + file extension + tags + project ID retrieval, with weighted scoring (type/time decay/path match)
- **Version audit**: Every rule edit auto-creates a snapshot in `RuleVersion` table — query full history with `getRuleVersions`
- **Batch workspace analysis**: `analyze_workspace` tool diffs a git range or accepts `fileContents` directly (no git required)
- **Session-level token budget**: `taskId`-scoped <=2000 token tracking across multi-round `query_rules` calls

## API

### analyze_workspace

Analyze workspace changes and generate rule candidates. Accepts either a git commit range or direct file contents.

**Inputs:**
- `baseCommit` (string, required): Git base commit to diff against
- `headCommit` (string, optional): Git head commit (defaults to HEAD)
- `paths` (string[], optional): Filter to specific file paths
- `fileContents` (object[], optional): Direct content analysis — bypasses git
  - `path` (string): File path
  - `originalContent` (string, optional): Original content (omit if new file)
  - `modifiedContent` (string): Modified content
- `taskId` (string, optional): Session tracking ID for token budget isolation

### query_rules

Query the most relevant rules for a given context.

**Inputs:**
- `language` (string, required): Programming language
- `filePath` (string, required): Current file path
- `projectId` (string, optional): Project scope filter
- `tags` (string[], optional): Tag-based filtering
- `taskId` (string, optional): Session tracking ID

Returns Top-K scored rules (<=2000 tokens total), with match reasons (`language_match`, `path_match`, `content_match`).

### capture_diff

Analyze a single file diff and generate rule candidates.

**Inputs:**
- `filePath` (string, required)
- `originalContent` (string, required)
- `modifiedContent` (string, required)
- `language` (string, required)
- `projectId` (string, optional)

### confirm_rule

Confirm, reject, edit, or skip a rule candidate.

**Inputs:**
- `ruleId` (string, required)
- `action` (enum: `accept` | `reject` | `edit` | `skip`, required)
- `editedPattern` (string, optional): New pattern when action=edit
- `editedSuggestion` (string, optional): New suggestion when action=edit

On `edit`, the server automatically snapshots the old content into `RuleVersion` before applying the update.

### resolve_conflict

Resolve a conflict between two rules covering the same pattern.

**Inputs:**
- `conflictId` (string, required)
- `resolution` (enum: `keep_a` | `keep_b` | `merge` | `skip`, required)
- `batchAllSession` (boolean, optional): Apply same resolution to all conflicts this session

### getRuleVersions

Query rule version history.

**Inputs:**
- `ruleId` (string, required)

Returns array of version snapshots, newest first.

### list_rules

List rules with optional filters.

**Inputs:** All optional — `language`, `scope` (project|user|global), `status` (active|pending|archived), `projectId`, `limit`, `offset`.

## Configuration

### Codex CLI

```bash
codex mcp add mcp-rule-engine -- node D:/Desktop/mcp/dist/index.js
```

Or add to `~/.codex/config.toml`:

```toml
[mcp_servers."mcp-rule-engine"]
command = "node"
args = ["D:/Desktop/mcp/dist/index.js"]
[mcp_servers."mcp-rule-engine".env]
DATABASE_URL = "file:D:/Desktop/mcp/prisma/data/rules.db"
```

### VS Code

```json
{
  "servers": {
    "mcp-rule-engine": {
      "command": "node",
      "args": ["D:/Desktop/mcp/dist/index.js"]
    }
  }
}
```

### Cursor

```json
{
  "mcpServers": {
    "mcp-rule-engine": {
      "command": "node",
      "args": ["D:/Desktop/mcp/dist/index.js"],
      "env": {
        "DATABASE_URL": "file:D:/Desktop/mcp/prisma/data/rules.db"
      }
    }
  }
}
```

### Windows

When using `node` directly (as with this server), no `cmd /c` wrapping is needed. Ensure `DATABASE_URL` is an absolute path:

```
DATABASE_URL="file:D:/Desktop/mcp/prisma/data/rules.db"
```

## Build

```bash
npm install
npx prisma db push    # Initialize SQLite database
npm run build          # Compile TypeScript
node dist/index.js     # Start server (stdio transport)
```

### Tests

```bash
npm test                    # 45 unit tests
npm run test:e2e            # E2E integration test
npm run test:e2e -- --db ./tmp/test-rules.db  # Use file DB to avoid :memory: EPERM
```

## Known Issues

- **Prisma EPERM on Windows**: Windows Defender may block `schema-engine-windows.exe`. Run: `Add-MpPreference -ExclusionPath "...\\@prisma\\engines\\schema-engine-windows.exe"`
- **Codex `--db :memory:` EPERM**: Sandboxed environments can't spawn `cmd.exe`. Use a file path instead.
- **Codex 0.139.0 state DB**: Abnormal exit may corrupt `state_5.sqlite`. Backup and remove to auto-rebuild.

## License

MIT
