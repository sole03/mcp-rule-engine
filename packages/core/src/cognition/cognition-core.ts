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
 * @file CognitionCore — 协议无关的认知治理内核
 *
 * 认知引擎 + 治理系统的统一入口。
 * 所有外部适配器（MCP、CLI、CI）通过此类与内核交互。
 * 不依赖任何传输协议。
 */

import type { Container } from "../di/container.js";
import type { DomainEvent } from "../events/domain-events.js";

// ── Types ──

export interface ExecuteRequest {
  tool: string;
  input: Record<string, unknown>;
  /** 可选的协程 ID，用于异步追踪 */
  correlationId?: string;
}

export interface ExecuteResult {
  content: { type: string; text: string }[];
  isError?: boolean;
  _meta?: {
    policyWarnings?: string[];
    requiresApproval?: boolean;
    correlationId?: string;
  };
}

// ── Core ──

export class CognitionCore {
  constructor(private container: Container) {}

  /** 获取容器（供外部扩展） */
  getContainer(): Container {
    return this.container;
  }

  /**
   * 启动内核：注册事件处理器、预热服务。
   * 应在任何 execute() 调用前执行。
   */
  async start(): Promise<void> {
    const { eventBus, policyEngine, vectorStore } = this.container;

    // 注册跨子系统事件处理器
    eventBus.on("cognition.query.requested", this._onQueryRequested.bind(this), "NORMAL");
    eventBus.on("cognition.feedback.recorded", this._onFeedbackRecorded.bind(this), "LOW");

    // 策略变更时预热
    const policies = policyEngine.getAllPolicies();
    eventBus.emit({
      type: "governance.policy.evaluated",
      payload: {
        toolName: "core.start",
        allowed: true,
        requiresApproval: false,
        matchedPolicyIds: (policies as any[]).map((p: any) => p.id),
        warnings: [],
      },
    }, true);

    // 预热 embeddings (fire-and-forget)
    vectorStore.embedUnembeddedNodes(20).then(count => {
      if (count > 0) {
        eventBus.emit({
          type: "cognition.feedback.recorded",
          payload: { nodeId: "core.start", outcome: "ACCEPTED", weightDelta: 0, feedbackId: `embed_warmup_${count}` },
        });
      }
    }).catch(() => {});

    return Promise.resolve();
  }

  /**
   * 执行工具调用 — 外部适配器的主入口。
   *
   * 流程：
   *   1. 策略评估 (BLOCK → 拒绝)
   *   2. 路由到对应 handler
   *   3. 注入元数据 (policy warnings, approval flag)
   */
  async execute(req: ExecuteRequest): Promise<ExecuteResult> {
    const { tool, input, correlationId } = req;
    const cid = correlationId ?? `${tool}_${Date.now()}`;

    // 1. 策略评估
    const policyResult = this.container.policyEngine.evaluate({
      toolName: tool,
      filePath: input.filePath as string | undefined,
      language: input.language as string | undefined,
      contentHash: input.contextHash as string | undefined,
      diffSize: input.originalContent && input.modifiedContent
        ? Math.abs(String(input.modifiedContent).length - String(input.originalContent).length)
        : undefined,
      projectId: input.projectId as string | undefined,
      metadata: input as Record<string, unknown>,
    });

    // 策略事件
    this.container.eventBus.emit({
      type: "governance.policy.evaluated",
      payload: {
        toolName: tool,
        allowed: policyResult.allowed,
        requiresApproval: policyResult.requiresApproval,
        matchedPolicyIds: policyResult.matchedPolicies.map((p: any) => p.policyId ?? p.id),
        warnings: policyResult.warnings,
      },
    });

    if (!policyResult.allowed) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Blocked by policy",
            policyWarnings: policyResult.warnings,
            matchedPolicies: policyResult.matchedPolicies.map((p: any) => ({
              id: p.policyId ?? p.id,
              name: p.policyName ?? (p as any).name,
            })),
          }),
        }],
        isError: true,
        _meta: { correlationId: cid, policyWarnings: policyResult.warnings, requiresApproval: policyResult.requiresApproval },
      };
    }

    // 2. 路由到 handler
    try {
      const result = await this._dispatch(tool, input, cid);

      // 3. 注入元数据
      if (policyResult.warnings.length > 0 && result.content?.[0]?.text) {
        try {
          const parsed = JSON.parse(result.content[0].text);
          if (typeof parsed === "object" && !Array.isArray(parsed)) {
            parsed._policyWarnings = policyResult.warnings;
            parsed._requiresApproval = policyResult.requiresApproval;
            result.content[0].text = JSON.stringify(parsed);
          }
        } catch {
          // 非 JSON 内容，不注入
        }
      }

      return {
        ...result,
        _meta: { correlationId: cid, policyWarnings: policyResult.warnings, requiresApproval: policyResult.requiresApproval },
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: String(err) }) }],
        isError: true,
        _meta: { correlationId: cid },
      };
    }
  }

  /**
   * 关闭内核，清理资源。
   */
  async shutdown(): Promise<void> {
    this.container.eventBus.reset();
    // DB 连接由外部管理（保持向后兼容）
  }

  // ── Private: Event Handlers ──

  private async _onQueryRequested(event: DomainEvent & { type: "cognition.query.requested" }): Promise<void> {
    const { contextHash, intentHint, maxDepth, correlationId } = event.payload;
    // 桥接: 触发认知查询 → 委托给图遍历器 (由外部 adapter 实现)
    // 此处仅记录事件，实际遍历由 GraphTraverser 完成
    this.container.metricRepo.track("cognition_query_requested", event.payload).catch(() => {});
  }

  private async _onFeedbackRecorded(event: DomainEvent & { type: "cognition.feedback.recorded" }): Promise<void> {
    const { nodeId, edgeId, outcome, weightDelta, feedbackId } = event.payload;

    if (edgeId) {
      try {
        await this.container.cognitionRepo.updateEdgeWeight(edgeId, weightDelta);
      } catch {
        // 边可能不存在，忽略
      }
    }
    await this.container.cognitionRepo.resolveFeedbackEvent(feedbackId, outcome, edgeId, weightDelta);
    await this.container.metricRepo.track("cognition_feedback_applied", event.payload).catch(() => {});
  }

  // ── Private: Tool Dispatch ──

  private async _dispatch(tool: string, input: Record<string, unknown>, cid: string): Promise<ExecuteResult> {
    // 委托给外部 handler 注册表。默认返回错误，提示注入 handler。
    // 适配器可以覆写此方法或在容器中注入自定义 handler。

    const handler = this._handlers.get(tool);
    if (handler) {
      return handler(input, cid);
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: `No handler registered for tool: ${tool}. Register handlers via core.registerHandler() or use a protocol adapter.`,
        }),
      }],
      isError: true,
    };
  }

  private _handlers = new Map<string, (input: Record<string, unknown>, cid: string) => Promise<ExecuteResult>>();

  /**
   * 注册工具处理器。
   * 协议适配器（MCP、CLI、CI）调用此方法注入其 handler 实现。
   *
   * 示例：
   *   core.registerHandler("analyze_workspace", async (input, cid) => {
   *     return await handleAnalyzeWorkspace(input);
   *   });
   */
  registerHandler(
    tool: string,
    handler: (input: Record<string, unknown>, correlationId: string) => Promise<ExecuteResult>,
  ): void {
    this._handlers.set(tool, handler);
  }

  /**
   * 批量注册处理器。
   */
  registerHandlers(
    handlers: Record<string, (input: Record<string, unknown>, correlationId: string) => Promise<ExecuteResult>>,
  ): void {
    for (const [tool, handler] of Object.entries(handlers)) {
      this._handlers.set(tool, handler);
    }
  }

  /** 列出已注册的工具 */
  listHandlers(): string[] {
    return [...this._handlers.keys()];
  }
}
