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
 * @file Structured Logger
 * Unified JSON logging via pino. All output to stderr (stdio transport uses stdout).
 *
 * Log levels (RFC 5424):
 *   trace(10), debug(20), info(30), warn(40), error(50), fatal(60)
 *
 * Usage:
 *   import { logger } from "./logger.js";
 *   logger.info({ tool: "capture_diff", latencyMs: 42 }, "tool executed");
 */

import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  ...(isDev ? {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss.l",
        ignore: "pid,hostname",
        messageFormat: "{src}:{line} — {msg}",
      },
    },
  } : {}),
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
});

export interface ToolLogContext {
  tool: string;
  latencyMs: number;
  truncated?: boolean;
  validationRequired?: boolean;
  outcome?: string;
  policyWarnings?: number;
}

export function logToolExecution(ctx: ToolLogContext): void {
  logger.info({
    ts: new Date().toISOString(),
    ...ctx,
  }, ctx.outcome ?? "tool executed");
}

export interface PolicyLogContext {
  tool: string;
  matchedPolicyIds: string[];
  blocked: boolean;
  requiresApproval: boolean;
}

export function logPolicyDecision(ctx: PolicyLogContext): void {
  logger.warn({
    ts: new Date().toISOString(),
    ...ctx,
  }, ctx.blocked ? "tool blocked by policy" : "policy evaluated");
}
