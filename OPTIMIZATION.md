# OPTIMIZATION.md — 四维进阶优化矩阵落地计划

> **原则：克制比进化更难。当现有引擎能解决 90% 问题时，
> 不为剩余 10% 边缘案例强行引入新范式。**

---

## 维度 1：策略反馈闭环

**痛点**：策略生效全靠人工直觉评估。调参像打地鼠——关一个误报，不知道是否开了新漏洞。
**目标**：数据倒逼策略精简，变更后果事前可见。

### 1.1 规则效能仪表盘

**现状**：`MetricsCollector` 已有 `topMatchedPolicies` 但只有命中计数。
**缺口**：缺少每策略的误报率、采纳率、覆盖文件数。

| 改动 | 位置 | 工作量 |
|------|------|--------|
| Rule 表增加 `hitCount` / `falsePositiveCount` / `adoptedCount` 计数器 | Prisma schema + `rule-repo.ts` | 小 |
| `PolicyEngine.evaluate()` 每次命中自动 +1 hitCount | `policy-engine.ts` | 1 行 |
| `confirm_rule` reject → falsePositiveCount++ | `src/transport/mcp/` handler | 2 行 |
| `confirm_rule` accept → adoptedCount++ | 同上 | 2 行 |
| Dashboard 暴露 `ruleEfficacy` 面板（采纳率排序 TOP/BOTTOM 5） | `metrics-collector.ts` + `types.ts` | 中 |

**验收**：查询 `GET /api/snapshot` 返回 `ruleEfficacy: { ruleId, hitCount, fpRate, adoptRate }[]`

### 1.2 配置 A/B 测试

**现状**：`PolicyEngine` 只能加载一组策略。无法对比"新策略比旧策略少多少误报"。
**缺口**：缺少策略变体对比机制。

| 改动 | 位置 | 工作量 |
|------|------|--------|
| 新增 `PolicyVariant` 类型：`{ id, basePolicyId, variant: "A"|"B", overrides }` | `types.ts` | 小 |
| `PolicyEngine.evaluate()` 支持返回两组结果（双轨并行） | `policy-engine.ts` | 中 |
| Dashboard 暴露 A/B 对比指标 | `metrics-collector.ts` | 小 |

**验收**：创建 A/B 变体后，dashboard 显示两条策略的命中/误报/采纳对比。

### 1.3 语义化 Diff 预览

**现状**：`confirm_rule` 只展示规则 pattern，开发者看不到"这条规则会让我的代码变成什么样"。
**缺口**：缺少规则生效前的代码变化预览。

| 改动 | 位置 | 工作量 |
|------|------|--------|
| 复用 `CowSandbox` 生成 Preview：取命中文件 → 应用规则 → 返回 before/after diff | 新建 `src/core/preview/` | 中 |
| MCP 工具新增 `preview_rule` — 输入 ruleId + filePath → 返回 unified diff | `mcp-schemas.ts` + handler | 小 |

**验收**：`preview_rule { ruleId, filePath }` 返回 `{ before, after, diff }`

---

## 维度 2：重构触发边界

**痛点**：自愈循环只靠 confidence 门控，不知道系统整体是否健康。
**目标**：复合 SLA 指标驱动精准重构，而非固定周期。

### 2.1 复合健康度 SLA

**现状**：`SelfHealController` 和 `SafetyValve` 各自独立。无系统级健康度概念。
**缺口**：缺少聚合的"是否可以安全自愈"判断。

| 改动 | 位置 | 工作量 |
|------|------|--------|
| 新增 `HealthGate` 类：聚合 memory% + traversal latency p99 + revert rate → 允许/暂停 | 新建 `sandbox/health-gate.ts` | 中 |
| `SelfHealController.heal()` 前置 health gate 检查 | `self-heal-loop.ts` | 小 |
| Dashboard 暴露 `healthGate: { status, metrics }` | `types.ts` + `metrics-collector.ts` | 小 |

**验收**：当 revert rate > 30% 或 traversal p99 > 2s 时，自愈自动暂停并告警。

### 2.2 最小可验证单元拆解

**现状**：自愈对整个文件生成 Patch，没有按"最小可验证 diff"拆解。
**缺口**：大 Patch 失败率高，应该拆成独立的小 Patch 逐个验证。

| 改动 | 位置 | 工作量 |
|------|------|--------|
| `SelfHealController` 支持 `atomicMode`：每个 ValidationFailure 独立沙箱验证 | `self-heal-loop.ts` | 中 |
| 拆解后的 Patch 按 nodeId 分组，每组独立 snapshot → apply → validate → commit/revert | 同上 | 中 |

**验收**：一个文件 5 个违规 → 生成 5 个独立 Patch → 逐个验证 → 3 个通过 2 个回滚 → 返回 `PARTIAL` + 明细。

### 2.3 同步模式逃生通道

**现状**：自愈是异步的。如果 Agent 等待结果超时，没有降级方案。
**缺口**：缺少"紧急同步模式"——跳过沙箱，直接返回 patch 建议。

| 改动 | 位置 | 工作量 |
|------|------|--------|
| `SelfHealController.heal()` 增加 `mode: "async" | "sync_escape"` 参数 | `self-heal-loop.ts` | 小 |
| sync_escape 模式：跳过沙箱验证，直接返回 patches + confidence，标记 `SAFE_MODE` | 同上 | 小 |

**验收**：sync_escape 模式下 < 50ms 返回 patch 建议（不做沙箱验证）。

---

## 维度 3：范式跃迁护栏

**痛点**：新约束 DSL 替换旧 JSON 约束时，直接切换。出问题只能回滚代码。
**目标**：新范式平稳过渡——影子模式前置 + 人类否决权是不可逾越的底线。

### 3.1 强制影子模式前置

**现状**：`ConstraintArbitrator` 的 `AUTORESOLVE` 直接生效。无影子运行能力。
**缺口**：新规则（或新 DSL 约束）必须先影子运行 7 天，期间不阻断，只记录差异。

| 改动 | 位置 | 工作量 |
|------|------|--------|
| 新增 `ShadowMode` 标记：Policy/Rule 带 `shadowUntil: Date` 字段 | Prisma schema + types | 小 |
| `PolicyEngine.evaluate()` 对 shadow 策略：记录命中但不阻断 | `policy-engine.ts` | 中 |
| Dashboard 新增 `shadowPanel`：影子规则命中数、与生效规则差异 | `metrics-collector.ts` | 中 |
| 7 天期满后自动解除 shadow → 告警通知 | `rule-immune.ts` 扩展 | 小 |

**验收**：创建规则时设置 shadow 7 天 → dashboard 显示影子命中 → 7 天后自动激活。

### 3.2 人类否决权协议

**现状**：`Arbitrator.AUTORESOLVE` 不经过人类。`confirm_rule` 的 OVERSIDE 只能拒绝单条。
**缺口**：缺少"暂停仲裁器"和"批量回滚仲裁结果"的人类超级权限。

| 改动 | 位置 | 工作量 |
|------|------|--------|
| 新增 MCP 工具 `governance_pause_arbitrator` — 暂停自动仲裁 X 分钟 | `mcp-schemas.ts` + handler | 小 |
| 新增 MCP 工具 `governance_rollback_arbitration` — 回滚指定时间窗口内的 AUTORESOLVE 结果 | 同上 | 中 |
| `ConstraintArbitrator` 检查暂停标志（内存 flag） | `arbitrator.ts` | 1 行 |

**验收**：`governance_pause_arbitrator { minutes: 30 }` → 30 分钟内所有仲裁必须人工确认。

### 3.3 认知迁移成本评估

**现状**：从旧约束 JSON 升级到 DSL 编译器时，没有量化"迁移收益"。
**缺口**：缺少迁移前后指标对比。

| 改动 | 位置 | 工作量 |
|------|------|--------|
| 新增 `MigrationReport`：迁移前（JSON 约束数 / 误报率）vs 迁移后（DSL 约束数 / 误报率） | `types.ts` | 小 |
| `dsl-compiler.ts` 迁移时自动生成 report | `dsl-compiler.ts` | 小 |
| Dashboard 暴露迁移对比 | `metrics-collector.ts` | 小 |

**验收**：运行迁移后，dashboard 显示"约束数: 12→34 ↑183%，误报率: 15%→8% ↓47%"

---

## 维度 4：防体系异化

**痛点**：125 个 .ts 文件，585KB 代码。优化本身可能成为新负担。
**目标**：克制复杂度，确保优化始终服务于人。

### 4.1 优化 ROI 定期审计

**现状**：没有机制评估"最近加的代码是否真的带来了价值"。
**缺口**：缺少模块级 ROI 评估。

| 改动 | 位置 | 工作量 |
|------|------|--------|
| 新增 `src/core/audit/roi-auditor.ts`：扫描每个模块 → 评估（被调用次数 / 代码行数 / 最后修改日期 / 关联 bug 数） | 新建 | 中 |
| Dashboard 新增 ROI 面板：低价值模块标记（3 个月无调用 + 无测试 → 候选删除） | `metrics-collector.ts` | 小 |
| CLI 新增 `npx rule-engine audit` 命令 | `cli/cli.ts` | 小 |

**验收**：`audit` 命令输出每个模块的 ROI 评分，< 0.3 的标记为 `LOW_VALUE`。

### 4.2 "足够好"原则守护

**现状**：无开发者满意度指标。技术指标优异不等于开发者满意。
**缺口**：缺少人性化护栏。

| 改动 | 位置 | 工作量 |
|------|------|--------|
| 新增 MCP 工具 `developer_satisfaction` — 接受 1-5 评分 + 自由文本 | `mcp-schemas.ts` | 小 |
| 当满意度连续 2 周低于 3 分时，dashboard 顶部显示警告横幅 | `types.ts` + `metrics-collector.ts` | 小 |
| 新增 `GOVERNANCE_MAX_COMPLEXITY` 配置：复杂度超过阈值 → 禁止新增功能，只允许修复 | `types.ts` | 小 |

**验收**：dashboard 顶部显示当前满意度趋势。满意度 < 3 时，所有新功能提案被自动标记为 `requires_justification`。

---

## 实施优先级

```
┌─────────────────────────────────────────────────────┐
│  立即 (本周)          │  短期 (2 周)               │
│  1.1 规则效能面板      │  2.1 复合健康度 SLA        │
│  1.2 A/B 测试框架     │  2.2 最小可验证单元        │
│  3.1 影子模式         │  3.2 人类否决权            │
│  4.1 ROI 审计         │  1.3 Diff 预览             │
├───────────────────────┼────────────────────────────┤
│  中期 (1 月)          │  持续                       │
│  2.3 同步逃生通道      │  4.2 满意度兜底            │
│  3.3 迁移成本评估      │  所有维度定期复盘           │
└───────────────────────┴────────────────────────────┘
```

---

## 克制红线

以下场景 **不可** 引入新范式，现有代码已足够：

- ❌ 为 < 5% 的罕见 AST 节点类型增加专用约束模板
- ❌ 为实现"完全无人值守自愈"移除所有人类确认环节
- ❌ 为 Dashboard 增加超过 4 个面板（认知负载上限：4）
- ❌ 任何导致 `packages/core/src` 文件数超过 150 的改动
- ❌ 任何导致测试运行时长超过 30s 的改动
