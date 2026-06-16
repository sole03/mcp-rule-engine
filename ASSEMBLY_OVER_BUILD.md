# ASSEMBLY_OVER_BUILD.md — 组装优于自研：四层流水线重构方案

> **North Star**：大脑三层 + 四维优化矩阵（保留在所有 OKR/架构图中）
> **Implementation Spec**：本文档（服务于 Sprint 规划和技术选型）
> **双向追溯**：参见 [TRACEABILITY.md](./TRACEABILITY.md)

---

## 战略对齐：每一条流水线都服务于一个理论目标

| 四层流水线 | 对应理论层 | 对应四维矩阵 | 核心指标 |
|-----------|-----------|-------------|---------|
| 感知层 (Perception) | 层级一：参数自整定 | 策略反馈闭环 | fpRate ↓, adoptRate ↑ |
| 提案层 (Proposal) | 层级二：规则权重自学习 | 重构触发边界 | 格式错误率 → 0, Rego 覆盖率 ↑ |
| 验证层 (Verification) | 层级二+三：自学习+自动生成 | 范式跃迁护栏 | 影子误报率 ↓, 属性测试通过率 100% |
| 决策层 (Delivery) | 层级三：规则自动生成 + 防体系异化 | 体验作为裁判 | 爆炸半径可控, 回滚自动化, 满意度 ≥ 3 |

---
# ASSEMBLY_OVER_BUILD.md — 组装优于自研：四层流水线重构方案

> **核心心法：不要构建"系统"，要构建"流水线"。**
>
> 前人的最大教训：凡是试图在运维/安全领域造新平台的项目，90% 死于维护成本。
> 真正的进化不是让系统变得更聪明，而是让系统更紧密地嵌入现有工具链。

---

## 前提验证（已完成 ✓）

| 检查项 | 状态 |
|--------|------|
| `packages/core` 28 文件内核编译 | `npx tsc --noEmit` → 0 errors |
| 全量测试 | **213/213 passed** (26 test files, 9.44s) |
| Prisma schema 补全 | Rule.hitCount / falsePositiveCount / adoptedCount + PolicyVariant 模型 |
| EVOLUTION 文件清理 | 已删除 5 个蓝图文件（Phase 1-4 已在 core 包中实现） |
| 文件数克制 | packages/core/src → 28 files (红线: 150) |

---

## 方案总览：从"四维矩阵"到"四层流水线"

```
原 OPTIMIZATION.md 四维                 新蓝图 四层流水线
─────────────────────────              ────────────────────
策略反馈闭环 (数据驱动策略)    →   感知层：异常检测 + 根因定位
重构触发边界 (指标驱动重构)    →   验证层：影子测试 + 属性测试
范式跃迁护栏 (契约守护跃迁)    →   提案层：约束生成 + 策略即代码
防体系异化 (体验作为裁判)      →   决策层：GitOps + 渐进式交付
```

---

## 第 1 层：感知层 — 放弃自研算法，集成工业级异常检测

### 1.1 当前状态

`packages/core/src/sandbox/health-gate.ts` 已实现复合健康度 SLA（memory ≤85%, traversal p99 ≤2s, revert ≤30%），但异常检测逻辑是简单的阈值比较。无动态基线、无漂移适应、无多维归因。

### 1.2 优化方案

| 举措 | 工具 | 替换对象 | 收益 |
|------|------|----------|------|
| 动态异常检测 | **Merlion**（Salesforce 开源）或 **Alibi Detect**（Seldon 开源） | 自研 threshold 比较 | 内置概念漂移校准、时序分解，3+ 月研发 → 1 周集成 |
| 多维根因定位 | **Shapley Value**（SHAP 或自研轻量实现） | 无（新增能力） | 量化各维度（团队/文件/时段）对异常的贡献度，秒级定位根因 |
| 监控对接 | 通过 **Prometheus Exporter** 暴露指标 | 仅内部 MetricsCollector | 融入现有监控栈（Grafana → AlertManager），不作为独立服务 |

### 1.3 执行步骤

```
1. npm install salesforce-merlion (Python 侧，通过 child_process 桥接)
   或 npm install alibi-detect-node (若有 Node 绑定)
2. 新建 packages/core/src/perception/merlion-bridge.ts
   - 封装 Merlion 的 DefaultDetector + AutoEncoder
   - 输入：DashboardSnapshot 时序（health-gate metrics + ruleEfficacy 趋势）
   - 输出：AnomalyScore + SeasonalityDecomposition
3. 新建 packages/core/src/perception/shapley-attributor.ts
   - 输入：异常时刻的 multi-dim breakdown
   - 输出：{ dimension: "team", contribution: 0.42 }[]
4. HealthGate.assess() 替换为 Merlion 输出
5. Dashboard 新增 perceptionPanel：异常热力图 + Shapley 归因瀑布图
```

**验收**：
- 冲突率突增时，Merlion 自动检测（无需人工设阈值）
- dashboard 显示 5 分钟内冲突率异常 → 根因贡献度："file: node_modules/**" 78%, "team: frontend" 15%

---

## 第 2 层：提案层 — 从"JSON DSL + LLM 填充"到"约束生成 + 策略即代码"

### 2.1 当前状态

`packages/core/src/constraints/dsl-compiler.ts` 已将约束编译为 AstTemplate，但规则载体仍是自定义 JSON DSL。LLM 生成规则没有结构化输出保证。

### 2.2 优化方案

| 举措 | 工具 | 替换对象 | 收益 |
|------|------|----------|------|
| 规则表达标准化 | **OPA Rego** 或 **CUE** | 自定义 JSON DSL (`AstTemplate.templateDsl`) | 形式化验证、复用安全合规策略库、减少自研语法维护 |
| LLM 输出强约束 | **Instructor**（Python）/ **Outlines** 或 TypeScript 端 **Zod-to-Structured-Output** | `validateInput()` schema 事后校验 | 生成阶段保证 100% 符合 Schema，格式错误率 → 0 |
| Prompt Pipeline | **DSPy** 框架理念（TypeScript 端自研轻量版） | 手写 Prompt + 硬编码 Few-shot | 历史审核通过案例自动编译为 Few-shot，Prompt 调优从"拍脑袋"变"可优化的 Pipeline" |

### 2.3 执行步骤

```
1. 新建 packages/core/src/proposal/rego-compiler.ts
   - JSON DSL → Rego policy 的编译器
   - 保留现有 DSL 作为输入语法，输出标准 Rego
   - OPA WASM 运行时在 Node.js 中直接执行（npm: @open-policy-agent/opa-wasm）

2. 新建 packages/core/src/proposal/structured-generator.ts
   - 使用 OpenAI Structured Outputs (gpt-4o + response_format: json_schema)
   - 替换当前 validateInput() 的"事后丢弃"校验
   - 定义 RegPolicySchema = { id, pattern, rego, suggestion, riskLevel }

3. 新建 packages/core/src/proposal/prompt-pipeline.ts
   - Few-shot 自动编译：从 RuleVersion 表取 approved=true 的历史规则
   - 按 category 聚类 → 选择最相似的 3 个 case → 注入 prompt
   - 支持 A/B 测试（复用 PolicyVariant 模型）

4. packages/core/src/constraints/dsl-compiler.ts 保留作为"输入语法兼容层"
   但底层执行切换为 Rego 运行时

5. 新增 MCP 工具：proposal_generate_rule（输入自然语言描述 → Instructor 生成 Rego → 返回预览）
```

**验收**：
- 输入"禁止在 React 组件中使用 any 类型" → LLM 输出 100% 合法 Rego policy
- 格式错误率：0%（结构化输出保证）
- 首次生成准确率：> 80%（DSPy Few-shot 自动编译后）

---

## 第 3 层：验证层 — 嫁接 CI/CD 与混沌工程生态

### 3.1 当前状态

`packages/core/src/sandbox/cow-sandbox.ts` + `self-heal-loop.ts` 已实现沙箱验证，但测试数据是手动构造的。无真实流量负样本、无属性测试、无 CI 集成。

### 3.2 优化方案

| 举措 | 工具 | 替换对象 | 收益 |
|------|------|----------|------|
| 负样本自动化 | **Feature Flag 影子模式**（复用现有 `ShadowLog` 表） | 手动维护"良性易误报变更集" | 生产流量并行运行新旧策略，数据鲜活度 ↑，维护成本 ↓ |
| 边界测试标准化 | **FastCheck**（JS 属性测试库） | `vitest` 手写边界用例 | 定义不变量 → 自动生成数千个随机测试用例证伪 |
| 回归测试即服务 | **GitHub Action** 插件 | 独立沙箱验证脚本 | 每次 PR 创建时自动验证，结果以 Comment 回写 |

### 3.3 执行步骤

```
1. npm install fast-check --save-dev

2. 新建 packages/core/src/verification/property-tests.ts
   - 不变量 1："新规则不应阻塞已知安全操作"
   - 不变量 2："合并两个已审批规则不应产生冲突"
   - 不变量 3："自愈 Patch 应用后 countValidationFailures ≤ 应用前"
   - 使用 fc.property() + fc.assert() 运行

3. 扩展现有 ShadowLog → ShadowVerificationService
   - 从 ShadowLog 表中取 wouldBlock=true 的 case
   - 回放这些 case 作为 CI 的回归测试数据

4. 新建 .github/workflows/rule-verify.yml
   - trigger: PR 涉及 packages/core/src/constraints/ 或 prisma/schema.prisma
   - steps: build → verify:shadow → verify:property → comment PR
   - 输出：通过/失败的 case 数 + 属性测试覆盖率

5. packages/core/src/sandbox/self-heal-loop.ts 的 validatePatch() 
   集成 fast-check 属性测试（仅改验证步骤，不改沙箱逻辑）
```

**验收**：
- 每个 PR 自动运行属性测试（≥ 500 个随机用例）
- CI Comment 显示："✅ 属性测试 500/500 通过 | 影子回放 142 条无新增误报"

---

## 第 4 层：决策层 — 从"独立 Dashboard"到"GitOps + 渐进式交付"

### 4.1 当前状态

`packages/core/src/dashboard/metrics-collector.ts` 已实现完整 KPI 聚合（cognition/amygdala/selfHeal/arbitration/governance/ruleEfficacy），但需要一个独立 server 暴露 API。这违反了"不强建新平台"原则。

### 4.2 优化方案

| 举措 | 工具 | 替换对象 | 收益 |
|------|------|----------|------|
| 废除独立 Dashboard | **GitHub PR** 作为决策界面 | 独立 Web Dashboard / `dashboard/server.ts` | 零前端开发，融入开发者原生 Code Review 工作流 |
| 渐进式生效 | **Flagger** 或 **Argo Rollouts** 金丝雀发布 | 人工确认后全量 | 5%→20%→50%→100% 自动扩缩容，任一阶段恶化自动回滚 |
| 审计即 Git History | **Git Blame / Log** | 独立审计模块 | 变更理由、审批人、生效时间天然记录在 Git Commit 中 |

### 4.3 执行步骤

```
1. 新建 packages/core/src/delivery/gitops-engine.ts
   - 将 MetricsCollector.snapshot() 输出渲染为 Markdown PR Description
   - 包含：证据链（Shapley 归因图） + 仿真报告（ShadowLog 统计） + 风险评估
   - 使用 GitHub REST API (octokit) 创建 Evolution Proposal PR

2. 新建 packages/core/src/delivery/canary-controller.ts
   - 定义 CanaryStage: { percentage: 5 | 20 | 50 | 100, durationHours: number, checkFn }
   - 每个阶段结束后调用 HealthGate.assess() → 通过则自动进入下一阶段
   - 恶化则自动调用 governance_rollback_arbitration
   - PolicyEngine.loadPolicies() 支持 canaryFilter(repoId) → 新策略仅对 % 仓库生效

3. 改造 dashboard 输出：
   - 保留 metrics-collector.ts 作为数据聚合层（核心能力）
   - 删除 dashboard/server.ts（独立 HTTP 服务）
   - 新增 MCP 工具 governance_snapshot → 供 IDE/CLI 查询（非独立 web 页面）
   - 输出目标变更：DashboardSnapshot → PR Description Markdown

4. 审计即 Git：
   - 已有 RuleVersion 模型（规则版本历史）→ 直接对应 Git commit
   - PolicyVariant 模型 → 对应 PR 的 A/B test
   - 删除 src/core/audit/ 下独立审计模块（已有 Git 天然审计）
```

**验收**：
- PR #42: "新增 React Hooks 依赖检查规则" → Description 含 Shapley 归因图、影子回放 200 条无误报
- 合并后自动进入金丝雀阶段：5% repos, 24h → 全部绿灯 → 自动扩大到 100%
- 任何回滚操作 → `git revert` 即回滚，无需独立操作界面

---

## 克制红线（对 OPTIMIZATION.md 红线的继承与强化）

- ❌ 不为 Merlion/Rego/Flagger 写自研替代（组装优于自研）
- ❌ 不新增独立 Web 服务（GitOps PR 替代一切 Dashboard）
- ❌ 不添加 >4 个 MCP 工具（保持 MCP 适配器 ≤ 80 行承诺）
- ❌ 不删除已有测试覆盖的代码，仅新增替代路径
- ❌ 不在 `packages/core/src` 超过 50 文件（当前 28）
- ❌ 不让 PR CI 验证超过 2 分钟（属性测试 + 影子回放合计）

---

## 实施优先级

```
┌──────────────────────────────────────────────────────────┐
│  立即 (本周)               │  短期 (2 周)                │
│  1.3 影子验证自动化        │  2.1 FastCheck 属性测试     │
│  1.2 Shapley 归因 (轻量)   │  3.2 Rego 编译器            │
│  4.1 GitOps PR 引擎        │  3.3 Instructor 结构化输出  │
│  4.2 金丝雀控制器          │  1.1 Merlion 集成 (可选)    │
├────────────────────────────┼─────────────────────────────┤
│  中期 (1 月)               │  持续                        │
│  2.2 DSPy Prompt Pipeline │  3.1 CI Action 封装          │
│  4.3 删除独立审计/服务器   │  克制复杂性：每轮优化后评估 │
└────────────────────────────┴─────────────────────────────┘
```

---

## 当前代码 → 目标代码映射

| 当前文件 | 操作 | 目标 |
|----------|------|------|
| `packages/core/src/sandbox/health-gate.ts` | **扩展** | 对接 Merlion 输出 |
| `packages/core/src/dashboard/metrics-collector.ts` | **扩展** | 输出 PR Markdown 格式 |
| `packages/core/src/constraints/dsl-compiler.ts` | **保留为兼容层** | 输出目标切换为 Rego |
| `packages/core/src/sandbox/cow-sandbox.ts` | **不变** | 沙箱逻辑不变 |
| `packages/core/src/sandbox/self-heal-loop.ts` | **扩展** | 验证步骤集成 fast-check |
| `packages/core/src/audit/roi-auditor.ts` | **删除** | Git History 天然审计 |
| `packages/core/src/audit/satisfaction-tracker.ts` | **保留** | 开发者满意度是唯一需要独立追踪的"软指标" |
| `prisma/schema.prisma` | **不变** | PolicyVariant + ShadowLog 已满足新方案需求 |
| — | **新建** | `packages/core/src/perception/merlion-bridge.ts` |
| — | **新建** | `packages/core/src/perception/shapley-attributor.ts` |
| — | **新建** | `packages/core/src/proposal/rego-compiler.ts` |
| — | **新建** | `packages/core/src/proposal/structured-generator.ts` |
| — | **新建** | `packages/core/src/proposal/prompt-pipeline.ts` |
| — | **新建** | `packages/core/src/verification/property-tests.ts` |
| — | **新建** | `packages/core/src/delivery/gitops-engine.ts` |
| — | **新建** | `packages/core/src/delivery/canary-controller.ts` |
| — | **新建** | `.github/workflows/rule-verify.yml` |

---

## 关键依赖（npm install 待执行）

```
npm install fast-check --save-dev              # 属性测试
npm install @open-policy-agent/opa-wasm        # Rego WASM 运行时
npm install @octokit/rest                      # GitHub API (PR 创建)
npm install @instructor-ai/instructor-js       # 结构化输出 (若有 JS 绑定)
```

---

## 终极警示

> **复杂度是系统的敌人，克制比进化更难。**
>
> 每一行代码都要回答三个问题：
> 1. 能否用现有工具替代？（组装优先）
> 2. 能否嵌入现有工作流？（不建新平台）
> 3. 开发者会因此更轻松吗？（体验为裁判）
>
> 当现有引擎能解决 90% 问题时，不为剩余 10% 强行引入新范式。

---