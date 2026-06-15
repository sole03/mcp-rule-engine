# Cursor MCP 服务器设置指南

## 概述

本指南说明如何在 Cursor IDE 中配置和使用 Agent 调教反向图谱系统的 MCP Server，使系统能够在编码过程中自动捕获规则并注入到 AI 上下文。

---

## 前置要求

- **Node.js** ≥ 18.0.0（推荐 20.x LTS）
- **npm** ≥ 9.0.0
- **Cursor IDE** ≥ 0.40.x（支持 MCP 协议）
- **操作系统**：Windows 10/11（项目路径 `D:\Desktop\mcp`）

验证环境：

```bash
node --version
npm --version
```

---

## 安装与配置

### 1. 安装项目依赖

```bash
cd D:\Desktop\mcp
npm install
```

### 2. 初始化数据库

```bash
npx prisma db push
```

这将会根据 `prisma/schema.prisma` 在 `prisma/data/` 目录下创建 SQLite 数据库文件 `rules.db`。

### 3. 编译 TypeScript

```bash
npx tsc
```

编译产物输出到 `dist/` 目录。确认 `dist/index.js` 存在即表示编译成功。

### 4. 测试启动

```bash
node dist/index.js
```

服务器启动后应有以下输出：

```
Agent Tuning Reverse Graph MCP Server running on stdio
```

按 `Ctrl+C` 停止服务器。

---

## 配置 Cursor MCP

### 方法一：通过 Cursor 设置界面

1. 打开 Cursor
2. 点击设置 → Features → MCP Servers
3. 点击 **+ Add new MCP Server**
4. 填写：
   - **Name**: `agent-tuning-reverse-graph`
   - **Type**: `command`
   - **Command**: `node`
   - **Args**: `D:\Desktop\mcp\dist\index.js`
5. 点击保存

### 方法二：直接编辑配置文件

编辑 `~/.cursor/mcp.json`（Windows 路径：`C:\Users\<用户名>\.cursor\mcp.json`）：

```json
{
  "mcpServers": {
    "agent-tuning-reverse-graph": {
      "command": "node",
      "args": ["D:\\Desktop\\mcp\\dist\\index.js"]
    }
  }
}
```

> **注意**：路径中的反斜杠需要使用双反斜杠 `\\` 转义。

---

## 测试连接

### 在 Cursor 中验证

1. 重启 Cursor IDE
2. 打开聊天面板（`Ctrl+Shift+I`）
3. MCP 服务器名称应显示在可用工具列表中
4. 系统配置成功后，Chat 中可以调用系统提供的 5 个工具

### 使用 MCP Inspector 验证（可选）

```bash
npx @modelcontextprotocol/inspector node D:\Desktop\mcp\dist\index.js
```

---

## 故障排查

### 服务器未启动

**症状**：Cursor 提示 MCP 服务器连接失败。

**检查步骤**：

1. 确认 `dist/index.js` 存在且可执行：
   ```bash
   node -e "require('./dist/index.js')"
   ```

2. 检查是否缺少 `.env` 文件：
   ```bash
   type D:\Desktop\mcp\.env
   ```
   内容应为：
   ```
   DATABASE_URL="file:./data/rules.db"
   ```

3. 手动启动测试：
   ```bash
   node dist/index.js
   ```
   观察是否有错误输出。

### 数据库问题

**症状**：启动后报 Prisma 相关错误。

```bash
# 重新生成 Prisma Client
cd D:\Desktop\mcp
npx prisma generate
npx prisma db push
```

### 编译错误

**症状**：`npx tsc` 报错。

```bash
# 清理后重新编译
rm -Recurse -Force dist
npx tsc
```

### 端口冲突

MCP Server 通过 stdin/stdout 通信，不占用 TCP 端口。如遇到端口冲突问题，请检查是否有其他进程占用标准 I/O。

---

## 模式切换

系统支持两种运行模式：**静默模式（默认）** 和 **确认模式**。

| 模式 | 行为 | 适用场景 |
|------|------|----------|
| **静默模式（silent）** | 后台自动学习规则，仅在学习时推送非阻塞通知 | 日常开发，减少干扰 |
| **确认模式（confirm）** | 每次规则候选都弹出确认卡片，需用户手动确认 | 专业调教、规则审查 |

### 切换模式

直接修改 SQLite 数据库中的配置：

```bash
# 切换到确认模式
cd D:\Desktop\mcp
npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
await prisma.appConfig.upsert({
  where: { id: 'default' },
  update: { mode: 'confirm' },
  create: { id: 'default', mode: 'confirm' }
});
await prisma.\\$disconnect();
"
```

或者通过项目集成的管理工具（即将推出）。

---

## 日志查看

MCP Server 将日志输出到 stderr，Cursor 会自动捕获并显示。

### 实时日志

手动启动服务器时，将 stderr 重定向到文件：

```bash
node dist/index.js 2>> mcp-server.log
```

### 日志内容说明

| 日志级别 | 格式 | 示例 |
|----------|------|------|
| 信息 | `[INFO] ...` | `[INFO] Rule generated: replace foo → bar` |
| 错误 | `[MCP Error] ...` | `[MCP Error] Error: Unknown tool: xxx` |
| 指标 | `[METRIC] ...` | `[METRIC] query_rules: {"language":"typescript","candidates":5}` |

---

## 更新服务器

当项目代码更新后，重新编译并重启 Cursor：

```bash
cd D:\Desktop\mcp
git pull
npm install
npx prisma db push
npx tsc
```

然后重启 Cursor IDE 以使新的 MCP Server 生效。

---

## 卸载

1. 从 Cursor 设置中移除 MCP 服务器配置
2. （可选）删除项目文件夹：
   ```bash
   rm -Recurse -Force D:\Desktop\mcp
   ```

---

## Codex CLI 集成（验证-反馈飞轮）

### 注册 MCP Server

**不要手动启动 Server。** 在 Codex 的配置文件中注册，让 Codex 自动管理生命周期：

```json
// ~/.codex/config.json
{
  "mcpServers": {
    "agent-tuning-reverse-graph": {
      "command": "node",
      "args": ["D:\\Desktop\\mcp\\dist\\index.js"],
      "env": {
        "DATABASE_URL": "file:D:\\Desktop\\mcp\\data\\rules.db"
      }
    }
  }
}
```

> **DATABASE_URL 必须使用绝对路径。** Codex 沙箱的工作目录可能不是 D:\\Desktop\\mcp，相对路径 file:./data/rules.db 会找不到 SQLite 文件。

### 验证注册

```bash
codex --help
# 输出中应包含 agent-tuning-reverse-graph
```

### 首轮烟测流程

1. **创建测试仓库**

先创建一个包含有意义 TypeScript 代码的测试仓库。仅含 const x=1 的文件无法触发有意义的 AST Diff，因为 Tree-sitter 需要足够复杂的结构才能产生可泛化的规则。

```bash
mkdir /tmp/test-repo && cd /tmp/test-repo
git init
mkdir src
cat > src/utils.ts << EOF
export function handleError(err: any) {
  console.log("error:", err);
  return null;
}

export function formatUser(name: string, age: number) {
  return name + " (" + age + ")";
}
EOF
git add -A && git commit -m "init"
```

2. **启动 Codex 并注入提示词**

```bash
codex --instructions D:\\Desktop\\mcp\\CODEX_PROMPT.md --repo /tmp/test-repo
```

3. **执行重复性重构任务**

让 Codex 执行类似任务：
- "将所有 console.log 替换为 console.error，并在错误对象前加上 [ERROR] 前缀"
- "将所有字符串拼接改为模板字符串"
- "为所有函数添加统一的错误处理结构"

每次修改后，Codex 应自动调用 analyze_workspace → 生成规则 → confirm_rule 确认。

4. **验证埋点数据**

```bash
# 查询 tool_call_count 按工具+来源分布
sqlite3 D:\\Desktop\\mcp\\data\\rules.db \
  "SELECT json_extract(properties, '$.toolName') as tool_name,
          json_extract(properties, '$.source') as source,
          COUNT(*) as calls
   FROM MetricEvent
   WHERE eventType = 'tool_call_count'
   GROUP BY tool_name, source;"

# 查询 token 预算利用率
sqlite3 D:\\Desktop\\mcp\\data\\rules.db \
  "SELECT json_extract(properties, '$.taskId') as task_id,
          json_extract(properties, '$.utilizedTokens') as tokens,
          json_extract(properties, '$.budgetPercent') || '%' as pct
   FROM MetricEvent
   WHERE eventType = 'token_budget_utilization_rate'
   ORDER BY createdAt DESC
   LIMIT 5;"

# 查询冲突解决方案分布
sqlite3 D:\\Desktop\\mcp\\data\\rules.db \
  "SELECT json_extract(properties, '$.resolution') as resolution,
          COUNT(*) as count
   FROM MetricEvent
   WHERE eventType = 'conflict_resolution_distribution'
   GROUP BY resolution;"
```

### 烟测成功标准

| 检查项 | 预期结果 | 失败处理 |
|--------|----------|----------|
| Codex 识别工具 | codex --help 中列出 analyze_workspace | 检查 config.json 格式 + 重启 Codex |
| 规则自动生成 | list_rules 返回 >=1 条 source:"codex" 的规则 | 检查 git diff + SKIP_PATTERNS 是否误过滤 |
| Token 预算隔离 | 同一 taskId 多次 query，budgetPercent 递增且 <=100% | 检查 token-controller.session.test.ts |
| 批量无重复 | 相同 baseCommit 重复调用，规则数不增加 | 检查 batchCreate 幂等性 |
| 冲突仲裁触发 | conflict_resolution_distribution 有记录 | 检查 resolve-conflict.ts 埋点 |

### 常见问题

**Q: Codex 沙箱中无法访问宿主机 SQLite？**
A: 确保 DATABASE_URL 使用绝对路径，且 SQLite 文件位于 Codex 可读的目录。

**Q: MCP Server 无法启动？**
A: 先手动运行 node dist/index.js 验证无报错，再检查 config.json 中的路径和转义。

**Q: 埋点查询返回空？**
A: 确认 eventType 名称与 metricRepo.track() 调用中的字符串完全一致。当前使用的事件类型：tool_call_count、token_budget_utilization_rate、conflict_resolution_distribution、analyze_workspace。

---

## Windows 平台注意事项

### SQLite 查询：用 Node.js 替代 sqlite3 CLI

Windows 默认没有 `sqlite3` 命令行工具。用 `better-sqlite3`（Prisma 底层依赖，已安装）替代：

```powershell
# 验证埋点 — tool_call_count 按工具+来源分布
node -e "
const Database=require('better-sqlite3');
const db=new Database('D:\\Desktop\\mcp\\data\\rules.db');
const rows=db.prepare(\"SELECT json_extract(properties,'$.toolName') as tool, json_extract(properties,'$.source') as src, COUNT(*) as cnt FROM MetricEvent WHERE eventType='tool_call_count' GROUP BY tool,src\").all();
console.table(rows);
db.close();
"

# 验证埋点 — Token 预算利用率 TOP 5
node -e "
const Database=require('better-sqlite3');
const db=new Database('D:\\Desktop\\mcp\\data\\rules.db');
const rows=db.prepare(\"SELECT json_extract(properties,'$.taskId') as task_id, json_extract(properties,'$.utilizedTokens') as tokens, json_extract(properties,'$.budgetPercent') || '%' as pct FROM MetricEvent WHERE eventType='token_budget_utilization_rate' ORDER BY rowid DESC LIMIT 5\").all();
console.table(rows);
db.close();
"

# 验证埋点 — 冲突解决方案分布
node -e "
const Database=require('better-sqlite3');
const db=new Database('D:\\Desktop\\mcp\\data\\rules.db');
const rows=db.prepare(\"SELECT json_extract(properties,'$.resolution') as resolution, COUNT(*) as cnt FROM MetricEvent WHERE eventType='conflict_resolution_distribution' GROUP BY resolution\").all();
console.table(rows);
db.close();
"
```

### Codex 配置文件路径

`~/.codex/config.json` 在 Windows 上的实际路径是 `%USERPROFILE%\.codex\config.json`：

```powershell
# 验证配置文件
Get-Content $env:USERPROFILE\.codex\config.json | ConvertFrom-Json

# 路径分隔符：正斜杠和双反斜杠都正确
# ✅ "args": ["D:/Desktop/mcp/dist/index.js"]
# ✅ "args": ["D:\\Desktop\\mcp\\dist\\index.js"]
# ❌ "args": ["D:\Desktop\mcp\dist\index.js"]
```

### 手动启动测试

Windows PowerShell 中 `node ... &` 不会后台运行。正确方式：

```powershell
# 方式一：前台启动验证无报错 → Ctrl+C 停止
node D:\Desktop\mcp\dist\index.js

# 方式二：后台启动（仅用于验证，正式烟测须用 Codex config.json）
Start-Process node -ArgumentList "D:\Desktop\mcp\dist\index.js" -NoNewWindow
```

> **重要提醒：** 手动启动仅用于验证 Server 本身无崩溃。正式烟测必须通过 Codex config.json 拉起，因为 Codex 会通过 stdio 发送初始化握手消息，手动启动的实例无法接收这些消息。

### 调试速查表

| 现象 | 最可能原因 | 快速验证 |
|------|-----------|---------|
| Codex 不提示工具 | config.json 路径/格式错误 | `codex --debug` 查看 MCP 握手日志 |
| 规则未生成 | SKIP_PATTERNS 误过滤 | 临时注释过滤逻辑重跑 |
| Token 预算无记录 | taskId 未从 Codex 传入 | 检查 query-rules.ts 入参日志 |
| 数据库写入失败 | DATABASE_URL 路径不对 | 检查 config.json env 字段 |
| MetricEvent 表为空 | 埋点代码未编译到 dist/ | `tsc && dir dist/tools/*.js` |

### 推荐执行顺序

```
1. 基础设施验证 → dir D:\Desktop\mcp\data\rules.db + Get-Content $env:USERPROFILE\.codex\config.json
2. Server 可启动 → 前台 node D:\Desktop\mcp\dist\index.js 看报错 → Ctrl+C
3. Codex 识别 → codex --help 确认工具列表含 analyze_workspace
4. 核心烟测 → 创建测试仓库 → codex --instructions CODEX_PROMPT.md → 触发 3 次修改
5. 数据产出验证 → 用上面 Node.js/better-sqlite3 脚本查询 MetricEvent
```

### 执行前最后确认（30 秒检查）

**1. 测试仓库路径**

Windows 没有原生 `/tmp`。根据你的终端类型选择对应路径：

```powershell
# PowerShell / CMD
$env:TEMP\test-repo   # => C:\Users\<你>\AppData\Local\Temp\test-repo

# Git Bash / WSL
/tmp/test-repo         # 可用，注意与 codex 的工作目录一致
```

在 `codex --repo` 参数中使用对应绝对路径。

**2. Codex 版本兼容性**

```powershell
codex --version
# 预期 ≥ 0.1.240507（早期版本对 MCP stdio 握手有 bug）
```

如果版本不满足，先升级再继续。

**3. 全程开启 debug**

```powershell
codex --debug --instructions D:\Desktop\mcp\CODEX_PROMPT.md --repo $env:TEMP\test-repo
```

即使烟测成功，debug 日志也是后续优化 Prompt 和排查边缘 case 的黄金数据。

**4. 数据验证追加：确认 source 标记**

在第 5 步数据验证中增加以下查询，确认 `source` 字段正确标记为 `"codex"`，避免与 Cursor 历史数据混淆：

```powershell
node -e "
const D=require('better-sqlite3');
const d=new D('D:\\Desktop\\mcp\\data\\rules.db');
const r=d.prepare(\"SELECT json_extract(properties,'$.source') as src, COUNT(*) as cnt FROM MetricEvent WHERE eventType='tool_call_count' GROUP BY src\").all();
console.table(r);
d.close();
"
```

### 已知问题（Windows + Codex 0.139.0）

1. **Prisma EPERM**: Windows Defender 会拦截 schema-engine。需精确排除两个引擎文件：
```powershell
Add-MpPreference -ExclusionPath "D:\Desktop\mcp\node_modules\@prisma\engines\schema-engine-windows.exe"
Add-MpPreference -ExclusionPath "D:\Desktop\mcp\node_modules\@prisma\engines\query_engine-windows.dll.node"
```

2. **Codex State DB 损坏**: 0.139.0 已知 bug。备份后删除 state_5.sqlite 即可自动重建：
```powershell
Copy-Item "$env:USERPROFILE\.codex\state_5.sqlite" "$env:USERPROFILE\.codex\state_5.sqlite.bak"
Remove-Item "$env:USERPROFILE\.codex\state_5.sqlite"
```

3. **`--instructions` 不可用**: 0.139.0 移除了该标志。使用管道注入替代：
```powershell
$prompt = Get-Content D:\Desktop\mcp\CODEX_PROMPT.md -Raw
echo $prompt | codex -a never exec -C "$env:TEMP\test-repo" --
```

4. **`-a` 必须放在 `exec` 前**: `-a` 是全局选项，`-C` 是 exec 选项。正确顺序：
```powershell
# ✅ 正确
codex -a never exec -C "$env:TEMP\test-repo" -
# ❌ 错误
codex exec -a never -C "$env:TEMP\test-repo" -
```

5. **DATABASE_URL 必须绝对路径**: Prisma Client 与 schema-engine 的 CWD 不一致，相对路径必然失败。
