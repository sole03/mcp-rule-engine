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

export { MetricsCollector, DEFAULT_ALERT_RULES } from "./metrics-collector.js";
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
  RoiReport,
  ModuleRoi,
  SatisfactionMetrics,
  SatisfactionEntry,
} from "./types.js";
