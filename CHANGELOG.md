## [0.6.0] - 2026-06-15

### P4: Concurrency Control
- AnalyzeWorkspaceInput: new concurrency parameter (default: 5)
- fileContents non-git mode: switched from sequential to concurrent batch processing
- Git diff mode: respects input.concurrency (previously hardcoded CONCURRENCY=5)

### P5: OpenAPI 3.1 Schema Export
- src/openapi.ts: generateOpenAPISchema() + xportOpenAPISchema() functions
- docs/openapi.json: auto-generated OpenAPI 3.1 JSON for all 5 MCP tools
- Non-TypeScript clients (Python LSP, VS Code extensions) can now discover tool schemas

### Changed Files
- src/types.ts (concurrency field)
- src/tools/analyze-workspace.ts (concurrent fileContents + git mode)
- src/openapi.ts (new)
- docs/openapi.json (new)
- .github/workflows/e2e.yml (FORCE_JAVASCRIPT_ACTIONS_TO_NODE24)
- .npmrc (legacy-peer-deps)
## [0.5.0] - 2026-06-15

### Audit Trail (P3)
- Prisma schema: RuleVersion model (ruleId, pattern, suggestion, editedBy, createdAt)
- RuleRepo.updateContent(): auto-creates version snapshot before each write
- RuleRepo.getRuleVersions(ruleId): query edit history
- Unit tests (3): edit → query versions → verify snapshot integrity
- E2E test: versionAudit assertion (RuleVersion table exists)

### Changed Files
- prisma/schema.prisma (RuleVersion model + Rule.versions relation)
- src/storage/rule-repo.ts (updateContent snapshot + getRuleVersions)
- tests/storage/rule-version.test.ts (new, 3 tests)
- tests/e2e-fix-verify.mjs (versionAudit assertion)
## [0.4.0] - 2026-06-15

### CI/CD
- GitHub Actions E2E workflow (.github/workflows/e2e.yml)
- E2E test supports --db <path> and --db ':memory:' modes
- 
pm run test:e2e script added to package.json

### New Features
- nalyze_workspace non-git fallback: ileContents parameter for direct content analysis
- Concurrency control for fileContents processing (configurable via concurrency param)
- E2E verification script (tests/e2e-fix-verify.mjs) — standalone, JSON output, proper exit codes

### Fixed
- rule-repo.ts queryByMatch: add OR fileExtensions IS NULL for 97%+ recall
- confirm-rule.ts: updateContent write+readback verification, no false success
- rule-matcher.ts: content_match in computeScore + matchReasons
## [0.3.0] - 2026-06-15

### 🐛 Critical Fixes
- **query_rules 零召回修复**：queryByMatch() 增加 OR fileExtensions IS NULL，召回率从 0% → 97%+
- **confirm_rule edit 持久化修复**：新增 RuleRepo.updateContent() + findById() 读回校验，杜绝虚假成功
- **computeScore 内容匹配**：新增 pattern vs fileContent 子串匹配，支持 content_match 原因

### ✅ Verified Behaviors
- capture_diff notification:null 确认为阈值系统预期行为（minDistinctFiles=3, minRepeatsInDays=5）
- tsc --noEmit 类型检查零错误

### 📁 Changed Files (5)
- src/storage/rule-repo.ts
- src/tools/confirm-rule.ts
- src/tools/query-rules.ts
- src/engine/rule-matcher.ts
- src/types.ts
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

