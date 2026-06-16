# TRACEABILITY.md — 理论↔工程 双向追溯矩阵

> **战略层（大脑三层+四维矩阵）是 North Star，回答"去哪里"。**
> **战术层（前人肩膀工程方案）是 Implementation Spec，回答"怎么安全到达"。**
> **两者是同一目标的两面，不存在冲突。**

---

## Sprint Planning 速查

| 总组件数 | 可并行组数 | 关键路径长度 | 预估总点数 | 阻断项 |
|---------|----------|------------|----------|-------|
| 13 | 4 组 | 4 个 Sprint | ~38 点 | 0 |

---

## 主映射表：理论框架 → 工程组件

> **Sprint 状态图例**：🔲 To Do | 🚧 In Progress | ✅ Done | ⏳ Blocked

| # | 理论层 | 四维矩阵 | 工程组件 | 文件 | 复杂度 | 前置依赖 | 验证手段 | Sprint |
|---|---|---|---|---|---|---|---|---|
| 1 | 层级一：参数自整定 | 策略反馈闭环 | MerlionBridge 动态基线 | `packages/core/src/perception/merlion-bridge.ts` | **M** (3点) | — | 单元测试：输入100点正弦波→zScore<1 | 🔲 |✅ |
| 2 | 层级一 | 策略反馈闭环 | ShapleyAttributor 根因定位 | `packages/core/src/perception/shapley-attributor.ts` | **S** (2点) | #1 | 单元测试：3维输入→贡献度归一化为1.0 | 🔲 |✅ |
| 3 | 层级一 | 策略反馈闭环 | Rule+3 counters + 效能面板 | `prisma/schema.prisma` + `metrics-collector.ts` | **S** (2点) | — | `prisma generate`无报错 + ruleEfficacy查询返回正确fpRate | ✅ |
| 4 | 层级二：规则权重自学习 | 重构触发边界 | RegoCompiler JSON→Rego | `packages/core/src/proposal/rego-compiler.ts` | **L** (5点) | — | 输入SECURITY_TEMPLATES[0]→输出合法Rego policy | 🔲 |✅ |
| 5 | 层级二 | 重构触发边界 | StructuredGenerator Zod约束 | `packages/core/src/proposal/structured-generator.ts` | **M** (3点) | — | 故意输入错误JSON→validateOutput返回{success:false} | 🔲 |✅ |
| 6 | 层级二 | 重构触发边界 | PromptPipeline Few-shot | `packages/core/src/proposal/prompt-pipeline.ts` | **M** (3点) | #5 | 添加3个示例→compilePrompt返回top-3按相似度排序 | 🔲 |✅ |
| 7 | 层级二 | 重构触发边界 | PropertyTests 3条不变量 | `packages/core/src/verification/property-tests.ts` | **M** (3点) | #4 | checkProperty(no-safe-op-blocked, 500)→0 failures | 🔲 |✅ |
| 8 | 层级三：规则自动生成 | 范式跃迁护栏 | ShadowVerifier 影子回放 | `packages/core/src/verification/shadow-verifier.ts` | **M** (3点) | #3 (ShadowLog表) | 回放100条shadow log→newFalsePositives=0 | 🔲 |✅ |
| 9 | 层级三 | 范式跃迁护栏 | GitOpsEngine PR生成 | `packages/core/src/delivery/gitops-engine.ts` | **M** (3点) | #3 | 输入DashboardSnapshot→输出PR body含Mermaid图 | 🔲 |✅ |
| 10 | 层级三 | 范式跃迁护栏 | CanaryController 金丝雀 | `packages/core/src/delivery/canary-controller.ts` | **L** (5点) | #8 + #9 | 模拟5%→20%→50%→100%推进→各阶段健康检查正确触发 | 🔲 |✅ |
| 11 | 层级三 | 范式跃迁护栏 | CI Workflow | `.github/workflows/rule-verify.yml` | **S** (2点) | #7 + #8 | 手动触发workflow→PR comment含property+shadow结果 | 🔲 |✅ |
| 12 | 防体系异化 | 体验作为裁判 | SatisfactionTracker 满意度 | `packages/core/src/audit/satisfaction-tracker.ts` | **S** (2点) | — | 录入5条评分→trend="DECLINING"→needsAttention=true | 🔲 |✅ |
| 13 | 防体系异化 | 体验作为裁判 | PolicyVariant A/B 测试 | `prisma/schema.prisma` + `metrics-collector.ts` | **S** (2点) | #3 | 创建A/B变体→dashboard显示对比指标 | ✅ |

---

## 依赖拓扑（关键路径）

```
Sprint 1 (并行组 A)          Sprint 2 (并行组 B)         Sprint 3 (串行)           Sprint 4 (串行)
┌─────────────────┐         ┌─────────────────┐        ┌──────────────────┐      ┌──────────────────┐
│ #1 Merlion M    │         │ #7 Property M   │        │ #8 ShadowVer M   │      │ #10 Canary L     │
│ #3 Counters S ✅│         │ #4 Rego L       │        │ #9 GitOps M      │─────▶│ #11 CI S         │
│ #4 Rego L       │────────▶│ #5 StructGen M  │        │                  │      │ (收尾+联调)      │
│ #5 StructGen M  │         │ #6 Pipeline M   │        │                  │      └──────────────────┘
│ #12 SatTrack S  │         └─────────────────┘        └──────────────────┘
└─────────────────┘
        │
        └──▶ #2 Shapley S (依赖#1)
```

---

## 反向索引：工程组件 → 理论支撑

| 工程组件 | 服务目标 | 解决的原痛点 |
|----------|----------|------------|
| `perception/merlion-bridge.ts` | 层级一：参数自整定 → 策略反馈闭环 | 调参靠经验，易打地鼠 |
| `perception/shapley-attributor.ts` | 层级一：参数自整定 → 策略反馈闭环 | 只知异常，不知根因 |
| `proposal/rego-compiler.ts` | 层级二：规则权重自学习 → 重构触发边界 | 自定义 JSON DSL，缺乏形式化验证 |
| `proposal/structured-generator.ts` | 层级二：规则权重自学习 → 重构触发边界 | LLM 生成格式错误，事后丢弃 |
| `proposal/prompt-pipeline.ts` | 层级二：规则权重自学习 → 重构触发边界 | 手写 Prompt 调优不稳定 |
| `verification/property-tests.ts` | 层级二：规则权重自学习 → 重构触发边界 | 边界测试靠人工 ±20% 扰动 |
| `verification/shadow-verifier.ts` | 层级三：规则自动生成 → 范式跃迁护栏 | 新范式直接切换，无安全网 |
| `delivery/gitops-engine.ts` | 层级三：规则自动生成 → 范式跃迁护栏 | 独立 Dashboard 脱离开发者工作流 |
| `delivery/canary-controller.ts` | 层级三：规则自动生成 → 范式跃迁护栏 | 人工确认后全量，爆炸半径大 |
| `.github/workflows/rule-verify.yml` | 层级三：规则自动生成 → 范式跃迁护栏 | 验证系统独立于 CI |
| `audit/satisfaction-tracker.ts` | 防体系异化 → 体验作为裁判 | 优化本身成为新负担 |
| Git History 审计 | 防体系异化 → 体验作为裁判 | 审计即 Git，无需额外模块 |
| `prisma/schema.prisma` (PolicyVariant) | 防体系异化 → 体验作为裁判 | A/B 测试框架缺失 |
| `dashboard/metrics-collector.ts` | 跨层基础设施 | 所有维度需要可观测性 |

---

## 三省：对三个"认知错觉"的工程回应

### 错觉一："实现方式 ≠ 目标变更"

| 原方案动作 | 修正后的落地姿势 | 为什么更安全 |
|------------|-----------------|------------|
| AutoTuner 裸写 config.json | GitOps PR + CanaryController | PR Review + 金丝雀 → 变更可审计、可回滚 |
| 规则直接生效 | ShadowLog 7 天前置 + 影子回放 | 数据证明无害后才激活 |
| LLM 自由生成规则 | StructuredGenerator (Zod 约束) | 100% 格式正确，零事后丢弃 |

### 错觉二："工具替换 ≠ 架构降级"

| 原方案组件 | 工具替换 | 为什么升维而非降级 |
|------------|---------|-------------------|
| 自建 Web Dashboard | GitOps PR as decision UI | 零前端开发，融入原生 Code Review 工作流 |
| 自定义 JSON DSL | OPA Rego 标准语法 | 复用 OPA 生态安全策略库，形式化验证开箱即用 |
| 自研异常检测 | Merlion 风格动态基线 | 3 月算法研发 → 1 周集成，且内置漂移适应 |

### 错觉三："安全加固 ≠ 功能阉割"

| 被否决的激进设计 | 替代的安全设计 | 守护的理论原则 |
|-----------------|--------------|--------------|
| 24h 自动合并 | CanaryController 5%→20%→50%→100% | 契约守护跃迁——每一步都需数据验证 |
| LLM 无约束生成 | StructuredGenerator Zod Schema | 数据驱动——不适合生成阶段引入不确定性 |
| 全量生效 | 渐进式 + 自动回滚 | 防体系异化——爆炸半径必须可控 |

---

## 心法对照

```
理论层 (North Star)              战术层 (Implementation Spec)
─────────────────────            ─────────────────────────────
"让规则的价值由修复采纳率决定"    →   hitCount/fpRate/adoptRate 计数器
"用内存、耗时、失败率替代固定周期"  →   HealthGate + MerlionBridge 动态基线
"影子模式与人类否决权不可逾越"    →   ShadowLog 7天前置 + CanaryController 自动回滚
"当开发者满意度下降时立即暂停"    →   SatisfactionTracker + 满意度 < 3 自动告警
```

---

## 适用范围

本追溯矩阵覆盖 `packages/core/src` 中所有四维优化矩阵与四层流水线的实现。

**双向追溯规则**：
- 每引入一个开源工具，必须写明它服务于哪个理论目标（层级+维度）
- 每提出一个新理论指标，必须同步评估是否有成熟工程组件可支撑
- 每变更一个 prisma model，必须在追溯表中出现（数据模型是核心交付物）

---