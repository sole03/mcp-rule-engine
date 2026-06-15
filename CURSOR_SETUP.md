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
