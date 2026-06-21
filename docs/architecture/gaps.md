# Governflow 架构缺口分析

> 版本：v1.0.0-alpha.9 · 最后更新：2026-06-21
>
> 适用范围：`src/` 规则治理内核 + `packages/core/` 协议无关内核
>
> 阅读对象：架构师、核心开发者

---

## 一、现状概述

Governflow 已经建立了一个**四层流水线**的 AI 代码治理架构（感知 → 提案 → 验证 → 决策），具备：

- 完整的认知图数据模型（`PATTERN` / `INTENT` / `CONSTRAINT` / `HEURISTIC` 四类节点 + `CAUSES` / `PRECEDES` / `MUTEX` / `GENERALIZES` / `REFINES` 五类边关系）
- 三种传输协议（MCP stdio / HTTP 流 / CLI）
- 完整的 SQLite + Prisma 数据层（12 张表覆盖规则、差异、冲突、认知节点、审批、策略、指标等）
- 事件驱动的 DI 容器（`packages/core/src/di/container.ts`）
- 内置策略引擎（5 条默认策略，JSON 可扩展）
- 多种基础模块：AST 解析、规则免疫、沙箱系统、约束 DSL、GitOps、金丝雀发布、向量嵌入

但在**实现完整度**、**数据流闭环**、**用户界面**、**多语言覆盖**等方面存在明确的可改进空间。本文档将这些缺口按严重性分级。

---

## 二、缺口分级说明

| 级别 | 颜色 | 含义 | 建议处理时间 |
|------|------|------|-------------|
| 🔴 P0 | Critical | 功能流程断裂，影响核心价值主张 | 立即修复 |
| 🟠 P1 | High | 功能存在但效果不足，影响可用性 | 短期修复（1-2 周） |
| 🟡 P2 | Medium | 功能存在但覆盖不足，影响扩展性 | 中期增强（1-2 月） |
| 🟢 P3 | Low | 可选增强，不影响核心功能 | 长期规划 |

---

## 三、详细缺口分析

### 🔴 P0-1：规则生成通道不完整

**问题描述**

`capture_diff` 工具能够将代码变化记录到认知图（创建 `PATTERN` 节点和 `INTENT` 节点），但**不会自动生成 `Rule` 对象**。

当前数据流：

```
代码变化 → parseToAST() → computeDiffWithFallback() → AtomicOp[]
          ↓
    upsertCognitionClosure() → PATTERN 节点 + INTENT 节点
          ↓
    processSilent() / buildConfirmCard() → 提示文字
          ↓
    ❌  终止 — 不会写入 Rule 表
```

**相关代码位置**

- 差异捕获入口：[src/transport/mcp/capture-diff.ts](file:///d:/Desktop/mcp/src/transport/mcp/capture-diff.ts#L1-L130) — 参见 `handleCaptureDiff` 函数
- 认知闭合写入：[src/transport/mcp/capture-diff.ts:upsertCognitionClosure()](file:///d:/Desktop/mcp/src/transport/mcp/capture-diff.ts#L41-L119)
- 旧版规则生成器（已弃用）：[src/analysis/rule-generator.ts](file:///d:/Desktop/mcp/src/analysis/rule-generator.ts#L1-L63) — 文件头部声明 `@deprecated LEGACY ENGINE`
- 规则仓库 API：[src/data/rule-repo.ts](file:///d:/Desktop/mcp/src/data/rule-repo.ts)
- 认知图类型定义：[src/data/cognition-types.ts](file:///d:/Desktop/mcp/src/data/cognition-types.ts#L1-L90)

**根本原因**

旧版规则生成器基于简单的"阈值触发"（distinctFiles ≥ N 且 repeatCount ≥ M），粒度太粗，不适用于认知图驱动的新模式，但新的"认知图 → 规则"通道尚未实现。

**影响范围**

- 整个系统的"学习能力"被切断——代码变化被观察到，但无法总结为可复用的规则
- 用户必须通过 `confirm_rule` 手动接受规则，但没有规则可以确认
- 规则免疫循环（`rule-immune.ts`）、策略引擎（`policy-engine.ts`）、规则匹配（`rule-matcher.ts`）都依赖 `Rule` 表有数据——当前这些模块的实际效果会被空数据稀释

**修复建议**

新增 `cognition-rule-generator.ts`，实现 `PATTERN/INTENT → CONSTRAINT → Rule` 的完整生成通道。核心逻辑：

```
1. 从 CognitionRepository 读取最近 N 个 PATTERN 节点（按 occurrenceCount 排序）
2. 同一 semanticHash 且 occurrences > 阈值的节点 → 自动生成为 CONSTRAINT 节点
3. CONSTRAINT 节点通过 Repository 写入 Rule 表（status: "pending", shadowUntil 设置）
4. RuleImmuneEngine.runCycle() 定期扫描 pending 规则 → 经影子模式验证后升级为 active
5. 通过 eventBus.emit("rule.auto.generated") 通知外部系统（可被 webhook/dashboard 消费）
```

**开发量预估**：200-300 行 TypeScript（新增文件 + 修改 `capture-diff.ts` 若干行）

---

### 🔴 P0-2：规则匹配基于简单关键词，缺失语义增强

**问题描述**

`query_rules` 的匹配逻辑停留在字符串级：

```typescript
// 当前：
// 1. 按 language 精确匹配
// 2. 按 projectId 精确匹配
// 3. 按 tag 是否出现在路径/内容中做关键词包含匹配
// 4. pattern 字符串是否出现在 fileContent 中
```

这导致：
- 语义相近但写法不同的模式无法匹配（如 `validate()` vs `validate_input()`）
- 结构相似但变量命名不同的代码无法识别为同一模式
- 缺少"代码意图 → 规则"的推理匹配

**相关代码位置**

- 当前查询入口：[src/transport/mcp/query-rules.ts](file:///d:/Desktop/mcp/src/transport/mcp/query-rules.ts)
- 打分逻辑（已弃用）：[src/analysis/rule-matcher.ts](file:///d:/Desktop/mcp/src/analysis/rule-matcher.ts#L26-L78) — `computeScore()` 基于关键词和时间衰减
- 意图识别（已有但未用于规则匹配）：[src/core/intent-recognizer.ts](file:///d:/Desktop/mcp/src/core/intent-recognizer.ts#L1-L130) — `recognizeIntent()` 可识别 REFACTOR/BUGFIX/BOILERPLATE
- 向量嵌入（已有但未用于规则匹配）：[src/adapters/embedding/vector-store.ts](file:///d:/Desktop/mcp/src/adapters/embedding/vector-store.ts)
- 图遍历器（已有但未用于规则匹配）：[src/core/graph-traverser.ts](file:///d:/Desktop/mcp/src/core/graph-traverser.ts)

**改进建议**

改造 `handleQueryRules()` 的匹配流水线：

```
输入 query_rules(language, filePath, projectId, tags, fileContent)
    ↓
① 数据库基础查询 RuleRepo.list({ language, projectId }) → 候选规则集
    ↓
② 语义增强（新增）
   ├── recognizeIntent(fileContent) → 获取当前代码意图
   ├── VectorStore.search(embedding, topK=20) → 向量相似度匹配
   └── GraphTraverser.traverse(intentNodeId, maxDepth=3)
                       → 通过 CAUSES/REFINES/MUTEX 边扩展相关规则
    ↓
③ 综合打分：DB匹配 * w1 + 向量相似度 * w2 + 图关系权重 * w3
    ↓
④ token-controller 截断返回（确保在 token 预算内）
```

**开发量预估**：150-200 行（主要改造 `query-rules.ts`，复用已有模块）

---

### 🟠 P1-1：缺少项目级初始化能力

**问题描述**

当前所有工具都是"单文件级别"或"单次 diff 级别"的操作。当用户首次在一个新项目中使用 Governflow 时，系统从空的认知图和空的规则集开始——需要大量手动交互才能积累足够的知识。

**应有能力**

```bash
# 新增项目级命令
governflow init-project /path/to/project

# 或 MCP 工具
{"name": "analyze_project",
 "input": {"projectPath": "...", "deepScan": true}}
```

**项目初始化流程**

1. 扫描目录树 → 识别文件类型分布（TypeScript / Python / 配置文件等）
2. 对每个源文件执行轻量级 AST 签名提取（函数名、类名、模块导入、导出符号）
3. 聚合项目级模式：
   - 命名约定（函数名风格、文件名风格）
   - 模块边界（哪些模块之间有高频调用）
   - 常见导入模式
   - 目录结构约定
4. 批量创建 PATTERN 节点 + 项目级 CONSTRAINT 节点
5. 生成项目专属的 `project-policies.json`（初始策略集）
6. 返回交互式建议列表（用户逐条 accept/reject/edit）

**相关代码位置**

- 已有 AST 解析框架：[src/analysis/parsers.ts](file:///d:/Desktop/mcp/src/analysis/parsers.ts)
- 已有项目级数据模型（`Rule.projectId`）但未充分利用
- 已有 `analyze_workspace` 工具但依赖 git diff，需增加"无 git 上下文"模式

**改进建议**

在 `src/transport/mcp/` 新增 `analyze-project.ts`，复用现有的 `parsers.ts` 和 `cognition-repository.ts`。同时在 `packages/core/src/cli/cli.ts` 增加 `init-project` 子命令。

**开发量预估**：300-500 行（新工具 + 新 CLI 命令 + 轻量级目录扫描逻辑）

---

### 🟠 P1-2：策略系统过于简化

**问题描述**

[src/governance/default-policies.ts](file:///d:/Desktop/mcp/src/governance/default-policies.ts) 中仅有 5 条静态策略，且条件评估逻辑简单：

| 策略 ID | 作用 | 条件类型 |
|---------|------|---------|
| `policy-large-diff-approval` | 大 diff 需审批 | `tool_name` + `diff_size` |
| `policy-config-tool-log` | 配置变更记录 | `tool_name` |
| `policy-approval-tool-isolation` | 审批工具不可递归 | `tool_name` |
| `policy-temp-files-cleanup` | 临时文件需清理 | `file_path_match` |
| `policy-schema-validation-required` | 全局 schema 验证 | 无条件 |

**存在的问题**

1. **条件太简单**：不能基于认知图状态触发策略（如"某个 PATTERN 首次出现需要人工确认"）
2. **动作太简单**：只能 reject/require_approval/log_warning，不能触发自动修复
3. **不能学习**：策略不会基于用户反馈动态调整
4. **缺少项目级覆盖**：所有项目使用相同的默认策略，没有项目专属策略

**改进建议**

扩展 `PolicyEngine` 为 `DynamicPolicyEngine`：

```typescript
// 扩展条件类型
type DynamicCondition =
  // 现有条件（保持向后兼容）
  | { type: "tool_name"; toolNames: string[] }
  | { type: "diff_size"; maxDiffLines: number }
  | { type: "file_path_match"; pathPattern: string }
  // 新增动态条件
  | { type: "cognition_state"; nodeType: NodeType; minOccurrences: number; }
  | { type: "user_feedback"; feedbackType: "ACCEPTED" | "REJECTED"; threshold: number; }
  | { type: "rule_metrics"; metric: "hitCount" | "falsePositiveCount"; op: ">" | "<" | "="; value: number; }
  // 组合逻辑
  | { type: "composite"; operator: "AND" | "OR" | "NOT"; conditions: DynamicCondition[]; };

// 扩展动作类型
type PolicyAction =
  | { type: "reject"; reason?: string }
  | { type: "require_approval"; approvalLevel?: "user" | "admin" | "project_owner"; }
  | { type: "log_warning"; message?: string }
  | { type: "require_schema_validation" }
  // 新增自动化动作
  | { type: "trigger_self_heal"; targetNodeId?: string }
  | { type: "adjust_rule_priority"; ruleId: string; delta: number }
  | { type: "trigger_canary"; ruleId: string; stages?: string[] }
  | { type: "emit_cognition_feedback"; nodeId: string; outcome: "ACCEPTED" | "REJECTED"; }
```

**相关代码位置**

- 策略引擎：[src/governance/policy-engine.ts](file:///d:/Desktop/mcp/src/governance/policy-engine.ts#L1-L120)
- 条件评估器：[src/governance/condition-evaluator.ts](file:///d:/Desktop/mcp/src/governance/condition-evaluator.ts)
- 策略类型定义：[src/governance/governance-types.ts](file:///d:/Desktop/mcp/src/governance/governance-types.ts)

**开发量预估**：500-800 行（扩展 schema + 新条件/动作评估逻辑 + 示例策略）

---

### 🟡 P2-1：Web 仪表盘功能薄弱

**问题描述**

`packages/dashboard/src/server.ts` 仅有基础的 HTTP 服务器定义，但没有完整的前端 UI。用户无法：

- 可视化浏览认知图
- 交互式管理规则（接受/拒绝/编辑）
- 查看规则命中趋势和统计
- 监控免疫循环和金丝雀发布状态
- 管理策略配置

**相关代码位置**

- Dashboard 包：[packages/dashboard/src/server.ts](file:///d:/Desktop/mcp/packages/dashboard/src/server.ts)
- 指标收集器（已有 API，缺 UI）：[packages/core/src/dashboard/metrics-collector.ts](file:///d:/Desktop/mcp/packages/core/src/dashboard/metrics-collector.ts)
- GitOps 引擎（已有 PR Markdown 生成能力，缺 UI 展示）：[packages/core/src/delivery/gitops-engine.ts](file:///d:/Desktop/mcp/packages/core/src/delivery/gitops-engine.ts)
- 金丝雀控制器（已有逻辑，缺 UI）：[packages/core/src/delivery/canary-controller.ts](file:///d:/Desktop/mcp/packages/core/src/delivery/canary-controller.ts)

**改进建议**

新增 `packages/dashboard-web/`（Next.js 或 Vite + React）。MVP 版本至少包含：

| 页面 | 用途 | 依赖的数据表 |
|------|------|-------------|
| `/overview` | 项目总览 | Rule（统计各状态数）/ CognitionNode（节点分布） |
| `/rules` | 规则列表与管理 | Rule + RuleVersion |
| `/graph` | 认知图可视化 | CognitionNode + CognitionEdge |
| `/conflicts` | 冲突解决 | ConflictRecord |
| `/policies` | 策略编辑器 | PolicyEngine 配置 + 默认策略 |
| `/immune` | 免疫循环监控 | Rule.shadowUntil / Rule.immunityUntil |

**技术选型建议**

- 框架：Next.js 14+ App Router（或 Vite + React 轻量方案）
- 认知图可视化：D3.js（自定义力导向图）或 Cytoscape.js（生态更全）
- UI 组件库：shadcn/ui + Tailwind CSS（与 Governflow 的简约风格一致）
- 图表：Recharts 或 Tremor
- 后端 API：复用已有 `http-server.ts`，在 `/api` 下新增 REST 端点

**开发量预估**：2000-5000 行前端代码（取决于功能完整度）

---

### 🟡 P2-2：语言支持有限（仅 JS/TS/Python 有 tree-sitter 支持）

**问题描述**

[src/analysis/parsers.ts](file:///d:/Desktop/mcp/src/analysis/parsers.ts) 依赖的 tree-sitter 包只有：

- `tree-sitter-javascript` ^0.25.0
- `tree-sitter-python` ^0.25.0
- `tree-sitter-typescript` ^0.23.2

对于 Go、Rust、Java、C++、C#、Swift、Kotlin、YAML、TOML、Markdown 等常见语言/格式，系统会回退到 `regex-fallback.ts`，仅做行级 diff，缺少结构理解。

**相关代码位置**

- AST 解析：[src/analysis/parsers.ts](file:///d:/Desktop/mcp/src/analysis/parsers.ts)
- regex fallback：[src/analysis/regex-fallback.ts](file:///d:/Desktop/mcp/src/analysis/regex-fallback.ts)
- AST diff：[src/analysis/ast-diff.ts](file:///d:/Desktop/mcp/src/analysis/ast-diff.ts)
- AST node 模型：[src/analysis/ast-node.ts](file:///d:/Desktop/mcp/src/analysis/ast-node.ts)
- package.json 依赖：[package.json](file:///d:/Desktop/mcp/package.json#L26-L39)

**改进建议**

1. **增加语言包**：引入 `tree-sitter-go`、`tree-sitter-rust`、`tree-sitter-java`、`tree-sitter-cpp` 等（每种约 20-40 行桥接代码）

2. **建立统一的 LanguageParser 接口**：

```typescript
interface LanguageParser {
  language: string;
  extensions: string[];
  parseToAST(code: string): ASTNode;
  extractFunctionSignatures(ast: ASTNode): Signature[];
  extractImportDependencies(ast: ASTNode): string[];
  computeAtomicOps(oldAST: ASTNode, newAST: ASTNode): AtomicOp[];
}

class ParserRegistry {
  private parsers: Map<string, LanguageParser> = new Map();

  register(parser: LanguageParser): void {
    for (const ext of parser.extensions) {
      this.parsers.set(ext, parser);
    }
  }

  getByExtension(ext: string): LanguageParser | null {
    // 未注册的语言回退到 regex fallback
    return this.parsers.get(ext) ?? this.getRegexFallback();
  }
}
```

3. **优化 regex fallback**：当前 fallback 缺少结构理解，至少需要：
   - 函数/类定义的粗粒度划分（基于关键词 + 缩进）
   - 变量/常量声明的简单 token 分类
   - 导入语句的统一提取

**开发量预估**

- 基础框架 + 接口：200 行
- 每种新语言：50-100 行桥接代码
- regex fallback 增强：100-200 行
- 总计（以 5 种新语言计）：600-900 行

---

### 🟡 P2-3：沙箱系统有 API 但未接入主流程

**问题描述**

`packages/core/src/sandbox/` 中定义了完整的沙箱 API：

- `CowSandbox` — 代码执行隔离（Clone-On-Write）
- `SafetyValve` — 执行前置安全检查
- `HealthGate` — 执行后健康验证
- `SelfHealController` — 失败自动修复循环

但在 `capture-diff.ts` 的主流程中，这些模块**从未被实际调用**来验证生成的代码。沙箱系统是"理论存在"的，但与核心数据流断开。

**相关代码位置**

- CowSandbox：[packages/core/src/sandbox/cow-sandbox.ts](file:///d:/Desktop/mcp/packages/core/src/sandbox/cow-sandbox.ts)
- SafetyValve：[packages/core/src/sandbox/safety-valve.ts](file:///d:/Desktop/mcp/packages/core/src/sandbox/safety-valve.ts)
- SelfHealController：[packages/core/src/sandbox/self-heal-loop.ts](file:///d:/Desktop/mcp/packages/core/src/sandbox/self-heal-loop.ts)
- HealthGate：[packages/core/src/sandbox/health-gate.ts](file:///d:/Desktop/mcp/packages/core/src/sandbox/health-gate.ts)
- 沙箱测试：[packages/core/tests/cow-sandbox.test.ts](file:///d:/Desktop/mcp/packages/core/tests/cow-sandbox.test.ts)
- 沙箱测试：[packages/core/tests/self-heal-loop.test.ts](file:///d:/Desktop/mcp/packages/core/tests/self-heal-loop.test.ts)

**改进建议**

在 `handleCaptureDiff` 的"写入 Rule 之前"插入沙箱验证管道：

```
capture_diff 生成 replacementCode 建议
    ↓
CowSandbox.isolate(replacementCode)   → 隔离执行环境
    ↓
SafetyValve.check(isolatedCode)       → 安全检查（无限循环/文件系统操作/网络调用等）
    ↓
HealthGate.validate(checkedCode)      → 健康验证（语法检查/与原代码的等价性测试）
    ↓
验证通过 → 写入 Rule(status: "pending", shadowUntil 设置)
验证失败 → SelfHealController.run(failedCode) → 自动修复
           修复成功 → 写入 Rule
           修复失败 → markAsFailed() 记录到 diff_log.failed 状态
```

接入点：`src/transport/mcp/capture-diff.ts` 中 `handleCaptureDiff()` 函数末尾，在返回结果之前插入上述管道。

**开发量预估**：100-150 行（主要是连接逻辑，沙箱 API 已有实现）

---

### 🟡 P2-4：缺少规则效果反馈闭环

**问题描述**

`cognition_feedback` 工具可以调整认知图边权重，但没有对"某个规则实际效果如何（ROI 分析）"做完整的量化和闭环。

**相关代码位置**

- 反馈工具：[src/transport/mcp/cognition-tools.ts](file:///d:/Desktop/mcp/src/transport/mcp/cognition-tools.ts)
- 满意度追踪器（已有 API，缺闭环）：[packages/core/src/audit/satisfaction-tracker.ts](file:///d:/Desktop/mcp/packages/core/src/audit/satisfaction-tracker.ts)
- ROI 审计（已有 API，缺实际数据接入）：[packages/core/src/audit/roi-auditor.ts](file:///d:/Desktop/mcp/packages/core/src/audit/roi-auditor.ts)
- 数据模型中的统计字段（已定义，缺持续更新逻辑）：
  - `Rule.hitCount` — 命中次数
  - `Rule.falsePositiveCount` — 误报次数
  - `Rule.adoptedCount` — 被用户接受次数

**改进建议**

建立"规则效果 → 自动调优"闭环：

```
① 每次 query_rules 返回规则时，记录 hit（用户看到建议）
② 每次 confirm_rule accept/reject/edit 时：
   - accept → hitCount++, adoptedCount++
   - reject → hitCount++, falsePositiveCount++
   - edit → falsePositiveCount++（原建议不理想），新 adoptedCount++
③ 定期 ROI 扫描（由 rule-immune.ts 的免疫循环触发）：
   ROI = (adoptedCount * avg_savings)
        / (hitCount * review_cost + falsePositiveCount * correction_cost)
   - ROI > 高阈值 → 保持 active，可能提升 priority
   - ROI 中 → 降级到 shadowUntil 影子模式
   - ROI 低 → archivedAt 归档
④ eventBus.emit("rule.roi.updated") → 供仪表盘/Webhook 消费
⑤ ROI 排名 + 趋势图可视化
```

**开发量预估**：300 行左右（主要是连接逻辑 + ROI 计算函数 + 仪表板页面）

---

### 🟢 P3-1：缺少交互式工作流（纯 API 模式）

**问题描述**

当前所有 MCP 工具都是"请求-响应"的原子操作。没有"多轮会话"的概念——用户无法在一个持续的上下文中逐步构建认知图和规则集。

**已有基础**

- `workflow-tools.ts` 已有 `workflow-submit / workflow-vote / workflow-status / workflow-escalate`（但未接入完整的 session 管理）
- 数据模型中已有 `Proposal` / `ApprovalRequest` 表（支持 Pending→Review→Approved 的状态流转）

**改进建议**

新增 `session-manager.ts` + 3 个 MCP 工具：

```typescript
// 1. open-session — 开始一个带持久化上下文的会话
{ name: "open_session",
  input: { projectId?: string; initialRules?: string[] } }
→ 返回 sessionId

// 2. session-message — 在会话上下文中执行任意工具
{ name: "session_message",
  input: { sessionId: string; tool: "capture_diff" | "query_rules" | ...; args: {} } }
→ 所有读写操作自动带上 sessionId 标签，认知节点/边自动关联到会话

// 3. query-session-state — 获取当前会话的认知状态快照
{ name: "query_session_state",
  input: { sessionId: string; include?: ("nodes" | "edges" | "rules" | "history")[] } }
→ 返回会话累积的认知图/规则建议/交互历史

// 4. close-session — 结束会话，持久化会话产物
{ name: "close_session",
  input: { sessionId: string; persistNodes: boolean; persistRules: boolean } }
```

**开发量预估**：500 行

---

### 🟢 P3-2：缺少外部集成能力（IDE/CI/CD Webhook）

**问题描述**

Governflow 当前只能通过 MCP/HTTP 被"调用"，但缺少主动"推送"约束给外部系统的能力。典型的集成场景包括：

1. **IDE 集成**：开发者编辑文件时，Governflow 推送该文件适用的规则建议
2. **CI/CD 集成**：Pull Request 时 Governflow 自动运行 `analyze_workspace` 并将结果作为 review comments
3. **Git hook 集成**：提交前自动检查代码是否违反已有规则
4. **Webhook 推送**：关键事件（新规则生成/冲突检测/策略变更）推送到 Slack/Discord/邮件

**改进建议**

新增 `src/integration-hub/` 目录，包括：

- `vscode-extension/` — VS Code 扩展模板（客户端）
  - 利用 `query_rules` API 检测当前编辑文件适用的规则
  - 侧边栏显示"建议遵循的约束"
  - 支持一键应用/确认/拒绝
- `webhook-server.ts` — 接收 Git push 事件 → 自动 analyze_workspace
- `ci-github-action/` — GitHub Action 模板，在 PR 中调用 Governflow

**开发量预估**：1000-1500 行 + VSCode 扩展代码（视功能完整度而定）

---

### 🟢 P3-3：缺少插件/扩展系统

**问题描述**

当前 Governflow 的扩展性依赖"手动修改 TypeScript 源码 + 重新编译"。外部项目无法以插件形式扩展 Governflow 的能力。

**已有基础**

- DI 容器系统：`packages/core/src/di/container.ts` — 已支持依赖注入，可以作为插件注册的基础
- 事件总线：`packages/core/src/events/bus.ts` — 支持在多个时间点注入监听器

**改进建议**

在 `packages/core/src/` 下建立完整的插件 SDK：

```typescript
export interface GovernflowPlugin {
  id: string;
  version: string;
  name: string;

  // 生命周期
  onRegister?(container: Container): void;
  onShutdown?(): Promise<void>;

  // Hook 点
  hooks?: {
    beforeCaptureDiff?(input: CaptureDiffInput): CaptureDiffInput;
    afterCaptureDiff?(output: any): any;
    beforeRuleCreate?(rule: RuleSpec): RuleSpec;
    onCognitionQuery?(context: any): any;
    onFeedback?(feedback: CognitionFeedback): void;
    // ...更多 hook 按需求增加
  };

  // 插件可贡献新的 MCP 工具
  tools?: MCPTool[];

  // 插件可贡献新的策略模板
  policyTemplates?: JsonPolicy[];
}
```

加上配套的：
- `plugin-loader.ts` — 从 npm packages / 文件系统加载插件
- CLI 命令 `governflow plugin add/remove/list`
- 插件市场规范文档（README + 示例插件）

**开发量预估**：800-1200 行（SDK + 注册中心 + 文档 + 示例插件）

---

## 四、缺口汇总表

| 编号 | 级别 | 标题 | 核心问题 | 关键缺失模块 | 开发量（行） |
|------|------|------|---------|-------------|-------------|
| P0-1 | 🔴 | 规则生成通道断裂 | capture_diff → 认知图 → ❌→ Rule | `cognition-rule-generator.ts` | 200-300 |
| P0-2 | 🔴 | 规则匹配缺少语义 | 仅字符串/关键词匹配 | `query-rules.ts` 语义增强改造 | 150-200 |
| P1-1 | 🟠 | 缺少项目级初始化 | 无法批量分析代码库 | `analyze-project.ts` + CLI | 300-500 |
| P1-2 | 🟠 | 策略系统过于简化 | 静态策略不能动态响应 | `dynamic-policy-engine.ts` | 500-800 |
| P2-1 | 🟡 | Web 仪表盘薄弱 | 有数据 API 但无 UI | `packages/dashboard-web/` | 2000-5000 |
| P2-2 | 🟡 | 语言支持有限 | 仅 JS/TS/Python 有 AST | 多语言 parser 扩展 | 600-900 |
| P2-3 | 🟡 | 沙箱未接入主流程 | 有 API 但无实际调用 | `capture-diff.ts` 沙箱管道 | 100-150 |
| P2-4 | 🟡 | 缺少 ROI 闭环 | 有数据字段但无分析逻辑 | ROI 计算 + 自动调优逻辑 | 300 |
| P3-1 | 🟢 | 缺少交互式工作流 | 纯请求-响应模式 | `session-manager.ts` | 500 |
| P3-2 | 🟢 | 缺少外部集成 | 无法主动推送约束 | `integration-hub/` | 1000-1500 |
| P3-3 | 🟢 | 缺少插件系统 | 扩展性依赖源码修改 | `plugin-sdk/` | 800-1200 |

**总计**：约 6000-11000 行代码补充 + 文档

---

## 五、优先级与依赖关系图

```
阶段 1（立即修复）
├─ P0-1: 规则生成通道   ← 是 P2-3/P2-4 的前置依赖
└─ P0-2: 规则匹配语义增强 ← 与 P0-1 可并行

阶段 2（短期增强）
├─ P1-1: 项目级初始化   ← 依赖 P0-1（需要有规则生成能力）
├─ P1-2: 动态策略系统   ← 可独立实施
└─ P2-3: 沙箱接入主流程 ← 依赖 P0-1 的规则生成完成

阶段 3（中期增强）
├─ P2-1: Web 仪表盘     ← 依赖 P0-1/P0-2/P2-4 有数据可供展示
├─ P2-2: 多语言支持     ← 可独立实施
└─ P2-4: ROI 闭环       ← 依赖 P0-1 + P0-2 有规则数据积累

阶段 4（平台化）
├─ P3-1: 会话管理       ← 依赖 P0-1 + P1-1
├─ P3-2: 外部集成       ← 依赖 P0-1 + P2-1（有数据可展示）
└─ P3-3: 插件 SDK       ← 依赖 P1-2（动态策略）+ P3-1（会话系统）
```

---

## 六、验证与验收标准

每个缺口修复后应满足以下验收标准：

| 验收项 | 说明 |
|--------|------|
| ✅ 单元测试覆盖 | 新增模块的测试覆盖率 ≥ 80%，测试文件在 `tests/` 或 `packages/core/tests/` |
| ✅ 端到端测试 | 至少 1 个端到端测试场景通过真实文件输入验证完整数据流 |
| ✅ 类型安全 | TypeScript `strict` 模式下无编译错误 |
| ✅ API 兼容性 | 现有 MCP 工具 API 保持向后兼容（不得破坏已有调用方） |
| ✅ 性能基准 | 与 benchmarks/ 中现有基准对比无显著性能退化 |
| ✅ 文档完备 | 在 `docs/` 下同步更新用户文档和开发者说明 |
| ✅ 日志/遥测 | 关键路径有合理的结构化日志输出（`pino`） |

---

## 七、更新记录

| 版本 | 日期 | 更新内容 |
|------|------|---------|
| 1.1 | 2026-06-21 | 版本升级至 v1.0.0-alpha.9；修复所有文件路径引用与实际仓库路径一致 |
| 1.0 | 2026-06-18 | 初始版本，首次完整缺口扫描 |
