# Changelog

## [Unreleased] - Smoke Test Findings (2026-06-15)

### Added
- `analyze_workspace` MCP tool — batch git diff analysis per file
- Session-level token tracking by `taskId` across multi-round `query_rules` calls
- Batch transaction protection (`prisma.$transaction`) in `rule-repo.ts`
- Observability metrics: `tool_call_count` by source, `token_budget_utilization_rate`, `conflict_resolution_distribution`
- Codex integration: `CODEX_PROMPT.md`, `CURSOR_SETUP.md` with full smoke test guide
- Enhanced AST Diff: `structuralHash` Merkle-tree matching + MOVE detection with cross-parent post-processing
- Tree-sitter WASM parsing for JavaScript / TypeScript / Python
- Test suite: 42 tests across 8 files (AST diff, rule generation, scoring, token control, arbitration, batch, session, analyze-workspace mock)

### Fixed
- Prisma SQLite `$executeRawUnsafe("SELECT 1")` incompatibility → `$connect()` (Prisma 5.22)
- `DATABASE_URL` relative path VFS I/O error → absolute path in `.env`
- `findMatchingChild` bug: was using `newSigs.get(oldChild)` → now passes both `oldSigs` and `newSigs`
- `web-tree-sitter@^0.21.2` → `^0.26.0` (version didn"t exist)
- Prisma schema format: single-line attributes → multi-line

### Known Issues (Windows)
- Prisma `schema-engine-windows.exe` blocked by Windows Defender — requires manual `Add-MpPreference` exclusion
- Codex 0.139.0 state DB corruption after abnormal exit — backup + remove `state_5.sqlite` + `codex doctor`
- Codex `--instructions` flag removed in 0.139.0 — use stdin pipe: `Get-Content -Raw | codex exec -`
- Codex `-a` (ask-for-approval) must be placed before `exec` subcommand, not after
- `better-sqlite3` may not be directly requireable — use `npx prisma db execute` as alternative
