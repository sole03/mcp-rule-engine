# Governflow 增强方案路线图

> 版本：v1.0.0-alpha.9 · 路线图更新日期：2026-06-21
>
> 适用范围：以 Governflow 为主体架构的增强规划
>
> 阅读对象：架构师、技术负责人、项目管理

---

## 一、核心理念：从「能工作」到「能进化」

Governflow 已经是一个**结构完整的四层流水线 AI 代码治理系统**。当前状态：

- ✅ **完整的基础架构**：数据层有 12 张表的 SQLite 模型，传输层有 3 种协议，核心层有认知图 + 策略引擎
- ✅ **足够的模块化设计**：packages/core 与 src/ 两层分离，DI 容器支持依赖注入
- ✅ **明确的扩展点**：事件总线、MCP 工具、策略模板、约束 DSL

但要从「原型级可用」进化为「生产级系统」，需要在**四个维度**增强：

```
维度 1：数据流闭环    → 让 capture_diff → 认知图 → Rule → 验证 → 调优 真正打通
维度 2：语义能力      → 从字符串匹配升级为向量/图/意图的综合匹配
维度 3：用户体验      → 从纯 API 增加可视化仪表盘、会话管理、IDE 集成
维度 4：生态扩展      → 从单体可修改进化为插件可扩展的平台
```

本路线图按照这四个维度组织，分为四个阶段（Phase），每个阶段都有**明确的可交付物、里程碑和验收标准**。

---

## 二、总体阶段规划

```
Phase 1：基础闭环（2-3 周）
 目标：让核心工作流真正跑通 — 从代码变化到规则生成
 交付：
   [P0-1] cognition-rule-generator.ts    （规则生成引擎）
   [P0-2] query-rules 语义增强改造          （语义/向量/图增强匹配）
   [P2-3] capture-diff 沙箱管道接入         （沙箱验证闭环）
   [P2-4] ROI 计算与自动调优                 （规则效果量化闭环）
 里程碑：
   M1.1  — 系统可以无人干预地：观察代码 → 生成规则 → 评分规则
   M1.2  — 用户可以看到规则命中数、接受率、ROI 排名

Phase 2：平台增强（3-4 周）
 目标：从"能工作"到"易用 + 多场景"
 交付：
   [P1-1] analyze-project 项目级初始化工具    （批量扫描新代码库）
   [P1-2] dynamic-policy-engine.ts          （动态策略系统）
   [P2-2] 多语言 parser 扩展                  （至少 Go/Rust/Java 三种新语言）
   [P3-1] session-manager.ts                （交互式工作流）
 里程碑：
   M2.1  — 用户有项目级 onboarding 体验
   M2.2  — 策略系统可以基于认知图状态动态决策

Phase 3：可视化与集成（3-4 周）
 目标：从命令行友好到全流程可视化 + 外部系统集成
 交付：
   [P2-1] packages/dashboard-web/          （完整 Web 仪表盘）
   [P3-2] src/integration-hub/              （IDE/CI/CD/Webhook 集成）
 里程碑：
   M3.1  — 非技术用户也能通过 UI 查看/管理系统
   M3.2  — 开发者 IDE 中能实时看到 Governflow 规则建议

Phase 4：生态化（持续）
 目标：从"我们自己开发功能"到"开发者可以扩展 Governflow"
 交付：
   [P3-3] 插件 SDK + 注册中心 + 示例插件       （plugin-sdk/）
   — 插件市场规范 + 文档体系                  （docs/plugins/）
 里程碑：
   M4.1  — 外部开发者可以仅通过 npm install 扩展 Governflow 的 MCP 工具、策略模板
   M4.2  — 有 ≥ 5 个公开示例插件作为生态种子
```

---

## 三、分阶段详细设计

### Phase 1：基础闭环

**目标**：让 Governflow 的核心承诺——「观察代码变化 → 学习规则 → 主动建议约束」——真正兑现。

#### 1.1 P0-1: 规则生成引擎 `cognition-rule-generator.ts`

**文件路径**：`src/transport/mcp/`（与现有 MCP 工具并列） + `src/core/`（核心逻辑）

**接口设计**：

```typescript
// MCP 工具：由外部定时触发或手动调用
export async function handleGenerateRulesFromCognition(input: {
  projectId?: string;
  minOccurrences?: number;          // 触发阈值
  timeWindowHours?: number;         // 时间窗口
  maxRulesPerBatch?: number;        // 单批次最大生成数
  targetLanguages?: string[];       // 目标语言筛选
}): Promise<{
  generated: {
    ruleId: string;
    nodeId: string;
    pattern: string;
    suggestion: string;
    confidence: "high" | "medium" | "low";
    estimatedROI: number;
  }[];
  totalPatternsAnalyzed: number;
  totalGenerated: number;
  durationMs: number;
}>;

// 内部核心函数：供 capture-diff.ts 在每次写入 PATTERN 节点后调用
export async function autoMaybeGenerateRule(
  patternNodeId: string,
  semanticHash: string,
  occurrenceCount: number,
  language: string,
  projectId: string | undefined
): Promise<Rule | null>;
```

**核心逻辑流程图**：

```
┌─ capture_diff 写入 PATTERN 节点完成 ─┐
│                                        │
│ ① 更新 occurenceCount（原子递增）       │
│                                        │
│ ② 是否达到触发阈值？                     │
│    occurrenceCount < min_occ (默认 3)  │
│    └→ 结束，不生成                      │
│                                        │
│ ③ 读取同源 hash 的 INTENT 节点            │
│    分析函数名/文件路径/代码片段          │
│    └→ 如果无 INTENT 节点 → 跳过          │
│                                        │
│ ④ 生成 CONSTRAINT 节点                   │
│    nodeType = "CONSTRAINT"              │
│    payload = { pattern, language,       │
│                sourcePatternHash,       │
│                ruleType: "replace" }    │
│    abstractionLevel = 2 (module)        │
│                                        │
│ ⑤ 写入 Rule 表                          │
│    status     = "pending"               │
│    confidence = analyzeConfidence(...)  │
│    priority   = calcInitialPriority()   │
│    shadowUntil = now() + 7 days         │
│    ruleType   = detectRuleType()        │
│                                        │
│ ⑥ 写入 PATTERN --GENERATES--> CONSTRAINT │
│    边关系到认知图                        │
│                                        │
│ ⑦ logger.info("auto-generated rule")    │
│    + eventBus.emit("rule.auto.created") │
│                                        │
└─────────────────────────────────────────┘
```

**关键数据结构**：

```typescript
// 新增表（Prisma schema）
model RuleGenerationJob {
  id              String   @id @default(cuid())
  projectId       String?
  patternCount    Int      @default(0)
  generatedCount  Int      @default(0)
  skippedCount    Int      @default(0)
  durationMs      Int
  status          String   // COMPLETED | PARTIAL | FAILED
  triggerType     String   // MANUAL | AUTO_BY_OCCURRENCE | SCHEDULED
  createdAt       DateTime @default(now())
  rules           Rule[]
  nodeIds         String?  // JSON: 关联的 PATTERN/CONSTRAINT 节点 ID 列表
}

// 修改 Rule 表（增加来源追踪字段）
model Rule {
  // ...现有字段
  cognitionPatternId String?    // 关联到 CognitionNode(PATTERN)
  generationJobId    String?    // 关联到 RuleGenerationJob
  cognitionNode      CognitionNode?
  generationJob      RuleGenerationJob?
}
```

**与现有系统的集成点**：

- `capture-diff.ts` 的 `upsertCognitionClosure()` 末尾增加对 `autoMaybeGenerateRule()` 的调用
- `governance/rule-immune.ts` 的 `runCycle()` 中自动扫描 `status="pending"` 的 Rule（不需要修改，已经有此逻辑）
- `confirm-rule.ts` 中 accept/reject 流程自动更新相关 PATTERN/CONSTRAINT 节点的 metadata

**开发量**：约 250 行核心逻辑 + 30 行 Prisma Schema + 100 行测试

---

#### 1.2 P0-2: query-rules 语义增强

**修改文件**：`src/transport/mcp/query-rules.ts`

**当前逻辑 vs 新逻辑**：

```
当前：
 query_rules(language, filePath, projectId, tags, taskId)
    ↓
  ① RuleRepo.list({ language, projectId })  → 列表
  ② 按 tags/path 做简单字符串包含匹配过滤
  ③ 按 matchCount 排序 → token 截断 → 返回

新：
 query_rules(language, filePath, projectId, tags, fileContent?, taskId?)
    ↓
  ① RuleRepo.list({ language, projectId })  → 候选规则集 R
  ② 读取 filePath 对应文件内容（如果提供 fileContent 则直接使用）
  ③ 意图识别（recognizeIntent(fileContent)）
  ④ 语义匹配增强分支（如果有可用向量存储）：
     ├─ VectorStore.search(fileContent, topK=20) → 获取语义近邻规则 V
     └─ GraphTraverser.traverse(intentNode, maxDepth=3) → 获取图关联规则 G
  ⑤ 综合打分：
     score = w1 * DBmatchScore
           + w2 * vectorSimilarity(V)
           + w3 * graphRelevance(G)
           + w4 * hitCountNormalized
           + w5 * confidenceLevel
     默认权重：w1=0.3, w2=0.3, w3=0.2, w4=0.1, w5=0.1
  ⑥ 按 score 降序 → token 截断 → 返回
```

**新增可选参数**：

| 参数 | 类型 | 默认 | 含义 |
|------|------|------|------|
| `fileContent` | string | 可选 | 当前文件的完整内容（用于语义匹配/意图识别） |
| `matchMode` | `"strict" | "semantic" | "hybrid"` | `hybrid` | 匹配模式：仅 DB/仅向量/混合 |
| `maxRules` | number | 15 | 返回的最大规则数 |

**开发量**：约 180 行

---

#### 1.3 P2-3: 沙箱系统接入主流程

**修改文件**：`src/transport/mcp/capture-diff.ts`

**新增管道**：

```typescript
// 在 handleCaptureDiff 的"写入 diff_log 后"，增加对"候选 replacement 代码"的验证

async function validateWithSandbox(
  code: string,
  language: string,
  container: Container  // 从 DI 容器获取 CowSandbox/SafetyValve/HealthGate/SelfHeal
): Promise<{
  passed: boolean;
  healedCode?: string;
  safetyViolations: string[];
  healthIssues: string[];
  healAttempts: number;
  durationMs: number;
}> {
  const start = performance.now();

  // 1. 隔离执行环境
  const isolated = await container.cowSandbox.isolate({ code, language });

  // 2. 安全检查（禁止的 API 调用、网络访问、文件系统读写）
  const safety = await container.safetyValve.check(isolated.code, isolated.language);
  if (!safety.passed) {
    return {
      passed: false,
      safetyViolations: safety.violations,
      healthIssues: [],
      healAttempts: 0,
      durationMs: performance.now() - start,
    };
  }

  // 3. 健康验证（语法检查 + 简单单元测试）
  const health = await container.healthGate.validate(safety.safeCode);

  // 4. 如果健康检查失败 → 自愈循环
  if (!health.passed) {
    const healResult = await container.selfHealController.run(
      health.brokenCode,
      { maxAttempts: 3, issueTypes: health.issues }
    );
    if (healResult.passed && healResult.healedCode) {
      return {
        passed: true,
        healedCode: healResult.healedCode,
        safetyViolations: [],
        healthIssues: health.issues.filter(i => !i.fixed),
        healAttempts: healResult.attempts,
        durationMs: performance.now() - start,
      };
    }
    return {
      passed: false,
      safetyViolations: safety.violations,
      healthIssues: health.issues,
      healAttempts: healResult.attempts,
      durationMs: performance.now() - start,
    };
  }

  return {
    passed: true,
    safetyViolations: [],
    healthIssues: [],
    healAttempts: 0,
    durationMs: performance.now() - start,
  };
}
```

**开发量**：约 120 行（核心是连接逻辑，沙箱 API 已有实现）

---

#### 1.4 P2-4: ROI 计算与自动调优

**新增文件**：`src/core/rule-roi.ts`

**公式**：

```
ROI = (adoptedCount * SAVINGS_PER_ADOPTION)
    / (hitCount * REVIEW_COST + falsePositiveCount * CORRECTION_COST)

其中：
  SAVINGS_PER_ADOPTION = 10 min（假设每次使用规则节省 10 分钟手动重复劳动）
  REVIEW_COST          = 30 秒（每次看到规则建议的判断成本）
  CORRECTION_COST      = 2 min（每次误报需要手动修正的成本）
```

**分级策略**：

| ROI 范围 | 判定 | 动作 |
|----------|------|------|
| > 5 | 高价值 | 维持 active，可能提升 priority |
| 1 ~ 5 | 正常 | 维持当前状态 |
| 0.1 ~ 1 | 低价值 | 降级到 shadow 模式（shadowUntil 设置为未来日期） |
| < 0.1 | 低质 | 设置 archivedAt → 归档 |
| NaN / 数据不足 | 待观察 | 保持 pending，继续累积数据 |

**接入点**：

- `governance/rule-immune.ts` 的 `runCycle()` 中，在"检查 shadow 模式"之后增加 ROI 扫描
- `confirm-rule.ts` 的 accept/reject 处理中更新 hitCount/adoptedCount/falsePositiveCount

**开发量**：约 150 行

---

#### Phase 1 里程碑验收标准

| 编号 | 验证项 | 如何验证 |
|------|--------|---------|
| M1.1 | 代码变化 → 自动生成 Rule | 手动写入 10 个不同 Python 文件，调用 `list_rules` 检查是否有新规则生成 |
| M1.2 | 规则命中率统计 | `query_rules` 返回的每条规则应包含 hitCount / adoptedCount |
| M1.3 | 沙箱验证可运行 | 在 capture_diff 中注入有问题的代码，日志中应有 "safety violation" 或 "healed" 记录 |
| M1.4 | 语义匹配优于纯字符串 | 对同一文件分别用当前匹配和新匹配跑，记录返回规则列表，语义模式应能发现更多相关规则 |
| M1.5 | ROI 闭环运转 | 反复 accept/reject 同一规则，其状态应从 pending→active→shadow 正确迁移 |
| M1.6 | 测试通过 | `npm run test` 全部通过，新增模块测试覆盖率 ≥ 80% |
| M1.7 | 类型安全 | TypeScript strict 模式下零警告 |

---

### Phase 2：平台增强

#### 2.1 P1-1: 项目级初始化工具 `analyze-project.ts`

**MCP 工具接口**：

```typescript
export async function handleAnalyzeProject(input: {
  projectPath: string;
  projectId?: string;
  deepScan?: boolean;         // 是否扫描子目录中的所有文件
  includePatterns?: string[];  // glob pattern，如 ["**/*.ts", "**/*.py"]
  excludePatterns?: string[];  // 默认 ["node_modules/", ".git/", "dist/"]
  maxFiles?: number;           // 默认 500（防止超大项目）
  generateInitialRules?: boolean;  // 自动从项目模式生成规则
  existingStrategy?: "merge" | "skip" | "overwrite";
}): Promise<{
  scannedFiles: number;
  filesByLanguage: Record<string, number>;
  patternsDetected: {
    naming: string[];        // 命名约定（如 snake_case_variable, PascalCase_Class）
    importPatterns: string[];
    moduleBoundaries: string[];
    directoryStructure: string[];
  };
  cognitionNodesCreated: {
    PATTERN: number;
    INTENT: number;
    CONSTRAINT: number;
  };
  rulesProposed: number;
  ruleIds: string[];
  projectPolicyJson?: string;  // 生成的项目策略 JSON
  warnings: string[];
  durationMs: number;
}>;
```

**CLI 命令**：

```bash
governflow init-project ./my-project
  --project-id team-frontend
  --include "**/*.{ts,tsx}"
  --exclude "**/test/**"
  --generate-rules         # 自动从项目模式生成初始规则
```

**流程设计**：

```
① 扫描 fileTree(projectPath, include/exclude, maxFiles)
  ├→ 统计语言分布（按扩展名）
  └→ 对每个文件：
      ├─ parseToAST(code, language)          # 或 regex fallback
      ├─ 提取函数签名/类名/导入/导出
      └─ 写入临时 PATTERN 节点（暂不触发规则生成阈值）

② 聚合分析（多文件级别）
  ├─ 命名约定检测（变量/函数/类的命名风格一致性）
  ├─ 导入图：哪些模块从哪里 import 最多
  ├─ 模块边界：高内聚/低耦合的潜在划分
  ├─ 目录结构：识别 src/, tests/, components/ 等约定目录
  └─ 项目类型检测（React/Node/Python 后端/数据项目等）

③ 批量写入认知图
  ├─ 项目级 PATTERN 节点（例如"项目使用 React hooks"）
  ├─ 项目级 CONSTRAINT 节点（例如"所有组件使用 PascalCase + .tsx 扩展名"）
  └─ 写入 Rule 表（初始状态：pending 或 active，根据 existingStrategy）

④ 生成 project-policies.json
   {
     "version": "1.0",
     "projectId": "...",
     "language": ["typescript", "python"],
     "detectedPatterns": [ ... ],
     "initialRules": [ ruleId1, ruleId2, ... ],
     "recommendedPolicies": [
       "policy-large-diff-approval",
       "policy-approval-tool-isolation"
     ]
   }

⑤ 返回结果摘要 + 建议
```

**开发量**：约 400 行（目录扫描 + AST 轻量提取 + 模式聚合 + CLI 入口）

---

#### 2.2 P1-2: 动态策略系统 `dynamic-policy-engine.ts`

**设计原则**：

1. **完全向后兼容**：`default-policies.ts` 中的策略格式保持不变
2. **动态条件**：允许策略条件访问认知图、规则统计、用户反馈等动态数据
3. **动态动作**：允许策略触发自愈、金丝雀、认知反馈等自动化动作
4. **可持久化**：自定义策略可以保存到数据库，并在重启后恢复

**数据结构**：

```typescript
type DynamicCondition =
  // —— 原有静态条件 ——
  | { type: "tool_name"; toolNames: string[] }
  | { type: "diff_size"; maxDiffLines: number; maxCharacters?: number }
  | { type: "file_path_match"; pathPattern: string }

  // —— 新增动态条件 ——
  | { type: "cognition_state";
      nodeType: "PATTERN" | "INTENT" | "CONSTRAINT" | "HEURISTIC";
      minOccurrences?: number;    // 该类型节点数达到阈值
      hasSemanticHash?: string;    // 是否有特定语义 hash 的节点
    }
  | { type: "user_feedback";
      feedbackType: "ACCEPTED" | "REJECTED" | "MODIFIED";
      threshold: number;          // 连续次数阈值
      timeWindowHours?: number;
    }
  | { type: "rule_metrics";
      ruleId?: string;            // 可省略 = 任意规则
      metric: "hitCount" | "falsePositiveCount" | "adoptedCount" | "roi";
      op: ">" | ">=" | "<" | "<=" | "==";
      value: number;
    }

  // —— 组合逻辑 ——
  | { type: "composite";
      operator: "AND" | "OR" | "NOT";
      conditions: DynamicCondition[];
    };

type DynamicAction =
  // —— 原有的基础动作 ——
  | { type: "reject"; reason?: string }
  | { type: "require_approval"; approvalLevel?: "user" | "admin" | "project_owner" }
  | { type: "log_warning"; message?: string }
  | { type: "require_schema_validation" }

  // —— 新增自动化动作 ——
  | { type: "trigger_self_heal"; targetNodeId?: string; maxAttempts?: number }
  | { type: "adjust_rule_priority"; ruleId: string; delta: number }
  | { type: "trigger_canary"; ruleId: string; stages?: string[] }
  | { type: "emit_cognition_feedback";
      nodeId: string;
      outcome: "ACCEPTED" | "REJECTED" | "MODIFIED";
    }
  | { type: "archive_rule"; ruleId: string }
  | { type: "shadow_rule"; ruleId: string; days: number };
```

**策略评估流程**：

```
工具调用进入
    ↓
policyEngine.evaluate({ toolName, filePath, projectId, modifiedContent })
    ↓
① 加载所有 status=active 的策略（默认策略 + 自定义策略）
    ↓
② 对每条策略逐个检查条件
   条件评估器：evaluateCondition(cond, ctx)
   ├─ 简单条件 → 立即评估
   ├─ cognition_state → 查询 CognitionRepository
   ├─ user_feedback → 查询最近 N 小时反馈统计
   ├─ rule_metrics → 查询 Rule 表指标字段
   └─ composite → 递归 + 短路逻辑（AND/OR/NOT）
    ↓
③ 所有条件通过 → 执行 actions
   ├─ reject → 直接中断工具执行，返回 blocked 结果
   ├─ require_approval → 设置审批标志
   ├─ log_warning → pino 记录警告
   ├─ trigger_self_heal → 调用 SelfHealController
   ├─ adjust_rule_priority → RuleRepo.updatePriority
   ├─ trigger_canary → CanaryController.start
   └─ emit_cognition_feedback → CognitionRepository.updateEdgeWeight
    ↓
④ 汇总决策（allow/block/approval_required + warnings）
```

**开发量**：约 700 行（核心逻辑 + 新策略示例 + 测试）

---

#### 2.3 P2-2: 多语言 Parser 扩展

**文件结构**：

```
src/analysis/parsers/
├─ index.ts                # 统一入口 + ParserRegistry
├─ base.parser.ts          # LanguageParser 接口定义
├─ javascript.parser.ts    # 现有 JavaScript/TypeScript Parser
├─ python.parser.ts        # 现有 Python Parser
├─ go.parser.ts            # ← 新增 Go
├─ rust.parser.ts          # ← 新增 Rust
├─ java.parser.ts          # ← 新增 Java
├─ cpp.parser.ts           # ← 新增 C++
└─ regex-fallback.parser.ts # 增强的 regex fallback
```

**统一接口**：

```typescript
export interface LanguageParser {
  language: string;
  extensions: string[];             // 如 [".go", ".go.mod"]
  parseToAST(code: string): ASTNode; // 完整 AST
  extractFunctionSignatures(ast: ASTNode): FunctionSignature[];
  extractImportDependencies(ast: ASTNode): ImportStatement[];
  extractClassDefinitions(ast: ASTNode): ClassDefinition[];
  computeAtomicOps(oldAST: ASTNode, newAST: ASTNode): AtomicOp[];
  supports(): {
    fullAST: boolean;                 // tree-sitter 是否可用
    functionSignature: boolean;
    importAnalysis: boolean;
    diffAnalysis: boolean;
  };
}
```

**注册方式**（自动发现）：

```typescript
// src/analysis/parsers/index.ts
import { JavaScriptParser } from "./javascript.parser.js";
import { PythonParser } from "./python.parser.js";
import { GoParser } from "./go.parser.js";
import { RustParser } from "./rust.parser.js";
import { JavaParser } from "./java.parser.js";
import { CppParser } from "./cpp.parser.js";
import { RegexFallbackParser } from "./regex-fallback.parser.js";

export class ParserRegistry {
  private static parsers: Map<string, LanguageParser> = new Map();
  private static fallback = new RegexFallbackParser();

  static initialize(): void {
    const all = [
      new JavaScriptParser(),
      new PythonParser(),
      new GoParser(),
      new RustParser(),
      new JavaParser(),
      new CppParser(),
    ];
    for (const parser of all) {
      for (const ext of parser.extensions) {
        this.parsers.set(ext, parser);
      }
    }
  }

  static getByExtension(ext: string): LanguageParser {
    return this.parsers.get(ext) ?? this.fallback;
  }

  static getByLanguage(language: string): LanguageParser {
    for (const parser of this.parsers.values()) {
      if (parser.language === language) return parser;
    }
    return this.fallback;
  }
}

// 在 index.ts 的顶部（或 main）调用 ParserRegistry.initialize()
```

**tree-sitter 依赖**：

```json
// package.json dependencies 追加
{
  "tree-sitter-go": "^0.23.0",
  "tree-sitter-rust": "^0.23.0",
  "tree-sitter-java": "^0.23.0",
  "tree-sitter-cpp": "^0.23.0"
}
```

**开发量**：每新语言 50-100 行桥接代码 × 5 种 ≈ 400 行，加上框架和接口约 200 行，总计 600-700 行

---

#### 2.4 P3-1: 交互式工作流 `session-manager.ts`

**核心思路**：将「多次 MCP 工具调用」封装为「一个持久化的 Session」，让用户可以逐步积累上下文而不是每次独立调用。

**数据库模型**：

```prisma
model Session {
  id             String    @id @default(cuid())
  projectId      String?
  title          String
  status         String    // ACTIVE | CLOSED | ARCHIVED
  nodeCount      Int       @default(0)
  ruleCount      Int       @default(0)
  messageCount   Int       @default(0)
  metadata       String?   // JSON: 任意元数据
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  closedAt       DateTime?

  messages       SessionMessage[]
  nodes          CognitionNode[]  // 会话关联的认知节点
}

model SessionMessage {
  id             String    @id @default(cuid())
  sessionId      String
  role           String    // USER | SYSTEM
  content        String    // JSON: {tool, input, output} 或自由文本
  timestamp      DateTime  @default(now())
  session        Session   @relation(fields: [sessionId], references: [id])
}

// 修改 CognitionNode 表增加 session 关联
model CognitionNode {
  // ...现有字段...
  sessionId      String?
  session        Session?  @relation(fields: [sessionId], references: [id])
}
```

**MCP 工具列表**：

| 工具 | 用途 |
|------|------|
| `open_session({projectId?, title?})` | 开启新会话 |
| `session_message({sessionId, tool, args})` | 在会话中执行任意现有工具 |
| `query_session_state({sessionId, include?})` | 查询当前会话状态快照 |
| `close_session({sessionId, persistNodes, persistRules})` | 结束会话 |

**开发量**：约 450 行

---

#### Phase 2 里程碑验收标准

| 编号 | 验证项 | 如何验证 |
|------|--------|---------|
| M2.1 | `analyze-project` 能正确扫描真实项目 | 对 `Governflow` 自身仓库执行 analyze-project，应检测出 TypeScript+Node 项目 |
| M2.2 | 项目级策略正确生成 | 返回的 `projectPolicyJson` 中包含项目专属策略 |
| M2.3 | 动态策略能正确触发认知图条件 | 制造一个"某个 PATTERN 出现 5 次以上"的场景，策略应触发对应的动作 |
| M2.4 | 多语言 AST 解析 | 对 Go/Rust/Java 的示例代码执行 capture_diff，其 AST 结构应能正确解析 |
| M2.5 | Session 工作流 | 开启 session → 执行多次 capture_diff → 查询状态 → 关闭，节点数应逐步累积 |

---

### Phase 3：可视化与外部集成

#### 3.1 P2-1: Web 仪表盘

**独立 package**：`packages/dashboard-web/`

**技术栈选择建议**：

| 组件 | 推荐选型 | 理由 |
|------|---------|------|
| 框架 | Vite + React 18 + TypeScript | 轻量、启动快、生态成熟，配合 Governflow 的 TypeScript 代码风格 |
| UI 组件 | shadcn/ui + Tailwind CSS | 与 Governflow 简约风格一致；与项目的 zod schema 风格可复用 |
| 图表 | Recharts | React 原生、易于定制、支持实时数据 |
| 认知图可视化 | D3.js + 力导向图（force-directed graph） | 足够灵活应对 PATTERN/INTENT/CONSTRAINT/HEURISTIC 四类节点和多种边关系 |
| 图标 | lucide-react | 与 shadcn/ui 配合良好 |
| 状态管理 | Zustand + SWR | 轻量无样板代码 |
| 表单 | react-hook-form + zod | 与 Governflow 的 zod schema 一致 |

**页面路由**：

```
/                            # 总览（仪表盘首页）
/projects                    # 项目列表
/projects/:id               # 项目详情（规则/认知图/指标 三合一视图）
/rules                       # 规则列表 + 搜索/过滤 + 编辑
/rules/:id                  # 单条规则详情 + 命中记录 + 审计日志
/graph                       # 认知图可视化（力导向图）
/conflicts                   # 规则冲突管理
/policies                    # 策略编辑器
/immune                      # 免疫循环监控 + 影子模式日志
/sessions                    # 工作流会话管理
/feedback                    # 用户反馈与 ROI 分析
/settings                    # 系统设置
```

**首页仪表盘设计**：

```
┌─────────────────────────────────────────────────────────────┐
│ Governflow                                                  │
│                                                             │
│  [总规则数: 42] [活跃: 38] [待审核: 3] [已归档: 1]         │
│  [认知节点: 189] [INTENT: 47] [PATTERN: 121] [CONSTRAINT:21]│
│                                                             │
│  ┌─ 7 日规则命中趋势 ─────────────────────────┐  ┌─ ROI 排行榜 ──┐
│  │                                             │  │              │ │
│  │  命中次数                                    │  │ Rule X 📈    │ │
│  │    ▲                                         │  │ Rule Y  ─    │ │
│  │   │               █                           │  │ Rule Z  ▼    │ │
│  │   │              █ █                          │  │              │ │
│  │   │             █  █ █      █                 │  └──────────────┘ │
│  │   │            █    █ █    █ █                │  ┌─ 冲突预警 ──┐ │
│  │   │           █       █  █ █ █                │  │              │ │
│  │          ■─┬──────────────┐   ■              │  │ 检测到 2 条  │ │
│  │         1d  2d  3d  4d  5d 6d 7d              │  │ 冲突待解决   │ │
│  └──────────────────────────────────────────────┘  └──────────────┘ │
│                                                             │
│  ┌─ 最近生成的规则 ────────────────────────┐                │
│  │  1. TSX 组件文件使用 PascalCase 命名     │ accept / reject │
│  │  2. Python 函数 docstring 首句大写      │ accept / reject │
│  │  3. 导入排序：标准库 → 第三方 → 本地     │ accept / reject │
│  └──────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

**后端 API 端点**：

复用 `src/transport/http-server.ts`，在 `/api` 下增加 REST 路由：

```
GET   /api/overview                → 首页统计数据
GET   /api/rules                   → 规则列表（分页/过滤/排序）
GET   /api/rules/:id              → 单条规则详情
POST  /api/rules/:id/confirm      → 接受规则（走 confirm-rule 处理）
POST  /api/rules/:id/reject       → 拒绝规则
PATCH /api/rules/:id              → 编辑规则
GET   /api/rules/:id/hits         → 命中历史
GET   /api/cognition/graph        → 认知图节点+边列表（供 D3 渲染）
GET   /api/cognition/nodes/:id   → 节点详情
GET   /api/conflicts              → 冲突列表
POST  /api/conflicts/:id/resolve → 解决冲突
GET   /api/policies               → 策略列表
POST  /api/policies/reload        → 重载策略（需要权限）
GET   /api/immune/logs            → 免疫循环日志
GET   /api/roi/trends             → ROI 趋势数据
POST  /api/sessions               → 新建会话
GET   /api/sessions/:id           → 会话详情
POST  /api/analyze-project        → 触发项目级扫描（异步，返回 jobId）
GET   /api/jobs/:id               → 查询异步任务状态
```

**开发量预估**：约 3500 行（前端 2500 行 + 后端 API 800 行 + 样式 200 行）

---

#### 3.2 P3-2: 外部集成集成 hub

**目录结构**：

```
src/integration-hub/
├─ webhook-server.ts       # 接收 Git push/PR 事件，自动 analyze_workspace
├─ github-action.yml       # GitHub Action 配置模板（作为单独文件发布）
├─ vscode-extension/       # VS Code 扩展
│   ├─ package.json
│   ├─ src/
│   │   ├─ extension.ts    # 扩展主入口
│   │   ├─ governflow-client.ts  # Governflow API 客户端
│   │   ├─ side-panel.tsx  # 侧边栏：展示当前文件适用的规则
│   │   ├─ code-action.ts  # Code Action：一键应用规则建议
│   │   └─ status-bar.ts   # 状态栏：显示命中数/冲突数等
│   └─ README.md
└─ git-hook-template.sh    # pre-commit hook 模板：提交前检查
```

**VS Code 扩展交互流程**：

```
用户在 VS Code 打开文件
    ↓
扩展监听文件打开事件
    ↓
调用 Governflow MCP query_rules(filePath, fileContent, language)
    ↓
在侧边栏展示：「此文件适用的规则建议」
  【规则标题】
  ├─ 示例代码片段（对比 before/after）
  ├─ confidence: high / medium / low
  ├─ hitCount: 123 / adoptedCount: 89
  ├─ [接受并应用]  [拒绝]  [稍后提醒]
  └─ [查看详细说明]

用户点击「接受并应用」
    ↓
→ 调用 confirm_rule(ruleId, accept)
→ 执行代码替换（用 vscode.WorkspaceEdit 写入 edit）
→ 显示成功提示，更新侧边栏计数
```

**开发量预估**：约 1200 行（GitHub Action/Webhook 200 行 + VS Code 扩展 1000 行）

---

#### Phase 3 里程碑验收标准

| 编号 | 验证项 | 如何验证 |
|------|--------|---------|
| M3.1 | 仪表盘可在浏览器中打开 | 启动 `npm run dev:dashboard`，访问 localhost:3001 可以看到首页 |
| M3.2 | 认知图可视化 | 有 PATTERN/INTENT/CONSTRAINT 节点数据时，力导向图正确渲染 |
| M3.3 | 规则管理 UI | 通过 UI 可以 accept/reject/edit 规则，数据库同步更新 |
| M3.4 | IDE 集成可用 | 在 VS Code 中加载扩展，打开 TypeScript 文件后侧边栏显示规则建议 |
| M3.5 | CI/CD 集成 | 在测试 GitHub PR 中运行 Governflow Action，自动提交 review comments |

---

### Phase 4：生态化

#### 4.1 P3-3: 插件 SDK

**核心设计原则**：

1. **简单**：一个插件 = 一个 npm package，一个 `governflow-plugin.ts` 入口
2. **零侵入**：插件不需要修改 Governflow 源码，通过 DI 容器注册和事件总线监听工作
3. **类型安全**：提供 `@governflow/sdk` TypeScript 类型包
4. **可调试**：插件可在 `verbose` 模式下输出详细日志

**插件 SDK 接口**：

```typescript
// packages/core/src/plugin/sdk.ts
import { Container } from "../di/container.js";
import { RuleSpec } from "../../core/types.js";
import type { JsonPolicy } from "../../governance/governance-types.js";

export interface GovernflowPluginMetadata {
  id: string;                     // 唯一标识，e.g. "@acme/governflow-python-style"
  name: string;
  version: string;                // semver
  author?: string;
  description?: string;
  homepage?: string;
  keywords?: string[];
  governflowVersion?: string;     // 兼容的 Governflow 版本约束，如 ">=1.0.0"
}

export interface GovernflowPluginHooks {
  // —— 代码生命周期 ——
  beforeCaptureDiff?: (input: CaptureDiffInput) => CaptureDiffInput | Promise<CaptureDiffInput>;
  afterCaptureDiff?: (output: DiffResult) => DiffResult | Promise<DiffResult>;

  // —— 规则生命周期 ——
  beforeRuleCreate?: (ruleSpec: RuleSpec) => RuleSpec | Promise<RuleSpec>;
  onRuleAccepted?: (ruleId: string, rule: Rule) => void | Promise<void>;
  onRuleRejected?: (ruleId: string, rule: Rule) => void | Promise<void>;

  // —— 认知图生命周期 ——
  onCognitionQuery?: (context: CognitionContext) => CognitionContext | Promise<CognitionContext>;
  onNodeCreated?: (node: CognitionNodeData) => void | Promise<void>;

  // —— 反馈生命周期 ——
  onFeedback?: (feedback: CognitionFeedbackRecord) => void | Promise<void>;

  // —— 系统生命周期 ——
  onStartup?: (container: Container) => void | Promise<void>;
  onShutdown?: () => void | Promise<void>;
}

export interface GovernflowPluginTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;  // JSON Schema
  handler: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export interface GovernflowPlugin {
  metadata: GovernflowPluginMetadata;
  hooks?: GovernflowPluginHooks;
  tools?: GovernflowPluginTool[];
  policies?: JsonPolicy[];
  ruleTemplates?: RuleSpec[];
}

export function definePlugin(plugin: GovernflowPlugin): GovernflowPlugin {
  return plugin;  // 类型守卫 + 未来可能的校验
}
```

**插件加载流程**：

```
 Governflow 启动
     ↓
 plugin-loader.scan()
     ↓
 ① 读取配置文件 .governflowrc.json 中的 plugin 列表
    {
      "plugins": [
        "@acme/governflow-python-style",
        "./local-plugins/custom-rules/index.js"
      ]
    }
     ↓
 ② 对每个 plugin 执行：
   - npm require() 加载模块
   - 读取 metadata 做版本兼容检查
   - 调用 onStartup(container) 注入依赖
   - 注册 hooks → 存储到 PluginHooks 注册表
   - 注册 tools → 加入 MCP tool 列表
   - 加载 policies → 注入 PolicyEngine
   - 加载 ruleTemplates → 写入 RuleRepo（status="pending"）
     ↓
 ③ 事件总线发出 "plugin.loaded" 事件
     ↓
 日志："成功加载 N 个插件"
```

**插件示例**：

```typescript
// package: @acme/governflow-python-style
import { definePlugin } from "@governflow/sdk";

export default definePlugin({
  metadata: {
    id: "acme-python-style",
    name: "Acme Python Style Guide",
    version: "1.0.0",
    author: "acme corp",
    description: "Enforce Acme team Python coding conventions",
  },

  ruleTemplates: [
    {
      type: "replace",
      pattern: "def functionName(",
      suggestion: "def function_name(",
      language: "python",
      tags: ["naming", "pep8"],
      confidence: "high",
      source: "plugin",
    },
    // ...
  ],

  policies: [
    {
      id: "acme-py-naming",
      name: "Python Naming Convention",
      description: "Enforce snake_case for functions, PascalCase for classes",
      scope: "project",
      severity: "WARN",
      status: "active",
      priority: 90,
      conditions: [
        { type: "tool_name", toolNames: ["capture_diff"] },
        { type: "file_path_match", pathPattern: ".*\\.py$" },
      ],
      actions: [{ type: "log_warning" }],
    },
  ],
});
```

**配套开发工具**：

```bash
# 管理插件的 CLI
governflow plugin list                        # 列出已安装
governflow plugin install @scope/package      # 安装新插件
governflow plugin remove plugin-id            # 卸载
governflow plugin enable plugin-id            # 启用/禁用
governflow plugin create ./my-plugin          # 生成插件模板项目
```

**开发量预估**：约 1000 行（SDK 类型定义 + 加载器 + CLI 命令 + 插件模板脚手架）

---

#### Phase 4 里程碑验收标准

| 编号 | 验证项 | 如何验证 |
|------|--------|---------|
| M4.1 | 第三方开发者可以通过 npm install 安装插件扩展 Governflow | 实际写一个示例插件 `governflow-plugin-demo`，验证规则/策略/MCP 工具三种扩展点都工作 |
| M4.2 | CLI plugin 子命令完整 | `governflow plugin list/install/remove/enable/create` 都能工作 |
| M4.3 | 插件可以正确向系统注入 hooks、工具、策略 | 编写的示例插件在运行时能改变 Governflow 的行为（如拦截 capture_diff 并打日志） |
| M4.4 | 生态文档完备 | `docs/plugins/` 有插件开发指南 + 3 个示例插件（规则类/策略类/MCP 工具类） |

---

## 四、整体开发量汇总

| 阶段 | 组件 | 估算代码行数 | 工时（人·周） |
|------|------|-------------|--------------|
| **Phase 1：基础闭环** | | **~700 行** | **~1.5 周** |
| | 规则生成引擎 | 250 | 0.5 |
| | query-rules 语义增强 | 180 | 0.3 |
| | 沙箱系统接入 | 120 | 0.2 |
| | ROI 闭环 | 150 | 0.3 |
| | 测试 + 文档 | （含在各模块） | 0.2 |
| | | | |
| **Phase 2：平台增强** | | **~2050 行** | **~3 周** |
| | analyze-project | 400 | 0.7 |
| | 动态策略系统 | 700 | 1.0 |
| | 多语言 parser 扩展 | 700 | 0.8 |
| | session-manager | 450 | 0.5 |
| | | | |
| **Phase 3：可视化与集成** | | **~4700 行** | **~3 周** |
| | Web 仪表盘（前端） | 2500 | 1.5 |
| | 仪表盘 API 后端 | 800 | 0.5 |
| | Webhook + GitHub Action | 200 | 0.2 |
| | VS Code 扩展 | 1000 | 0.8 |
| | | | |
| **Phase 4：生态化** | | **~1000 行** | **~1 周** |
| | 插件 SDK + 加载器 | 700 | 0.5 |
| | CLI plugin 子命令 | 200 | 0.2 |
| | 插件示例 + 文档 | 100 | 0.3 |
| | | | |
| **总计** | | **~8450 行** | **~8.5 周** |

> 注：上述为开发代码量（不含文档）。实际总代码量包括注释/类型/测试约为估算值的 1.5-2 倍。若团队规模为 2 人，全程约 6-8 周完成。

---

## 五、分阶段最小可交付（MVP）规划

为了降低风险，每个 Phase 都应拆分为独立可交付的 MVP：

```
Week 1-2: Phase 1 MVP
  └→ 只做 P0-1 + P0-2 （规则生成 + 语义匹配）
     交付标准：capture_diff 后可以自动生成规则
     验证：对 Governflow 自身仓库跑一遍，能产生 > 10 条有意义的规则

Week 3: Phase 1 补全
  └→ P2-3 + P2-4 （沙箱 + ROI）
     交付标准：系统自动根据 accept/reject 调整规则优先级和归档
     验证：模拟 20 次 accept + 5 次 reject，观察规则状态自动迁移

Week 4-6: Phase 2
  └→ 先做 analyze-project → 再做 dynamic-policy → 最后扩展 parser
     每个子项都是独立的 PR，可分步验收

Week 7-9: Phase 3
  └→ 先做仪表盘 API → 再做仪表盘 UI → 最后做 VS Code 扩展
     （API 先做完，UI 可以并行）

Week 10-11: Phase 4
  └→ 插件 SDK + 插件市场规范
     验证：一个外部开发者可以独立完成一个插件

Week 12: 文档与发布
  └→ README 更新 + changelog + 发布 v1.0.0 稳定版
```

---

## 六、测试策略

Governflow 当前已有完整的 `tests/` 和 `benchmarks/` 目录，新增模块应遵循统一风格：

| 层级 | 位置 | 工具 | 覆盖目标 |
|------|------|------|---------|
| 单元测试 | `tests/[模块名]/` | Vitest | 函数/类级别的正确性，≥ 80% |
| 集成测试 | `tests/integration/` | Vitest | 多模块协作的数据流 |
| E2E 测试 | `tests/e2e/` | 自建 harness | 端到端：输入真实代码 → 验证产物 |
| 基准测试 | `benchmarks/` | `node --test` + 自定义计时器 | 性能回归检测 |
| 类型检查 | 编译期 | TypeScript `strict` | 零警告 |
| 手工探索 | 本地运行 | 真实 IDE/CLI | 交互体验验收 |

**典型 E2E 测试场景示例**（针对 Phase 1 完成后）：

```
场景：代码变化 → 自动规则生成 → 规则验证 → 规则使用

Given 一个空的 Governflow 数据库
When 提交 10 个 TypeScript 文件到 capture_diff（同一模式）
  ① 文件 A：
    function getUserById( userId ){...}
    ...
  ② 文件 B：
    function getProductById( productId ){...}
    ...（共 10 个类似模式）
Then CognitionRepository 中产生 ≥ 3 个 PATTERN 节点
And  Rule 表中自动产生 ≥ 1 条 pending 状态的规则
And 该规则的 language 字段为 "typescript"
And 该规则的 shadowUntil 字段为 7 天后
When 运行 runImmuneCycle()
Then 该规则被检测为 "shadow 模式观察中"
When 再提交 2 个符合该规则的文件到 capture_diff
Then 该规则的 hitCount 增加到 ≥ 2
When 用户通过 confirm_rule(ruleId, "accept") 接受规则
Then 该规则状态变为 active
And adoptedCount 增加 1
And 对应 PATTERN/CONSTRAINT 节点 metadata 标记为 accepted
```

---

## 七、发布管理

**版本策略**：遵循 semver，当前版本 `1.0.0-alpha.7` → 稳定版路线：

```
alpha → beta → RC → stable
 1       2      3    4

  alpha.7 → alpha.8  (Phase 1 完成)
 alpha.8 → alpha.9  (Phase 2 完成)
 alpha.9 → beta.1   (Phase 3 MVP 完成)
  beta.1 → RC.1     (Phase 3 全部完成，无严重 bug)
    RC.1 → 1.0.0    (Phase 4 完成，生态文档齐备)
```

**每个 Phase 完成后的发布标准**：

- 所有计划模块已合并到 `main` 分支
- `npm run test` 全绿
- `npx tsc --strict` 零警告
- 新增模块有独立的测试文件且覆盖率 ≥ 80%
- README 中有新增功能的说明（或指向 `docs/` 中的详细文档）
- 有至少 1 个端到端测试场景验证该 Phase 的核心价值
- GitHub Actions CI 对 Linux/macOS/Windows 三个平台都通过

**向后兼容性**：

- MCP 工具的现有参数签名必须保持向后兼容（新增参数应设为可选并提供默认值）
- Prisma schema 变更必须使用 `prisma db push`（无破坏性的字段仅新增）
- 默认策略 JSON 格式保持兼容（新字段可选）
- CLI 命令的子命令新增但不改变原有行为

---

## 八、文档体系规划（配合代码）

```
Governflow/docs/
├─ architecture/
│   ├─ overview.md             # 系统架构概述（四层流水线 + 数据流图）
│   ├─ gaps.md                # ← 架构缺口分析（已完成）
│   ├─ enhancement-plan.md    # ← 本文件：增强方案路线图
│   └─ cognitive-graph.md      # 认知图设计文档（PATTERN/INTENT/CONSTRAINT 语义说明）
├─ user-guide/
│   ├─ getting-started.md      # 快速上手（5 分钟内跑通第一个项目）
│   ├─ mcp-tools.md           # 13 个 MCP 工具详细说明（输入/输出/示例）
│   ├─ cli.md                 # CLI 命令完整参考
│   ├─ dashboard.md           # 仪表盘使用指南
│   ├─ vscode.md              # VS Code 扩展使用指南
│   └─ rules-and-policies.md  # 规则与策略的区别、使用场景
├─ developer-guide/
│   ├─ setup.md               # 开发环境设置
│   ├─ testing.md             # 测试策略与编写规范
│   ├─ coding-style.md        # 代码风格约定
│   ├─ data-model.md          # 数据模型说明（12 张表的字段/关系/用途）
│   └─ plugin-developer.md    # 插件开发者指南（Phase 4 交付）
├─ plugins/                    # Phase 4 插件市场（插件说明文件集合）
│   └─ README.md
├─ changelog/                  # 版本更新日志
│   ├─ 1.0.0-alpha.7.md
│   └─ ...
└─ README.md                   # 项目入口，链接到上述文档
```

---

## 九、风险与缓解措施

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| **tree-sitter 语言包在 Windows/macOS ARM 平台编译失败** | 中 | 高 | 每个 parser 都有 fallback 实现；构建脚本检测平台，自动降级；CI 测试多平台 |
| **向量嵌入模型在某些环境不可用** | 中 | 中 | VectorStore 在向量不可用时自动降级到 TF-IDF 关键词匹配；匹配质量下降但不阻断 |
| **前端仪表盘设计与实现的契合度问题** | 中 | 低 | 在 Phase 3 开始前先做 HTML 原型评审；先实现 2-3 个核心页面做可用性测试 |
| **Plugin SDK 设计过度/实际使用不足** | 中 | 中 | Phase 4 之前先在 Phase 1-3 内部试用 3 次「hook 注入」模式，验证有效性后再做完整 SDK |
| **规则生成质量不足，产生大量低价值规则** | 高 | 高 | shadow 模式 + 免疫循环 + ROI 评分三重保护；初始阈值保守（occurrence ≥ 3 才生成）；人工接受率作为指标持续优化 |
| **认知图节点数增长导致性能问题** | 低 | 中 | CognitionNode.semanticHash 唯一索引做去重；GraphTraverser 限制 maxDepth；提供清理工具 |

---

## 十、与 Governflow 现有文档的关系

- 本文档是 `docs/architecture/gaps.md` 的**姊妹篇**（缺口分析 → 解决方案）
- 与 `packages/core` 的 `README.md` 保持一致的术语和层级结构
- Phase 4 完成后，本路线图应**归档**为 `changelog/1.0.0-roadmap.md`，并更新为 `1.x-roadmap.md` 继续规划后续版本

---

## 十一、更新记录

| 版本 | 日期 | 更新内容 |
|------|------|---------|
| 1.1 | 2026-06-21 | 版本升级至 v1.0.0-alpha.9；同步当前版本状态 |
| 1.0 | 2026-06-18 | 初始版本，完整四阶段路线规划 |
