# MCP Rule Engine — 优化计划表

> 基于 `D:\Desktop\mcp` 本地工程完整检索，结合战略分析制定。
> 生成时间：2026-06-16

---

## 📋 优先级定义

| 级别 | 含义 | 时机 |
|------|------|------|
| **P0** | 必须在 v1.0 GA 前完成 | 立即启动 |
| **P1** | v1.0 发布后第一个迭代 | v1.0 + 2 周 |
| **P2** | 中期优化，根据实际瓶颈推进 | v1.1 ~ v1.2 |
| **P3** | 长期愿景，条件成熟时启动 | v2.0+ |

---

## 🔴 P0 — v1.0 GA 前必须完成

### #1 Proposal 持久化（治理完整性底线）

| 属性 | 值 |
|------|-----|
| **优先级** | P0 |
| **预估工时** | 2~3 天 |
| **依赖** | 无 |

**目标**：将 `injection-approval.ts` 中的纯内存 `Map<string, Proposal>` 迁移至 SQLite 持久化存储。

**改动文件**：
- `prisma/schema.prisma` — 新增 `Proposal` 表
- `src/tools/injection-approval.ts` — 替换内存 Map 为 Prisma CRUD
- `src/storage/cognition-repository.ts` — 新增 proposal 相关查询方法
- `tests/tools/injection-approval.test.ts` — 新增（当前缺失）

**Proposal 表结构**：
```prisma
model Proposal {
  id          String   @id @default(cuid())
  status      String   @default("PENDING") // PENDING | APPROVED | REJECTED | EXPIRED
  toolName    String
  payload     String   // JSON
  proposedBy  String?
  reviewedBy  String?
  reviewNote  String?
  expiresAt   DateTime
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([status])
  @@index([expiresAt])
}
```

**验收标准**：
- [ ] 进程重启后 PENDING proposal 可恢复
- [ ] 过期 proposal 自动标记为 EXPIRED
- [ ] 现有 126 个测试不退化
- [ ] 新增 >= 8 个 proposal 生命周期测试

---

### #2 统一 Server 元数据

| 属性 | 值 |
|------|-----|
| **优先级** | P0 |
| **预估工时** | 0.5 天 |
| **依赖** | 无 |

**目标**：修复 Server name/version 与 package.json 不一致。

**改动文件**：
- `src/index.ts:38` — name `"agent-tuning-reverse-graph"` → `"mcp-cognition-engine"`
- `src/index.ts:38` — version `"0.1.0"` → `"1.0.0-alpha.2"`

**验收标准**：
- [ ] MCP 客户端显示的 server name 与 npm package name 一致
- [ ] 版本号与 package.json 同步

---

### #3 前置入参校验（Schema-First）

| 属性 | 值 |
|------|-----|
| **优先级** | P0 |
| **预估工时** | 2 天 |
| **依赖** | 无 |

**目标**：对所有 tool 入参做 zod 校验，失败直接返回 `isError=true`。

**改动文件**：
- `src/tools/*.ts` — 每个 handler 入口加 zod schema 校验
- `src/middleware/response-validation.ts` — 保留为兜底，文档化定位
- `package.json` — 新增 `zod` 依赖

**验收标准**：
- [ ] 缺少必填字段时返回结构化错误
- [ ] 非法类型时返回 `isError: true`
- [ ] 新增 >= 6 个入参校验测试

---

### #4 补全 injection-approval 测试覆盖

| 属性 | 值 |
|------|-----|
| **优先级** | P0 |
| **预估工时** | 1 天 |
| **依赖** | #1 |

**目标**：当前 `tests/tools/` 下无 `injection-approval.test.ts`，治理链路核心必须覆盖。

**新增文件**：
- `tests/tools/injection-approval.test.ts`

**测试场景**：
- 创建 proposal → 返回 PENDING + expiresAt
- approve/reject proposal → 状态变更 + 审计记录
- 过期 proposal → 自动 EXPIRED
- 重复 approve → 报错
- 并发 approve（race condition）→ 只有一个成功

**验收标准**：
- [ ] 新增 >= 10 个测试用例
- [ ] 覆盖率 >= 90%

---

### #5 批量查询优化（消除 N+1）

| 属性 | 值 |
|------|-----|
| **优先级** | P0 |
| **预估工时** | 2~3 天 |
| **依赖** | 无 |

**目标**：消除 `GraphTraverser.traverse()` 中每步单节点 `getSubgraph()` 的 N+1 查询。

**改动文件**：
- `src/cognition-engine/graph-traverser.ts` — 重构 frontier 循环
- `src/storage/cognition-repository.ts` — 新增 `getSubgraphBatch(nodeIds)` 方法
- `benchmarks/graph-traverser.bench.ts` — 新增批量场景基准

**实现方案**：
```typescript
async getSubgraphBatch(rootNodeIds: string[], maxDepth = 1): Promise<SubgraphResult> {
  const prisma = getPrismaClient();
  const edges = await prisma.cognitionEdge.findMany({
    where: { sourceId: { in: rootNodeIds } },
  });
  const targetIds = [...new Set(edges.map(e => e.targetId))];
  const nodes = await prisma.cognitionNode.findMany({
    where: { id: { in: targetIds } },
  });
  return { nodes: nodes.map(toCognitionNode), edges: edges.map(toCognitionEdge) };
}
```

**SQLite IN (...) 分片**：
```typescript
function chunkedIn<T>(ids: T[], chunkSize = 900): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }
  return chunks;
}
```

**验收标准**：
- [ ] 1000 节点图 traverse 延迟降低 >= 50%
- [ ] bench 基准测试通过
- [ ] 现有测试不退化

---

### #6 CognitionEdge 索引优化

| 属性 | 值 |
|------|-----|
| **优先级** | P0 |
| **预估工时** | 0.5 天 |
| **依赖** | 无 |

**改动文件**：
- `prisma/schema.prisma` — 为 CognitionEdge 添加索引

```prisma
model CognitionEdge {
  // ...existing fields...
  @@index([sourceId])
  @@index([targetId])
  @@index([relation])
}
```

**验收标准**：
- [ ] 查询计划确认使用索引
- [ ] bench 基准测试无退化

---

## 🟡 P1 — v1.0 后第一个迭代（2 周内）

### #7 策略层抽离（Policy-as-Code）

| 属性 | 值 |
|------|-----|
| **优先级** | P1 |
| **预估工时** | 4~5 天 |
| **依赖** | #1, #3 |

**目标**：将硬约束/软警告判断逻辑抽离为独立策略层。

**改动文件**：
- `src/policy-engine/types.ts` — PolicyRule, PolicyResult 接口
- `src/policy-engine/engine.ts` — PolicyEngine 类
- `src/policy-engine/builtin-rules/` — 内置规则
- `src/cognition-engine/constraint-validator.ts` — 改为调用 PolicyEngine
- `tests/policy-engine/` — 新增测试目录

**接口设计**：
```typescript
interface PolicyEngine {
  evaluate(ctx: PolicyContext): Promise<PolicyResult>;
}

interface PolicyContext {
  toolName: string;
  input: unknown;
  traversalResult: TraversalResult;
  projectConfig?: ProjectPolicyConfig;
}

interface PolicyResult {
  decision: "ALLOW" | "WARN" | "REJECT";
  reason: string;
  matchedRules: string[];
  suggestedPatch?: string;
}
```

**验收标准**：
- [ ] 三类规则可独立配置
- [ ] 策略规则可 JSON 热更新
- [ ] 新增 >= 12 个策略引擎测试

---

### #8 统一日志 + 结构化指标

| 属性 | 值 |
|------|-----|
| **优先级** | P1 |
| **预估工时** | 2 天 |
| **依赖** | 无 |

**改动文件**：
- `src/observability/logger.ts` — pino 结构化日志封装
- `src/observability/metrics.ts` — 指标收集器
- `src/**/*.ts` — 替换 console.error / writeFileSync
- `package.json` — 新增 `pino` 依赖

**日志字段规范**：
```json
{
  "ts": "2026-06-16T22:00:00.000Z",
  "level": "warn",
  "tool": "cognition_query",
  "latencyMs": 142,
  "truncated": false,
  "validationRequired": true,
  "outcome": "ALLOW",
  "msg": "traversal completed"
}
```

**验收标准**：
- [ ] 所有日志输出为 JSON 格式
- [ ] `logs/validation-warnings.log` 不再产生
- [ ] `cognition_metrics` resource 暴露关键指标

---

### #9 补全缺失测试

| 属性 | 值 |
|------|-----|
| **优先级** | P1 |
| **预估工时** | 2~3 天 |
| **依赖** | 无 |

**新增文件**：
- `tests/tools/config-tools.test.ts`
- `tests/tools/list-rules.test.ts`
- `tests/tools/resolve-conflict.test.ts`
- `tests/middleware/response-validation.test.ts`

**验收标准**：
- [ ] 总测试数 >= 150（当前 126）
- [ ] tools/ 和 middleware/ 覆盖率 >= 80%

---

## 🟢 P2 — 中期优化（v1.1 ~ v1.2）

### #10 LRU 缓存层

| 属性 | 值 |
|------|-----|
| **优先级** | P2 |
| **预估工时** | 2 天 |
| **依赖** | #5 |

**改动文件**：
- `src/storage/cache.ts` — LRU 缓存封装
- `src/storage/cognition-repository.ts` — 集成缓存

**缓存策略**：
- semanticHash → nodeIds（TTL: 5min）
- nodeId → neighbors（TTL: 2min）
- LRU 容量：1000 entries

---

### #11 统一 tree-sitter 依赖

| 属性 | 值 |
|------|-----|
| **优先级** | P2 |
| **预估工时** | 2~3 天 |
| **依赖** | 无 |

**目标**：统一 native + WASM 为单一 `web-tree-sitter` 实现。

**改动文件**：
- `src/legacy-engine/parsers.ts` — 移除 native 调用
- `package.json` — 移除 `tree-sitter`、`tree-sitter-javascript`、`tree-sitter-python`、`tree-sitter-typescript`

**验收标准**：
- [ ] CI/Docker 无需 native 编译
- [ ] 包体积减小 >= 30%
- [ ] AST 解析测试不退化

---

### #12 Prisma 迁移流程规范化

| 属性 | 值 |
|------|-----|
| **优先级** | P2 |
| **预估工时** | 1 天 |
| **依赖** | 无 |

**改动文件**：
- `src/cli.ts` — dev 保留 auto push，prod 强制 migrate deploy
- `scripts/migrate-prod.sh` + `scripts/migrate-prod.ps1`
- `CONTRIBUTING.md` — 更新文档

---

### #13 性能基准门禁

| 属性 | 值 |
|------|-----|
| **优先级** | P2 |
| **预估工时** | 1 天 |
| **依赖** | #5 |

**改动文件**：
- `.github/workflows/bench.yml`
- `benchmarks/` — 补充 traverse 批量场景

---

## 🔵 P3 — 长期愿景（v2.0+）

### #14 存储层抽象 + Postgres 适配器

| 属性 | 值 |
|------|-----|
| **优先级** | P3 |
| **预估工时** | 5~7 天 |
| **触发条件** | QPS > 50 或数据量 > 10GB |

**改动文件**：
- `src/storage/repository.ts` — ICognitionRepository 接口
- `src/storage/sqlite-repository.ts` — 当前实现
- `src/storage/postgres-repository.ts` — Postgres 适配器

---

### #15 Embedding + 向量检索

| 属性 | 值 |
|------|-----|
| **优先级** | P3 |
| **预估工时** | 5~7 天 |
| **触发条件** | semanticHash 召回率不足 |

**方案**：接入 embedding API + pgvector/HNSW，作为可选插件。

---

### #16 Approval Workflow Service

| 属性 | 值 |
|------|-----|
| **优先级** | P3 |
| **预估工时** | 7~10 天 |
| **触发条件** | 3+ 非 MCP 客户端需要审批流 |

**功能**：REST API + Webhook + 多 reviewer + 超时策略。

---

## 📊 依赖关系图

```
#1 Proposal 持久化 ──┬──▶ #4 补全测试
                     └──▶ #7 策略层抽离 ──▶ #16 Workflow Service
#2 统一元数据
#3 前置校验
#5 批量查询 ──┬──▶ #10 LRU 缓存 ──▶ #14 Postgres 适配器
              └──▶ #13 性能门禁
#6 索引优化
#8 统一日志
#9 补全测试
#11 tree-sitter 统一
#12 迁移规范化
```

---

## 📅 里程碑时间线

| 里程碑 | 时间 | 包含任务 | 交付物 |
|--------|------|---------|--------|
| **v1.0-beta.1** | Week 1~2 | #1, #2, #3, #6 | 持久化 proposal + 入参校验 + 索引 |
| **v1.0 GA** | Week 3~4 | #4, #5 | 测试补全 + 批量查询优化 |
| **v1.1** | Week 5~6 | #7, #8, #9 | 策略层 + 统一日志 + 测试覆盖 |
| **v1.2** | Week 7~8 | #10, #11, #12, #13 | 缓存 + tree-sitter + CI 门禁 |
| **v2.0** | 按需 | #14, #15, #16 | Postgres + Embedding + Workflow |

---

## ⚠️ 执行纪律

1. **每个任务必须配套测试**：新增功能 >= 8 个用例，bugfix >= 1 个回归用例
2. **126 个现有测试不可退化**：每次 PR 前 `npm test` 全量通过
3. **性能基准不可回退**：每次 PR 前 `npm run bench` 通过
4. **文档同步更新**：涉及 API 变更时更新 `docs/api-reference.md`
5. **渐进式严格度**：校验先 warn-only，收集数据后再切 hard-block

---

*生成工具：Codex CLI | 源码路径：D:\Desktop\mcp*
*仓库地址：https://github.com/sole03/mcp-rule-engine*
