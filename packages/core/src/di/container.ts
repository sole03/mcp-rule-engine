/**
 * Copyright 2026 熊高锐
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @file DI Container — 依赖注入容器
 *
 * 统一管理所有子系统实例，替换全局单例。
 * 支持生产容器 (SQLite + Prisma) 和测试容器 (可注入 mock)。
 */

import { EventBus } from "../events/bus.js";

// ── 接口抽象（与 src/data/repository-interfaces.ts 对齐）──

export interface ICognitionRepository {
  findNodesBySemanticHash(hash: string): Promise<unknown[]>;
  findNodeById(id: string): Promise<unknown | null>;
  getSubgraph(rootNodeId: string, maxDepth?: number): Promise<unknown>;
  getSubgraphBatch(rootNodeIds: string[]): Promise<unknown>;
  updateEdgeWeight(edgeId: string, delta: number): Promise<unknown>;
  createNodeWithEdges(node: unknown, edges?: unknown[]): Promise<unknown>;
  createAstTemplate(input: unknown): Promise<unknown>;
  findEdgesByRelation(relation: string): Promise<unknown[]>;
  deleteNode(id: string): Promise<void>;
  recordFeedbackEvent(nodeId: string, edgeId?: string, outcome?: string, comment?: string): Promise<{ feedbackId: string }>;
  resolveFeedbackEvent(feedbackId: string, outcome: string, edgeId?: string, weightDelta?: number): Promise<void>;
}

export interface IRuleRepository {
  create(spec: unknown): Promise<unknown>;
  findById(id: string): Promise<unknown | null>;
  updateStatus(id: string, status: string): Promise<unknown>;
  queryByMatch(lang: string, ext: string, projectId?: string, tags?: string[]): Promise<unknown[]>;
  list(filters: Record<string, unknown>): Promise<unknown[]>;
  findConflicting(type: string, lang: string, pattern: string): Promise<unknown[]>;
  updateContent(id: string, data: Record<string, unknown>): Promise<unknown>;
  getRuleVersions(ruleId: string): Promise<unknown[]>;
  countByScope(scope: string): Promise<number>;
  batchCreate(specs: unknown[]): Promise<unknown[]>;
  incrementMatchCount(id: string): Promise<void>;
  isLimitReached(): Promise<boolean>;
  getLimitInfo(projectId?: string): Promise<unknown>;
}

export interface IDiffLogRepository {
  create(data: Record<string, unknown>): Promise<unknown>;
  countByPattern(lang: string, hash: string, days: number): Promise<number>;
  countDistinctFiles(lang: string, hash: string, days: number): Promise<number>;
}

export interface IConflictRepository {
  findById(id: string): Promise<unknown | null>;
  findExisting(a: string, b: string): Promise<unknown | null>;
  create(data: Record<string, unknown>): Promise<unknown>;
  resolve(id: string, resolution: string): Promise<void>;
  setBatchChoice(id: string, choice: string): Promise<void>;
}

export interface IMetricRepository {
  track(eventType: string, props?: Record<string, unknown>): Promise<void>;
  count(eventType: string, since?: number): Promise<number>;
}

export interface IPolicyEngine {
  loadPolicies(policies: unknown[]): void;
  evaluate(ctx: Record<string, unknown>): { allowed: boolean; requiresApproval: boolean; warnings: string[]; matchedPolicies: unknown[] };
  getActivePolicies(): unknown[];
  getAllPolicies(): unknown[];
}

export interface IImmuneEngine {
  runCycle(): Promise<Record<string, unknown>>;
  getStats(): Promise<Record<string, unknown>>;
  canInject(): Promise<{ allowed: boolean; reason: string }>;
}

export interface IWorkflowService {
  submitRequest(proposalId: string, config: unknown): Promise<unknown>;
  castVote(id: string, reviewer: string, decision: string, comment?: string): Promise<unknown>;
  escalate(id: string): Promise<unknown>;
  listPendingForReviewer(id: string): Promise<unknown[]>;
  listActive(): Promise<unknown[]>;
  getRequest(id: string): Promise<unknown | null>;
  cancel(id: string): Promise<unknown>;
  processExpired(): Promise<{ escalated: number; expired: number }>;
}

export interface IEmbeddingService {
  embed(text: string): Promise<{ vector: number[]; dimensions: number; model: string }>;
  embedBatch(texts: string[]): Promise<{ vector: number[]; dimensions: number; model: string }[]>;
  similarity(a: number[], b: number[]): number;
}

export interface IVectorStore {
  embedNode(nodeId: string, text: string): Promise<number[] | null>;
  embedUnembeddedNodes(batchSize?: number): Promise<number>;
  searchSimilar(query: string, topK?: number, minScore?: number): Promise<{ node: unknown; score: number }[]>;
}

// ── Container ──

export interface Container {
  eventBus: EventBus;
  cognitionRepo: ICognitionRepository;
  ruleRepo: IRuleRepository;
  diffLogRepo: IDiffLogRepository;
  conflictRepo: IConflictRepository;
  metricRepo: IMetricRepository;
  policyEngine: IPolicyEngine;
  immuneEngine: IImmuneEngine;
  workflowService: IWorkflowService;
  vectorStore: IVectorStore;
  embeddingService: IEmbeddingService;
}

/**
 * 创建生产容器。
 * 通过 DI 注入所有子系统。调用方可覆盖任意组件以适配不同环境。
 */
export function createContainer(overrides?: Partial<Container>): Container {
  const eventBus = overrides?.eventBus ?? new EventBus();

  // 延迟加载现有单例 — 保持向后兼容
  const lazy = <T>(factory: () => T): { get: () => T } => {
    let instance: T | undefined;
    return { get: () => { if (!instance) instance = factory(); return instance; } };
  };

  const ruleRepo = lazy(() => {
    const { RuleRepo } = require("../../../src/data/rule-repo.js");
    return new RuleRepo() as IRuleRepository;
  });

  const cognitionRepo = lazy(() => {
    const { CognitionRepository } = require("../../../src/data/cognition-repository.js");
    return new CognitionRepository() as ICognitionRepository;
  });

  const policyEngine = lazy(() => {
    const { PolicyEngine } = require("../../../src/governance/policy-engine.js");
    const { DEFAULT_POLICIES } = require("../../../src/governance/default-policies.js");
    const engine = new PolicyEngine(DEFAULT_POLICIES);
    return engine as IPolicyEngine;
  });

  return {
    eventBus,
    cognitionRepo: overrides?.cognitionRepo ?? cognitionRepo.get(),
    ruleRepo: overrides?.ruleRepo ?? ruleRepo.get(),
    diffLogRepo: overrides?.diffLogRepo ?? lazy(() => {
      const { DiffLogRepo } = require("../../../src/data/diff-log-repo.js");
      return new DiffLogRepo() as IDiffLogRepository;
    }).get(),
    conflictRepo: overrides?.conflictRepo ?? lazy(() => {
      const { ConflictRepo } = require("../../../src/data/conflict-repo.js");
      return new ConflictRepo(ruleRepo.get() as any) as IConflictRepository;
    }).get(),
    metricRepo: overrides?.metricRepo ?? lazy(() => {
      const { MetricRepo } = require("../../../src/data/metric-repo.js");
      return new MetricRepo() as IMetricRepository;
    }).get(),
    policyEngine: overrides?.policyEngine ?? policyEngine.get(),
    immuneEngine: overrides?.immuneEngine ?? lazy(() => {
      const { RuleImmuneEngine } = require("../../../src/governance/rule-immune.js");
      return new RuleImmuneEngine() as IImmuneEngine;
    }).get(),
    workflowService: overrides?.workflowService ?? lazy(() => {
      const { ApprovalWorkflowService } = require("../../../src/governance/approval-workflow.js");
      return new ApprovalWorkflowService() as IWorkflowService;
    }).get(),
    vectorStore: overrides?.vectorStore ?? lazy(() => {
      const { VectorStore } = require("../../../src/adapters/embedding/vector-store.js");
      return new VectorStore() as IVectorStore;
    }).get(),
    embeddingService: overrides?.embeddingService ?? lazy(() => {
      const { getEmbeddingService } = require("../../../src/adapters/embedding/openai-adapter.js");
      return getEmbeddingService() as IEmbeddingService;
    }).get(),
  };
}

/**
 * 创建测试容器 — 所有依赖注入 mock。
 */
export function createTestContainer(mocks: Partial<Container> = {}): Container {
  const eventBus = mocks.eventBus ?? new EventBus();

  const noop = () => {};

  return {
    eventBus,
    cognitionRepo: mocks.cognitionRepo ?? {
      findNodesBySemanticHash: async () => [],
      findNodeById: async () => null,
      getSubgraph: async () => ({ nodes: [], edges: [] }),
      getSubgraphBatch: async () => ({ nodes: [], edges: [] }),
      updateEdgeWeight: async () => ({ weight: 0 }),
      createNodeWithEdges: async () => ({ id: "mock" }),
      createAstTemplate: async () => ({ id: "mock" }),
      findEdgesByRelation: async () => [],
      deleteNode: async () => {},
      recordFeedbackEvent: async () => ({ feedbackId: "mock" }),
      resolveFeedbackEvent: async () => {},
    },
    ruleRepo: mocks.ruleRepo ?? {
      create: async () => ({ id: "mock" }),
      findById: async () => null,
      updateStatus: async () => ({ id: "mock" }),
      queryByMatch: async () => [],
      list: async () => [],
      findConflicting: async () => [],
      updateContent: async () => ({ id: "mock" }),
      getRuleVersions: async () => [],
      countByScope: async () => 0,
      batchCreate: async () => [],
      incrementMatchCount: async () => {},
      isLimitReached: async () => false,
      getLimitInfo: async () => ({ reached: false, globalCount: 0, globalMax: 3000, projectCount: 0, projectMax: 2000 }),
    },
    diffLogRepo: mocks.diffLogRepo ?? {
      create: async () => ({ id: "mock" }),
      countByPattern: async () => 0,
      countDistinctFiles: async () => 0,
    },
    conflictRepo: mocks.conflictRepo ?? {
      findById: async () => null,
      findExisting: async () => null,
      create: async () => ({ id: "mock" }),
      resolve: async () => {},
      setBatchChoice: async () => {},
    },
    metricRepo: mocks.metricRepo ?? {
      track: async () => {},
      count: async () => 0,
    },
    policyEngine: mocks.policyEngine ?? {
      loadPolicies: noop,
      evaluate: () => ({ allowed: true, requiresApproval: false, warnings: [], matchedPolicies: [] }),
      getActivePolicies: () => [],
      getAllPolicies: () => [],
    },
    immuneEngine: mocks.immuneEngine ?? {
      runCycle: async () => ({ coldStartImmune: 0, autoRenewed: 0, archived: 0, revived: 0, conflictLocked: false, summary: "" }),
      getStats: async () => ({ coldStartCount: 0, expiringCount: 0, coldStorageCount: 0, conflictRate: 0, conflictLocked: false }),
      canInject: async () => ({ allowed: true, reason: "ok" }),
    },
    workflowService: mocks.workflowService ?? {
      submitRequest: async () => ({ id: "mock", stage: "PENDING" }),
      castVote: async () => ({ id: "mock", stage: "PENDING_REVIEW" }),
      escalate: async () => ({ id: "mock", stage: "ESCALATED" }),
      listPendingForReviewer: async () => [],
      listActive: async () => [],
      getRequest: async () => null,
      cancel: async () => ({ id: "mock", stage: "CANCELLED" }),
      processExpired: async () => ({ escalated: 0, expired: 0 }),
    },
    vectorStore: mocks.vectorStore ?? {
      embedNode: async () => null,
      embedUnembeddedNodes: async () => 0,
      searchSimilar: async () => [],
    },
    embeddingService: mocks.embeddingService ?? {
      embed: async () => ({ vector: [0], dimensions: 1, model: "mock" }),
      embedBatch: async () => [{ vector: [0], dimensions: 1, model: "mock" }],
      similarity: () => 0,
    },
  };
}
