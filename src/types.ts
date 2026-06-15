export interface ASTNode {
  type: string;
  text: string;
  startByte: number;
  endByte: number;
  children: ASTNode[];
}

export interface NodeSignature {
  type: string;
  textHash: string;
  childrenCount: number;
  childTypesHash: string;
  structuralHash: string;
}

export type AtomicOpType = "UPDATE" | "MOVE" | "INSERT" | "DELETE";

export interface AtomicOp {
  type: AtomicOpType;
  nodeType: string;
  originalText?: string;
  modifiedText?: string;
  startByte: number;
  endByte: number;
  parentType?: string;
}

export interface DiffResult {
  operations: AtomicOp[];
  status: "success" | "fallback" | "failed";
  confidence: "high" | "medium" | "low";
  processedBytes: number;
  durationMs: number;
  error?: string;
}

export type RuleScope = "project" | "user" | "global";
export type RuleType = "replace" | "restructure" | "convention";
export type RuleConfidence = "high" | "medium" | "low";
export type RuleSource = "auto" | "manual" | "arbitration";
export type RuleStatus = "active" | "pending" | "archived";

export interface RuleSpec {
  type: RuleType;
  pattern: string;
  suggestion: string;
  language: string;
  fileExtensions?: string[];
  tags?: string[];
  category?: string;
  scope?: RuleScope;
  source?: RuleSource;
  confidence?: RuleConfidence;
}

export interface Rule extends RuleSpec {
  id: string;
  projectId?: string;
  priority: number;
  confidence: RuleConfidence;
  source: RuleSource;
  status: RuleStatus;
  matchCount: number;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt?: Date;
}

export interface MatchContext {
  language: string;
  filePath: string;
  fileExtension: string;
  projectId?: string;
  ruleTags?: string[];
  currentTime?: Date;
  /** Optional file content for pattern matching. If empty, content-based matching is skipped. */
  fileContent?: string;
}

export interface ScoredRule {
  rule: Rule;
  score: number;
  matchReasons: string[];
}

export interface MatchResult {
  rules: ScoredRule[];
  totalTokens: number;
  truncated: boolean;
  queryDurationMs: number;
}

export type ConflictResolution = "keep_a" | "keep_b" | "merge" | "skip";

export interface ConflictInfo {
  id: string;
  ruleA: Rule;
  ruleB: Rule;
  scopeKey: string;
  resolution?: ConflictResolution;
  createdAt: Date;
}

export interface CaptureDiffInput {
  filePath: string;
  originalContent: string;
  modifiedContent: string;
  language: string;
  projectId?: string;
}

export interface QueryRulesInput {
  language: string;
  filePath: string;
  projectId?: string;
  tags?: string[];
  taskId?: string;
}

export interface ConfirmRuleInput {
  ruleId: string;
  action: "accept" | "reject" | "edit" | "skip";
  editedPattern?: string;
  editedSuggestion?: string;
}

export interface ResolveConflictInput {
  conflictId: string;
  resolution: ConflictResolution;
  batchAllSession?: boolean;
}

export interface ListRulesInput {
  language?: string;
  scope?: RuleScope;
  status?: RuleStatus;
  projectId?: string;
  limit?: number;
  offset?: number;
}

export const DEFAULT_WEIGHTS = {
  typeWeight: 0.4,
  timeWeight: 0.3,
  matchWeight: 0.3,
  timeDecayLambda: 0.01,
} as const;

export const SCOPE_PRIORITIES: Record<RuleScope, number> = {
  project: 1.0,
  user: 0.8,
  global: 0.5,
};

export const TOKEN_LIMITS = {
  maxInjectionTokens: 2000,
  maxSingleRuleTokens: 100,
  maxRulesPerProject: 2000,
  maxRulesGlobal: 3000,
} as const;

export const RULE_GENERATION_THRESHOLDS = {
  minDistinctFiles: 3,
  minRepeatsInDays: 5,
  repeatWindowDays: 7,
} as const;
 
export interface AnalyzeWorkspaceInput {
  baseCommit: string;
  headCommit?: string;
  paths?: string[];
  taskId?: string;
  /** Concurrent analysis: max files processed in parallel. Defaults to 5 or CPU core count. */
  concurrency?: number;
  fileContents?: { path: string; originalContent?: string; modifiedContent: string }[];
}
 
 export interface AnalyzeResult {
   analyzedFiles: number;
   skippedFiles: number;
   generatedRules: { rule: RuleSpec; filePath: string }[];
   conflicts: { ruleA: RuleSpec; ruleB: RuleSpec; reason: string }[];
   errors: { filePath: string; error: string }[];
 }
 
 /** File extensions to skip in workspace analysis */
 export const SKIP_PATTERNS = [
   /node_modules\//,
   /\.next\//,
   /dist\//,
   /\.git\//,
   /\.cache\//,
   /\.turbo\//,
   /build\//,
   /coverage\//,
   /\.(map|d\.ts)$/,
 ];
