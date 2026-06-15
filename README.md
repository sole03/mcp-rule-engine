# MCP Rule Engine

> [中文文档](./README.zh.md)

An MCP server that captures code modifications, generates reusable rules, and injects them into AI agent context. Provides audit trail for every rule change.

## Features

- **Rule capture**: Analyze code diffs via AST (Tree-sitter) and extract repeatable patterns as structured rules
- **Deterministic matching**: Language + file extension + tags + project ID retrieval, with weighted scoring (type/time decay/path match)
- **Version audit**: Every rule edit auto-creates a snapshot in RuleVersion table — query full history with getRuleVersions
- **Batch workspace analysis**: nalyze_workspace tool diffs a git range or accepts ileContents directly (no git required)
- **Session-level token budget**: 	askId-scoped <=2000 token tracking across multi-round query_rules calls
- **Conflict resolution**: Automatic detection and user-guided resolution when rules conflict over the same pattern
- **OpenAPI 3.1 schema**: Auto-generated API schema at docs/openapi.json for non-TypeScript clients

## API

### analyze_workspace

Analyze workspace changes and generate rule candidates. Accepts either a git commit range or direct file contents.

**Inputs:**
- aseCommit (string, required): Git base commit to diff against
- headCommit (string, optional): Git head commit (defaults to HEAD)
- paths (string[], optional): Filter to specific file paths
- ileContents (object[], optional): Direct content analysis — bypasses git
  - path (string): File path
  - originalContent (string, optional): Original content (omit if new file)
  - modifiedContent (string): Modified content
- 	askId (string, optional): Session tracking ID for token budget isolation
- concurrency (number, optional): Parallel processing concurrency (default: 5)

### query_rules

Query the most relevant rules for a given context.

**Inputs:**
- language (string, required): Programming language
- ilePath (string, required): Current file path
- projectId (string, optional): Project scope filter
- 	ags (string[], optional): Tag-based filtering
- 	askId (string, optional): Session tracking ID

Returns Top-K scored rules (<=2000 tokens total), with match reasons (language_match, path_match, content_match).

### capture_diff

Analyze a single file diff and generate rule candidates.

**Inputs:**
- ilePath (string, required)
- originalContent (string, required)
- modifiedContent (string, required)
- language (string, required)
- projectId (string, optional)

### confirm_rule

Confirm, reject, edit, or skip a rule candidate.

**Inputs:**
- uleId (string, required)
- ction (enum: ccept | eject | dit | skip, required)
- ditedPattern (string, optional): New pattern when action=edit
- ditedSuggestion (string, optional): New suggestion when action=edit

On dit, the server automatically snapshots the old content into RuleVersion before applying the update.

### resolve_conflict

Resolve a conflict between two rules covering the same pattern.

**Inputs:**
- conflictId (string, required)
- esolution (enum: keep_a | keep_b | merge | skip, required)
- atchAllSession (boolean, optional): Apply same resolution to all conflicts this session

### list_rules

List rules with optional filters.

**Inputs:** All optional — language, scope (project|user|global), status (active|pending|archived), projectId, limit, offset.

### getRuleVersions (internal)

Query rule version history.

**Inputs:**
- uleId (string, required)

Returns array of version snapshots, newest first.

## Configuration

### Codex CLI

`ash
codex mcp add mcp-rule-engine -- node /path/to/project/dist/index.js
`

Or add to ~/.codex/config.toml:

`	oml
[mcp_servers."mcp-rule-engine"]
command = "node"
args = ["/path/to/project/dist/index.js"]
[mcp_servers."mcp-rule-engine".env]
DATABASE_URL = "file:/path/to/project/prisma/data/rules.db"
`

### VS Code

`json
{
  "servers": {
    "mcp-rule-engine": {
      "command": "node",
      "args": ["/path/to/project/dist/index.js"]
    }
  }
}
`

### Cursor

`json
{
  "mcpServers": {
    "mcp-rule-engine": {
      "command": "node",
      "args": ["/path/to/project/dist/index.js"],
      "env": {
        "DATABASE_URL": "file:/path/to/project/prisma/data/rules.db"
      }
    }
  }
}
`

### Windows

When using 
ode directly (as with this server), no cmd /c wrapping is needed. Ensure DATABASE_URL is an absolute path:

`
DATABASE_URL="file:C:/path/to/project/prisma/data/rules.db"
`

## Build

`ash
npm install
npx prisma generate
npx prisma db push          # Initialize SQLite database
npm run build                # Compile TypeScript
node dist/index.js           # Start server (stdio transport)
`

### Tests

`ash
npm test                        # Unit tests
npm run test:e2e                # E2E integration test
npm run test:e2e -- --db :memory:  # In-memory database mode
`

## Project Structure

`
src/
  index.ts              # MCP server entry point
  types.ts              # Shared type definitions
  openapi.ts            # OpenAPI 3.1 schema generator
  engine/               # Core logic: AST diff, rule generation, matching
  storage/              # Persistence layer: Prisma + SQLite
  tools/                # MCP tool handlers
  conflict/             # Conflict resolution logic
  modes/                # Silent & confirm interaction modes
tests/
  e2e-fix-verify.mjs   # E2E integration test
  engine/               # Engine unit tests
  storage/              # Storage unit tests
  tools/                # Tool unit tests
  conflict/             # Conflict arbitrator tests
prisma/
  schema.prisma         # Database schema
docs/
  api/README.md         # API reference documentation
  openapi.json          # OpenAPI 3.1 schema
`

## Known Issues

- **Prisma EPERM on Windows**: Windows Defender may block schema-engine-windows.exe. Run: Add-MpPreference -ExclusionPath "...\\@prisma\\engines\\schema-engine-windows.exe"
- **Codex --db :memory: EPERM**: Sandboxed environments can't spawn cmd.exe. Use a file path instead.
- **Codex state DB corruption**: Abnormal exit may corrupt state_*.sqlite. Backup and remove to auto-rebuild.

## License

MIT