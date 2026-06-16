# GovernFlow

**AI-native code governance pipeline. Assemble, don't build.**

GovernFlow 将 AI Agent 的代码治理从"自研轮子"重构为"组装业界工具链"的四层流水线。不建新平台，嵌入现有工作流。

---

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                      GovernFlow                              │
│                                                             │
│  感知层       提案层        验证层         决策层            │
│  Perception  Proposal     Verification   Delivery           │
│  ──────────  ───────────  ─────────────  ─────────────────  │
│  Merlion     Rego         Property      GitOps             │
│  Bridge      Compiler     Tests         Engine             │
│  +Shapley    +Structured  +Shadow       +Canary            │
│  Attributor  Generator    Verifier      Controller         │
│              +PromptPipe  +CI Workflow                     │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │        @sole03/rule-engine-core (内核)                │   │
│  │  协议无关 · 零 MCP 依赖 · 可独立发布                   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

| 层 | 组件 | 核心能力 |
|---|------|---------|
| **感知层** | `MerlionBridge` + `ShapleyAttributor` | Z-score 动态基线异常检测 + 多维根因归因 |
| **提案层** | `RegoCompiler` + `StructuredGenerator` + `PromptPipeline` | JSON DSL → OPA Rego 编译器 + Zod 约束 LLM 输出 + Few-shot 自动编译 |
| **验证层** | `PropertyTests` + `ShadowVerifier` + CI Workflow | 属性测试自动证伪 + 影子日志回放 + PR 自动验证 |
| **决策层** | `GitOpsEngine` + `CanaryController` | DashboardSnapshot → PR Markdown + 5%→100% 金丝雀渐进交付 |

---

## 快速开始

```bash
# 安装
git clone https://github.com/sole03/mcp-rule-engine.git
cd mcp-rule-engine
npm install

# 生成 Prisma Client + 数据库迁移
npx prisma generate
npx prisma migrate deploy

# 运行测试
npm test                    # 291 tests, 37 files

# 类型检查
npx tsc --noEmit            # 0 errors

# 启动 MCP Server (stdio)
npm run dev

# 启动 HTTP Server
npm run start:http

# 构建内核包
npm run build:core          # @sole03/rule-engine-core

# License 检查
npm run license:check
```

---

## 包体系

| 包 | 路径 | 用途 |
|----|------|------|
| `governflow` | 根 | 完整项目 (MCP Server + CLI) |
| `@sole03/rule-engine-core` | `packages/core` | 协议无关内核 (零 MCP 依赖) |
| `@sole03/governflow-dashboard` | `packages/dashboard` | 指标收集与可视化 |

---

## 四层流水线详解

### 1. 感知层 — Perception

```
MerlionBridge              ShapleyAttributor
Z-score + EMA + 季节性      多维根因归因
       │                        │
       ▼                        ▼
  异常检测 ←── DashboardSnapshot ──→ 贡献度排序
  (NORMAL/WARN/CRITICAL)            (团队/文件/时段)
```

- **MerlionBridge**: 纯 Node.js 实现，Z-score 基线 + EMA(α=0.1) 自适应 + 24h/7d 季节性分解
- **ShapleyAttributor**: Shapley Value 近似算法，量化各维度对异常的贡献度

### 2. 提案层 — Proposal

```
自然语言需求
     │
     ▼
PromptPipeline ──→ StructuredGenerator ──→ RegoCompiler
( Few-shot编译 )   ( Zod约束输出 )          ( JSON→Rego )
                                           │
                                           ▼
                                     OPA Rego Policy
```

- **RegoCompiler**: 将自定义 JSON DSL 编译为标准 OPA Rego，支持形式化验证
- **StructuredGenerator**: Zod v4 Schema 约束 LLM 输出，格式错误率 → 0
- **PromptPipeline**: DSPy 风格 Few-shot 自动编译，Jaccard 相似度排序

### 3. 验证层 — Verification

```
PR 创建
   │
   ▼
Property Tests ──── Shadow Replay ──── CI Comment
(3条不变量×500+)    (真实流量回放)       (结果回写PR)
```

- **PropertyTests**: `no-safe-op-blocked` / `merge-no-conflict` / `heal-monotonic` 三条不变量
- **ShadowVerifier**: 影子日志回放，分类 PASS / NEW_FP / FIXED
- **CI Workflow**: `.github/workflows/rule-verify.yml` — 每次 PR 自动触发

### 4. 决策层 — Delivery

```
DashboardSnapshot + ShadowMetrics
           │
           ▼
     GitOpsEngine ──→ PR Description (Markdown + Mermaid)
           │
           ▼
     CanaryController
     5% → 20% → 50% → 100%
     (任一阶段恶化 → 自动回滚)
```

- **GitOpsEngine**: 将系统健康快照渲染为 PR Description，融入 Code Review 工作流
- **CanaryController**: 渐进式交付，djb2 hash 确定性路由，自动健康检查

---

## 数据模型

| 模型 | 用途 |
|------|------|
| `Rule` + `hitCount/falsePositiveCount/adoptedCount` | 规则效能追踪 |
| `PolicyVariant` | A/B 策略变体对比 |
| `ShadowLog` | 影子模式运行日志 (7 天前置) |
| `CognitionNode/Edge` | 认知图拓扑 |
| `AstTemplate` | AST 级约束模板 |

---

## 文档

| 文档 | 说明 |
|------|------|
| [OPTIMIZATION.md](./OPTIMIZATION.md) | 四维优化矩阵 — 痛点·举措·收益 |
| [ASSEMBLY_OVER_BUILD.md](./ASSEMBLY_OVER_BUILD.md) | Implementation Spec — 战略对齐 + 技术选型 |
| [TRACEABILITY.md](./TRACEABILITY.md) | 理论↔工程双向追溯 — 13/13 ✓ |

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