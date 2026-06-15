# MCP Rule Engine

> [English Documentation](./README.md)

一个 MCP 服务器，用于捕获代码修改、生成可复用的规则并将其注入 AI 代理的上下文。为每次规则变更提供审计追踪。

## 特性

- **规则捕获**：通过 AST（Tree-sitter）分析代码差异，提取可重复的模式作为结构化规则
- **确定性匹配**：基于语言 + 文件扩展名 + 标签 + 项目 ID 检索，带加权评分（类型/时间衰减/路径匹配）
- **版本审计**：每次规则编辑自动在 `RuleVersion` 表创建快照 — 通过 `getRuleVersions` 查询完整历史
- **批量工作区分析**：`analyze_workspace` 工具可比较 Git 范围或直接接受 `fileContents`（无需 Git）
- **会话级 Token 预算**：基于 `taskId` 的 &lt;=2000 token 追踪，跨多轮 `query_rules` 调用
- **冲突仲裁**：当规则覆盖同一模式时自动检测，支持用户引导的冲突解决
- **OpenAPI 3.1 模式**：自动生成的 API 模式文件 `docs/openapi.json`，方便非 TypeScript 客户端集成

## API

### analyze_workspace

分析工作区变更并生成规则候选。接受 Git 提交范围或直接文件内容。

**输入参数：**
- `baseCommit`（string，必填）：Git 基础提交哈希
- `headCommit`（string，可选）：Git 头提交哈希（默认为 HEAD）
- `paths`（string[]，可选）：过滤特定文件路径
- `fileContents`（object[]，可选）：直接内容分析 — 绕过 Git
  - `path`（string）：文件路径
  - `originalContent`（string，可选）：原始内容（新文件可省略）
  - `modifiedContent`（string）：修改后内容
- `taskId`（string，可选）：会话跟踪 ID，用于 Token 预算隔离
- `concurrency`（number，可选）：并行处理并发数（默认：5）

### query_rules

查询与给定上下文最相关的规则。

**输入参数：**
- `language`（string，必填）：编程语言
- `filePath`（string，必填）：当前文件路径
- `projectId`（string，可选）：项目范围过滤
- `tags`（string[]，可选）：基于标签的过滤
- `taskId`（string，可选）：会话跟踪 ID

返回 Top-K 评分规则（总共 &lt;=2000 tokens），附带匹配原因（`language_match`、`path_match`、`content_match`）。

### capture_diff

分析单个文件差异并生成规则候选。

**输入参数：**
- `filePath`（string，必填）
- `originalContent`（string，必填）
- `modifiedContent`（string，必填）
- `language`（string，必填）
- `projectId`（string，可选）

### confirm_rule

确认、拒绝、编辑或跳过规则候选。

**输入参数：**
- `ruleId`（string，必填）
- `action`（枚举：`accept` | `reject` | `edit` | `skip`，必填）
- `editedPattern`（string，可选）：action=edit 时的新模式
- `editedSuggestion`（string，可选）：action=edit 时的新建议

执行 `edit` 时，服务器会在应用更新前自动将旧内容快照到 `RuleVersion`。

### resolve_conflict

解决两条规则之间的冲突。

**输入参数：**
- `conflictId`（string，必填）
- `resolution`（枚举：`keep_a` | `keep_b` | `merge` | `skip`，必填）
- `batchAllSession`（boolean，可选）：将相同解决方案应用于本次会话中的所有冲突

### list_rules

列出规则，支持可选过滤。

**输入参数：** 全部可选 — `language`、`scope`（project|user|global）、`status`（active|pending|archived）、`projectId`、`limit`、`offset`

### getRuleVersions（内部接口）

查询规则版本历史。

**输入参数：**
- `ruleId`（string，必填）

返回版本快照数组，最新的排在最前面。

## 配置

### Codex CLI

```bash
codex mcp add mcp-rule-engine -- node /path/to/project/dist/index.js
```

或添加到 `~/.codex/config.toml`：

```toml
[mcp_servers."mcp-rule-engine"]
command = "node"
args = ["/path/to/project/dist/index.js"]
[mcp_servers."mcp-rule-engine".env]
DATABASE_URL = "file:/path/to/project/prisma/data/rules.db"
```

### VS Code

```json
{
  "servers": {
    "mcp-rule-engine": {
      "command": "node",
      "args": ["/path/to/project/dist/index.js"]
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
      "args": ["/path/to/project/dist/index.js"],
      "env": {
        "DATABASE_URL": "file:/path/to/project/prisma/data/rules.db"
      }
    }
  }
}
```

### Windows

当直接使用 `node`（本服务器即此方式）时，无需 `cmd /c` 包装。确保 `DATABASE_URL` 使用绝对路径：

```
DATABASE_URL="file:C:/path/to/project/prisma/data/rules.db"
```

## 构建

```bash
npm install
npx prisma generate
npx prisma db push          # 初始化 SQLite 数据库
npm run build                # 编译 TypeScript
node dist/index.js           # 启动服务器（stdio 传输）
```

### 测试

```bash
npm test                        # 单元测试
npm run test:e2e                # E2E 集成测试
npm run test:e2e -- --db :memory:  # 内存数据库模式
```

## 项目结构

```
src/
  index.ts              # MCP 服务器入口
  types.ts              # 共享类型定义
  openapi.ts            # OpenAPI 3.1 模式生成器
  engine/               # 核心逻辑：AST 差异分析、规则生成、匹配
  storage/              # 持久化层：Prisma + SQLite
  tools/                # MCP 工具处理器
  conflict/             # 冲突仲裁逻辑
  modes/                # 静默与确认交互模式
tests/
  e2e-fix-verify.mjs   # E2E 集成测试
  engine/               # 引擎单元测试
  storage/              # 存储层单元测试
  tools/                # 工具单元测试
  conflict/             # 冲突仲裁测试
prisma/
  schema.prisma         # 数据库模式
docs/
  api/README.md         # API 参考文档
  openapi.json          # OpenAPI 3.1 模式
```

## 已知问题

- **Windows 上的 Prisma EPERM**：Windows Defender 可能阻止 `schema-engine-windows.exe`。运行：`Add-MpPreference -ExclusionPath "...\\@prisma\\engines\\schema-engine-windows.exe"`
- **Codex `--db :memory:` EPERM**：沙盒环境无法衍生 `cmd.exe`。改用文件路径。
- **Codex 状态数据库损坏**：异常退出可能损坏 `state_*.sqlite`。备份后删除可自动重建。

## 许可证

MIT
