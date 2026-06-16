/**
 * @file @sole03/rule-engine-core — 协议无关的认知治理内核
 *
 * 统一导出所有公共 API。
 * 该包不依赖任何 MCP SDK，可被任意 Agent 运行时消费。
 *
 * Phase 1: EventBus + DI Container + CognitionCore
 * Phase 2: CowSandbox + SelfHealController + SafetyValve
 * Phase 3: Constraint DSL + Templates + Runtime + ConstraintArbitrator
 */

// ── Event Bus ──
export { EventBus } from "./events/bus.js";
export type { Priority, EventHandler } from "./events/bus.js";
export type {
  CognitionQueryRequested,
  CognitionQueryCompleted,
  CognitionFeedbackRecorded,
  PolicyEvaluated,
  ProposalStatusChanged,
  ImmuneCycleCompleted,
  AmygdalaTriggered,
  DomainEvent,
} from "./events/domain-events.js";

// ── DI Container ──
export { createContainer, createTestContainer } from "./di/container.js";
export type { Container } from "./di/container.js";

// ── Cognition Core ──
export { CognitionCore } from "./cognition/cognition-core.js";
export type { ExecuteRequest, ExecuteResult } from "./cognition/cognition-core.js";

// ── Sandbox (Phase 2) ──
export { CowSandbox } from "./sandbox/cow-sandbox.js";
export { SelfHealController } from "./sandbox/self-heal-loop.js";
export { SafetyValve } from "./sandbox/safety-valve.js";
export { HealthGate } from "./sandbox/health-gate.js";
export type { SelfHealConfig, SelfHealResult } from "./sandbox/self-heal-loop.js";

// ── Constraints (Phase 3) ──
export {
  compileConstraints,
  compileSingleConstraint,
  emitConstraintDSL,
  wrapAstConstraints,
} from "./constraints/dsl-compiler.js";
export type { ParsedConstraint } from "./constraints/dsl-compiler.js";

export {
  evaluateContracts,
  topologicalSort,
  judgeProposals,
} from "./constraints/runtime.js";
export type { ContractEvaluation, ContractViolation, ConstraintVerdict } from "./constraints/runtime.js";

export {
  ConstraintArbitrator,
} from "./constraints/arbitrator.js";
export type {
  ConflictCheck,
  ConflictResolution,
  RuleSnapshot,
  BlameRecord,
  ArbitrationEvent,
  AppealRecord,
  AppealEvidence,
} from "./constraints/arbitrator.js";

export {
  SECURITY_TEMPLATES,
  SECURITY_TEMPLATE_META,
  ARCHITECTURE_TEMPLATES,
  ARCHITECTURE_TEMPLATE_META,
  TYPE_TEMPLATES,
  TYPE_TEMPLATE_META,
  STYLE_TEMPLATES,
  STYLE_TEMPLATE_META,
  ALL_TEMPLATES,
  TEMPLATE_SUMMARY,
} from "./constraints/templates/index.js";


// ── Proposal Layer (Phase 5 — Rego Compiler + Structured Generator + Prompt Pipeline) ──
export { RegoCompiler } from "./proposal/rego-compiler.js";
export type { RegoPolicy, CompileOptions } from "./proposal/rego-compiler.js";
export { StructuredGenerator } from "./proposal/structured-generator.js";
export { RegoPolicySchema, ProposalInputSchema } from "./proposal/structured-generator.js";
export type { RegoPolicyGenerated, GenerateOptions } from "./proposal/structured-generator.js";
export { PromptPipeline } from "./proposal/prompt-pipeline.js";
export type { FewShotExample, PipelineResult } from "./proposal/prompt-pipeline.js";
// ── Audit (Phase 4 — Dimension 4) ──
// RoiAuditor removed — "audit is Git History"
// export { RoiAuditor } from "./audit/roi-auditor.js";
// export type { RoiAuditorOptions, RoiWeights } from "./audit/roi-auditor.js";
export { SatisfactionTracker } from "./audit/satisfaction-tracker.js";
export type { SatisfactionTrackerOptions } from "./audit/satisfaction-tracker.js";
export type {
  ModuleRoi,
  RoiReport,
  SatisfactionEntry,
  SatisfactionMetrics,
} from "./audit/types.js";

// ── Dashboard (Phase 4) ──
export {
  MetricsCollector,
  DEFAULT_ALERT_RULES,
} from "./dashboard/index.js";
export type {
  DashboardSnapshot,
  CognitionMetrics,
  AmygdalaMetrics,
  SelfHealMetrics,
  ArbitrationMetrics,
  GovernanceMetrics,
  Alert,
  AlertRule,
  AuditEvent,
  RuleEfficacy,
  PolicyVariantCompare,
  PreviewResult,
  ShadowMetrics,
  MigrationReport,
} from "./dashboard/index.js";

// ── Delivery (Phase 4 — GitOps + Canary) ──
export { GitOpsEngine } from "./delivery/gitops-engine.js";
export type { GitOpsOptions, PrDescription } from "./delivery/gitops-engine.js";
export { CanaryController, DEFAULT_CANARY_STAGES } from "./delivery/canary-controller.js";
export type {
  CanaryStage,
  CanaryStatus,
  CanaryState,
} from "./delivery/canary-controller.js";
