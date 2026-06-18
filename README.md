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

### 方式一：npm 安装（推荐）

```bash
npm install governflow
# 或指定版本
npm install governflow@1.0.0-alpha.4
```

### 方式二：源码构建

```bash
# 1. 拉取仓库
git clone https://github.com/sole03/governflow.git
cd governflow

# 2. 安装依赖
npm install

# 3. 配置环境变量 (可选，默认使用 SQLite)
#    如需自定义路径: 复制 .env.example 为 .env 后修改 DATABASE_URL
#    或直接设置环境变量: set DATABASE_URL=file:./custom.db (Windows)
#    默认值: file:./mcp-cognition.db

# 4. 初始化数据库
npx prisma generate
npx prisma db push

# 5. 运行测试 (验证环境正确)
npm test                    # 291 tests, 37 files

# 6. 启动 MCP Server (stdio 模式, 供 Cursor/Claude Desktop 等客户端使用)
npm run dev

# 或启动 HTTP Server (REST API 模式)
npm run start:http          # 默认端口由 MCP SDK 管理

# 内核构建 (独立发布 governflow-core)
npm run build:core
```

### 配置说明

| 环境变量 | 默认值 | 说明 |
|---------|-------|------|
| `DATABASE_URL` | `file:./mcp-cognition.db` | SQLite 数据库路径 |
| `LOG_LEVEL` | `info` | 日志级别 (trace/debug/info/warn/error) |

无需 `.env` 文件即可运行。所有配置均有合理默认值。

---

## 项目目录结构

```
governflow/
├── packages/
│   ├── core/                    # governflow-core — 协议无关内核
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
│   └── dashboard/               # governflow-dashboard — 可视化仪表盘
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

### MCP 工具 (20 tools)

| 分类 | 工具 | 用途 |
|------|------|------|
| **Diff** | `analyze_workspace` | Git diff 分析 + 意图识别 + 语言检测 (19 种语言) |
| **Diff** | `capture_diff` | 单文件差异捕获 → AST/Regex 差异归一化 |
| **Rule** | `list_rules` | 分页查询全量规则 + 按语言/置信度过滤 |
| **Rule** | `query_rules` | 按文件路径 + 语言匹配适用规则 |
| **Rule** | `confirm_rule` | 审批(adopt)/拒绝(reject)/跳过(skip) 规则 |
| **Rule** | `resolve_conflict` | 解决规则冲突 (keep/skip/merge 三种策略) |
| **Cognition** | `cognition_query` | 认知图上下文查询 (最大深度 3 层 BFS) |
| **Cognition** | `cognition_validate` | 代码 vs 约束节点一致性校验 |
| **Cognition** | `cognition_feedback` | 提交 ACCEPTED/REJECTED 反馈回流 |
| **Cognition** | `cognition_update_config` | 认知引擎配置热更新 (需 expertMode) |
| **Cognition** | `cognition_approve_injection` | 审批/拒绝注入提案 |
| **Governance** | `governance_pause_arbitrator` | 暂停自动仲裁 (1-1440 分钟) |
| **Governance** | `governance_rollback_arbitration` | 回滚指定时间后的仲裁结果 |
| **Workflow** | `workflow_submit` | 提交多评审人审批工作流 |
| **Workflow** | `workflow_vote` | 审批投票 (APPROVE/REJECT) |
| **Workflow** | `workflow_status` | 查询审批状态 |
| **Workflow** | `workflow_escalate` | 审批超时升级 |
| **Immune** | `immune_cycle` | 规则免疫周期执行 |
| **Immune** | `immune_stats` | 免疫统计 (抑制/恢复/反馈) |

> **传输协议**: stdio 和 HTTP 均覆盖，HTTP 额外包含 Workflow + Immune 工具。

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

`governflow-core` 零 MCP 依赖，可独立发布为 npm 包：

```bash
npm install governflow-core
```

```typescript
import { MerlionBridge, RegoCompiler, CanaryController } from "governflow-core";
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

### `prisma db push` 报错 `Environment variable not found: DATABASE_URL`

设置环境变量或使用默认值：
```bash
export DATABASE_URL="file:./mcp-cognition.db"   # Linux/Mac
set DATABASE_URL=file:./mcp-cognition.db        # Windows cmd
$env:DATABASE_URL="file:./mcp-cognition.db"     # PowerShell
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

## Changelog

### v1.0.0-alpha.4 (2026-06-18)

- 🛠 **工程**: 新增 `.env.example` 配置模板，覆盖 DATABASE_URL / LOG_LEVEL
- 🛠 **工程**: 清理 `prisma/` 下 37 个 CI/测试残留 .db 文件，加入 `.gitignore` 全局匹配
- 🛠 **测试**: 修复 `cognition-repository` 性能测试偶发超时（timeout 5s → 15s + semanticHash 去重）
- 🛠 **文档**: 修正 README 全文 DATABASE_URL 默认值与代码实际值不一致（`dev.db` → `mcp-cognition.db`）
- 🛠 **文档**: 快速开始新增 `.env.example` 引导，替换硬编码路径示例

### v1.0.0-alpha.3 (2026-06-18)

- 🔴 **修复**: HTTP transport 每次请求重新创建 transport 导致崩溃 — 改为启动时连接一次
- 🔴 **修复**: `detectLang` 缺失 Java/Vue/XML/YML/YAML 等 5 种语言覆盖率
- 🔴 **修复**: `CaptureDiffSchema.originalContent` 从 `.min(1)` 放宽为 `.optional().default("")`，新文件不再被拒绝
- 🟡 **修复**: HTTP transport 补齐 `governance_pause_arbitrator` / `governance_rollback_arbitration` 工具注册
- 🟡 **修复**: `cognition_update_config` TOOLS schema 补齐 `expertMode` 字段
- 📦 首次发布 npm 包: `npm install governflow@1.0.0-alpha.3`

### v1.0.0-alpha.2 (2026-06-17)

- 20 MCP 工具完整实现 (Diff/Rule/Cognition/Governance/Workflow/Immune 六分类)
- 认知图引擎 (CognitionNode + CognitionEdge + BFS 遍历)
- AST 约束求解器 + 意图识别器
- 策略引擎 + 规则免疫 + 审批工作流 + 影子服务
- Streamable HTTP + stdio 双传输协议
- Prisma + SQLite 数据持久层

## License

Apache-2.0 © 2026 熊高锐
