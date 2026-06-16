# GovernFlow

**AI-native code governance pipeline. Assemble, don't build.**

GovernFlow 将 AI Agent 的代码治理从"自研轮子"重构为"组装业界工具链"的四层流水线。不建新平台，嵌入现有工作流。

---

## 环境依赖

| 依赖 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | ≥ 22 | 运行时 |
| npm | ≥ 10 | 包管理 |
| SQLite | 3 (内置) | 本地数据库 (零配置) |

> Node.js 22 是硬性要求（使用了 `--experimental` 特性的 tree-sitter wasm 绑定）。SQLite 通过 `better-sqlite3` 内嵌，无需单独安装。

---

## 快速部署运行

```bash
# 1. 拉取仓库
git clone https://github.com/sole03/mcp-rule-engine.git
cd mcp-rule-engine

# 2. 安装依赖
npm install

# 3. 配置环境变量 (可选，默认使用 SQLite)
#    如需自定义路径: set DATABASE_URL=file:./data/dev.db (Windows)
#                    或 export DATABASE_URL=file:./data/dev.db (Linux/Mac)
#    默认值: file:./dev.db

# 4. 初始化数据库
npx prisma generate
npx prisma migrate deploy

# 5. 运行测试 (验证环境正确)
npm test                    # 291 tests, 37 files

# 6. 启动 MCP Server (stdio 模式, 供 Cursor/Claude Desktop 等客户端使用)
npm run dev

# 或启动 HTTP Server (REST API 模式)
npm run start:http          # 默认端口由 MCP SDK 管理

# 内核构建 (独立发布 @wind-coms/governflow-core)
npm run build:core
```

### 配置说明

| 环境变量 | 默认值 | 说明 |
|---------|-------|------|
| `DATABASE_URL` | `file:./dev.db` | SQLite 数据库路径 |
| `LOG_LEVEL` | `info` | 日志级别 (trace/debug/info/warn/error) |

无需 `.env` 文件即可运行。所有配置均有合理默认值。

---

## 项目目录结构

```
governflow/
├── packages/
│   ├── core/                    # @wind-coms/governflow-core — 协议无关内核
│   │   └── src/
│   │       ├── perception/      # 感知层: MerlionBridge + ShapleyAttributor
│   │       ├── proposal/        # 提案层: RegoCompiler + StructuredGenerator + PromptPipeline
│   │       ├── verification/    # 验证层: PropertyTests + ShadowVerifier
│   │       ├── delivery/        # 决策层: GitOpsEngine + CanaryController
│   │       ├── constraints/     # 约束 DSL 编译器 + 模板库 + 运行时
│   │       ├── sandbox/         # COW 沙箱 + 自愈循环 + 安全阀 + 健康门控
│   │       ├── dashboard/       # 指标收集器 + DashboardSnapshot 类型
│   │       ├── cognition/       # 认知图引擎核心
│   │       ├── events/          # 事件总线 + 领域事件
│   │       ├── audit/           # 满意度追踪 (开发者体验兜底)
│   │       ├── cli/             # CLI 入口
│   │       └── di/              # 依赖注入容器
│   └── dashboard/               # @wind-coms/governflow-dashboard — 可视化仪表盘
├── src/                         # MCP Server 传输层 (stdio + HTTP)
│   ├── transport/               # MCP 工具处理器 + HTTP 服务
│   ├── governance/              # 策略引擎 + 规则免疫 + 审批工作流 + 影子服务
│   ├── core/                    # AST 约束求解器 + 认知图遍历器 + 意图识别
│   ├── data/                    # Prisma Repository + 向量存储 + LRU 缓存
│   └── adapters/                # Zod Schema 校验 + Embedding 适配器
├── tests/                       # 测试 (37 files, 291 tests)
├── prisma/                      # 数据库 Schema + 迁移
├── scripts/                     # License 检查 + 影子回放 CLI
├── benchmarks/                  # 性能基准
└── .github/workflows/           # CI 配置 (Rule Verification + License Check)
```

---

## 功能说明

### 四层流水线

| 层 | 核心模块 | 功能 |
|---|---------|------|
| **感知层** | `perception/` | Z-score 动态基线异常检测 + EMA 自适应 + 季节性分解 + Shapley 多维根因归因 |
| **提案层** | `proposal/` | JSON DSL → OPA Rego 编译 + Zod 约束 LLM 结构化输出 + Few-shot 自动编译 |
| **验证层** | `verification/` | 属性测试自动证伪 + 影子日志回放 + CI 自动验证 PR |
| **决策层** | `delivery/` | DashboardSnapshot → PR Markdown (GitOps) + 5%→100% 金丝雀渐进交付 |

### 数据模型

| 模型 | 用途 |
|------|------|
| `Rule` | 规则定义 (含 hitCount/falsePositiveCount/adoptedCount 效能追踪) |
| `PolicyVariant` | A/B 策略变体对比 |
| `ShadowLog` | 影子模式运行日志 (新规则 7 天前置观察) |
| `CognitionNode` / `CognitionEdge` | 认知图拓扑 |
| `AstTemplate` | AST 级约束模板 |
| `Proposal` / `ApprovalRequest` | 注入审批工作流 |

### MCP 工具

| 工具 | 用途 |
|------|------|
| `cognition_query` | 查询认知图节点 |
| `cognition_validate` | 验证代码是否符合约束 |
| `cognition_feedback` | 提交人工反馈 |
| `analyze_workspace` | 分析 Git diff 识别意图 |
| `confirm_rule` | 审批/拒绝自动生成的规则 |
| `resolve_conflict` | 解决规则冲突 |
| `governance_pause_arbitrator` | 暂停自动仲裁 |
| `governance_rollback_arbitration` | 回滚仲裁结果 |
| `preview_rule` | 预览规则生效前的代码变化 |
| `developer_satisfaction` | 提交开发者满意度评分 |

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 语言 | TypeScript 5.6 |
| 运行时 | Node.js 22 |
| 数据库 | SQLite (better-sqlite3) |
| ORM | Prisma 5.22 |
| 测试 | Vitest 2.1 |
| AST | tree-sitter (JS/Python/TS) |
| Embedding | @xenova/transformers (ONNX 本地推理) |
| Schema 校验 | Zod 4 |
| 日志 | Pino |
| 协议 | MCP (Model Context Protocol) |

## 内核包

`@wind-coms/governflow-core` 零 MCP 依赖，可独立发布为 npm 包：

```bash
npm install @wind-coms/governflow-core
```

```typescript
import { MerlionBridge, RegoCompiler, CanaryController } from "@wind-coms/governflow-core";
```

---

## 文档

| 文档 | 说明 |
|------|------|
| [OPTIMIZATION.md](./OPTIMIZATION.md) | 四维优化矩阵 — 痛点·举措·收益 |
| [ASSEMBLY_OVER_BUILD.md](./ASSEMBLY_OVER_BUILD.md) | Implementation Spec — 战略对齐 + 技术选型 |
| [TRACEABILITY.md](./TRACEABILITY.md) | 理论↔工程双向追溯 — 13/13 ✓ |

---

## 常见问题

### `npm install` 报错 `better-sqlite3` 编译失败

需要系统安装 C++ 编译工具链：
- **Windows**: `npm install --global windows-build-tools` 或安装 Visual Studio Build Tools
- **Mac**: `xcode-select --install`
- **Linux**: `sudo apt install build-essential python3`

### `prisma migrate deploy` 报错 `Environment variable not found: DATABASE_URL`

设置环境变量或使用默认值：
```bash
export DATABASE_URL="file:./dev.db"   # Linux/Mac
set DATABASE_URL=file:./dev.db        # Windows cmd
$env:DATABASE_URL="file:./dev.db"     # PowerShell
```

### 测试报错 `database is locked`

SQLite 并发文件锁的已知限制。重跑即可：
```bash
npm test
```
如果频繁出现，尝试 `npx vitest run --no-cache --pool=forks`。

### Node.js 版本过低

MCP SDK 和 tree-sitter wasm 绑定需要 Node.js ≥ 22。检查版本：
```bash
node -v
```
如果低于 22，使用 nvm/fnm 升级。

---

## 心法

> **不要构建系统，要构建流水线。**
>
> 让异常检测成为监控平台的插件，而非独立服务。
> 让规则生成成为 CI 的一个 Step，而非后台黑盒。
> 让人机协同成为 Code Review 的自然延伸，而非额外负担。

---

## License

Apache-2.0 © 2026 熊高锐