/**
 * Autopilot capability runtime enablement resolver.
 *
 * Pure functions that compute the final enabled / disabled state for each of
 * the 5 `/autopilot` capability bridges based on:
 *
 *   1. `BUILD_TARGET === "test"` — hard-lock unset flags to `"false"` so the
 *      existing 5140+ test suite keeps running against simulated fallback.
 *   2. Explicit `process.env.BLUEPRINT_*_ENABLED` — developer override always
 *      wins, including inside test runs when the test opts in with `"true"`.
 *   3. `AUTOPILOT_REAL_RUNTIME` master switch — drives the new opt-out default
 *      for `dev:all` / production deployments.
 *
 * This module is referenced by:
 * - design.md §4.1 (`resolveBridgeEnablement` contract and algorithm)
 * - design.md §4.2 (`resolveAllBridgeEnablement` idempotent write-back)
 * - requirements 1.1-1.5 (master switch semantics, purity, idempotency)
 *
 * The module MUST remain a pure data-transformation layer: no `process.env`
 * reads, no logger calls, no side effects beyond the explicit env write-back
 * performed by `resolveAllBridgeEnablement` on the caller-supplied object.
 */

/**
 * The 5 bridge-level environment variable names that gate autopilot
 * capability bridges at their tier-1 early-exit check. See design.md §D1.
 */
export const BRIDGE_ENABLEMENT_KEYS = [
  "BLUEPRINT_DOCKER_CAPABILITY_BRIDGE_ENABLED",
  "BLUEPRINT_MCP_CAPABILITY_BRIDGE_ENABLED",
  "BLUEPRINT_ROLE_CAPABILITY_BRIDGE_ENABLED",
  "BLUEPRINT_AIGC_NODE_CAPABILITY_BRIDGE_ENABLED",
  "BLUEPRINT_AGENT_CREW_STAGE_ACTIVATION_ENABLED",
  // `autopilot-role-autonomous-agent` spec Task 9.1：角色自主 Agent 的 Tier-1
  // 门禁 env flag。复用既有 resolver 算法（test 锁定、explicit 覆盖、master
  // switch 默认、unknown），不为 agent flag 引入任何特殊分支。
  "BLUEPRINT_ROLE_AUTONOMOUS_AGENT_ENABLED",
] as const;

export type BridgeEnablementKey = (typeof BRIDGE_ENABLEMENT_KEYS)[number];

/**
 * Resolved enablement state for a single bridge-level flag.
 *
 * - `"true"`  → bridge tier-1 gate is open (attempt real execution).
 * - `"false"` → bridge tier-1 gate is closed (simulated fallback).
 * - `undefined` → legacy "unset" semantics: equivalent to `"false"` today,
 *   preserved so callers can distinguish "no decision" from "explicitly off".
 */
export type ResolvedBridgeEnablementValue = "true" | "false" | undefined;

/**
 * Input tuple for {@link resolveBridgeEnablement}. All fields are string | undefined
 * to mirror `process.env` access; callers MUST NOT pass `null`.
 */
export interface ResolveBridgeEnablementInput {
  /** Specific bridge-level env variable name. */
  envFlag: BridgeEnablementKey;
  /** Current value of `process.env[envFlag]`; `undefined` when unset. */
  explicitEnvValue: string | undefined;
  /** Current value of `process.env.AUTOPILOT_REAL_RUNTIME`. */
  masterSwitch: string | undefined;
  /** Current value of `process.env.BUILD_TARGET`. */
  buildTarget: string | undefined;
}

/**
 * Aggregated resolver result produced by {@link resolveAllBridgeEnablement}.
 * The five fields correspond one-to-one with the 5 bridges.
 */
export interface ResolvedBridgeEnablement {
  docker: ResolvedBridgeEnablementValue;
  mcpGithub: ResolvedBridgeEnablementValue;
  role: ResolvedBridgeEnablementValue;
  aigcNode: ResolvedBridgeEnablementValue;
  agentCrewStageActivation: ResolvedBridgeEnablementValue;
  /**
   * `autopilot-role-autonomous-agent` spec Task 9.4：roleAutonomousAgent 的
   * Tier-1 门禁解析结果。与前 5 条 bridge 完全对称——`AUTOPILOT_REAL_RUNTIME=true`
   * 时默认 `"true"`；`BUILD_TARGET=test` 强制 `"false"`；显式
   * `BLUEPRINT_ROLE_AUTONOMOUS_AGENT_ENABLED` 始终覆盖以上两种默认。
   */
  roleAutonomousAgent: ResolvedBridgeEnablementValue;
}

/**
 * Pure function. Computes the final enabled / disabled decision for a single
 * bridge-level env flag without reading `process.env` or producing side effects.
 *
 * Algorithm (design.md §4.1):
 *
 *   Step 1 — Test environment hard-lock:
 *     If `buildTarget === "test"`, the function returns `"false"` unless the
 *     developer explicitly set `explicitEnvValue === "true"` (allowing tests
 *     to opt in via `vi.stubEnv`).
 *
 *   Step 2 — Developer explicit value wins:
 *     If `explicitEnvValue` is a non-empty string, that value is returned
 *     as-is, overriding the master switch. This preserves requirement 1.3.
 *
 *   Step 3 — Master switch:
 *     Returns `"true"` / `"false"` when the master switch holds those values.
 *
 *   Step 4 — Unknown:
 *     Returns `undefined`, which is equivalent to today's "flag unset" default.
 *
 * See requirements 1.1-1.4.
 */
export function resolveBridgeEnablement(
  input: ResolveBridgeEnablementInput,
): ResolvedBridgeEnablementValue {
  const { explicitEnvValue, masterSwitch, buildTarget } = input;

  // Step 1 — Test environment hard-lock.
  if (buildTarget === "test") {
    if (explicitEnvValue === "true") {
      return "true";
    }
    return "false";
  }

  // Step 2 — Developer explicit value wins.
  if (explicitEnvValue !== undefined && explicitEnvValue !== "") {
    return explicitEnvValue as ResolvedBridgeEnablementValue;
  }

  // Step 3 — Master switch.
  if (masterSwitch === "true") {
    return "true";
  }
  if (masterSwitch === "false") {
    return "false";
  }

  // Step 4 — Unknown state.
  return undefined;
}

/**
 * Startup-time helper that resolves all 5 bridge-level flags in one pass and
 * writes the decisions back into the supplied env object. Subsequent reads of
 * `process.env.BLUEPRINT_*_ENABLED` by existing bridge tier-1 gates will then
 * observe the new defaults without any bridge code needing to change.
 *
 * Idempotent (requirement 1.5): calling this function twice on the same env
 * object produces identical results and — after the first call — no further
 * writes. A write-back is only performed when the resolved value is non-`undefined`
 * AND differs from the current env value.
 *
 * See design.md §4.2 for the specification.
 */
export function resolveAllBridgeEnablement(
  env: NodeJS.ProcessEnv,
): ResolvedBridgeEnablement {
  const masterSwitch = env.AUTOPILOT_REAL_RUNTIME;
  const buildTarget = env.BUILD_TARGET;

  for (const key of BRIDGE_ENABLEMENT_KEYS) {
    const resolved = resolveBridgeEnablement({
      envFlag: key,
      explicitEnvValue: env[key],
      masterSwitch,
      buildTarget,
    });

    if (resolved !== undefined && env[key] !== resolved) {
      env[key] = resolved;
    }
  }

  return {
    docker: readResolvedValue(env, "BLUEPRINT_DOCKER_CAPABILITY_BRIDGE_ENABLED"),
    mcpGithub: readResolvedValue(env, "BLUEPRINT_MCP_CAPABILITY_BRIDGE_ENABLED"),
    role: readResolvedValue(env, "BLUEPRINT_ROLE_CAPABILITY_BRIDGE_ENABLED"),
    aigcNode: readResolvedValue(env, "BLUEPRINT_AIGC_NODE_CAPABILITY_BRIDGE_ENABLED"),
    agentCrewStageActivation: readResolvedValue(
      env,
      "BLUEPRINT_AGENT_CREW_STAGE_ACTIVATION_ENABLED",
    ),
    roleAutonomousAgent: readResolvedValue(
      env,
      "BLUEPRINT_ROLE_AUTONOMOUS_AGENT_ENABLED",
    ),
  };
}

/**
 * Normalizes a post-write-back env read to the `ResolvedBridgeEnablementValue`
 * type. Preserves `undefined` when the env key was never set, and coerces the
 * two canonical string values. Any other string — which can only occur when a
 * developer has explicitly set a non-canonical value — is passed through as-is
 * so the explicit-wins invariant (requirement 1.3) is not silently lost at the
 * aggregated view.
 */
function readResolvedValue(
  env: NodeJS.ProcessEnv,
  key: BridgeEnablementKey,
): ResolvedBridgeEnablementValue {
  const value = env[key];
  if (value === undefined || value === "") {
    return undefined;
  }
  return value as ResolvedBridgeEnablementValue;
}

// ─── Agent Runtime Config（spec Task 9.2 / 9.3） ──────────────────────────

/**
 * Agent budget 与 tool proxy 的运行期配置。
 *
 * 与 Tier-1 bridge enablement 的主要差异：
 * - **不受 `AUTOPILOT_REAL_RUNTIME` / `BUILD_TARGET` 影响**。本接口只反映
 *   "budget / proxy port 应该取什么数值"，而是否真正启动 Agent 仍由
 *   {@link ResolvedBridgeEnablement#roleAutonomousAgent} 决定。
 * - **只做解析，不做副作用**。resolver 层保持纯函数：不读 `process.env` 以外
 *   的 I/O、不写 logger、不写回 env。
 * - **越界值静默回退到默认**。非数字、空串、负数或 NaN 一律按默认值处理，
 *   避免运行期因一个错字导致 Agent 直接崩。
 *
 * 字段语义（引自 design.md §11 / requirements 10.2-10.5）：
 *
 * | 字段 | 默认 | env flag | 含义 |
 * | --- | --- | --- | --- |
 * | `maxIterations` | `20` | `BLUEPRINT_AGENT_MAX_ITERATIONS` | Agent ReAct loop 最大迭代数 |
 * | `maxTokens` | `100000` | `BLUEPRINT_AGENT_MAX_TOKENS` | Agent 单次任务最大 token 预算 |
 * | `timeoutMs` | `300000` (5 分钟) | `BLUEPRINT_AGENT_TIMEOUT_MS` | Agent 单次任务超时阈值 |
 * | `toolProxyPort` | `0`（随机） | `BLUEPRINT_AGENT_TOOL_PROXY_PORT` | ToolProxyServer HTTP 监听端口 |
 */
export interface AgentRuntimeConfig {
  maxIterations: number;
  maxTokens: number;
  timeoutMs: number;
  toolProxyPort: number;
}

const DEFAULT_AGENT_MAX_ITERATIONS = 20;
const DEFAULT_AGENT_MAX_TOKENS = 100_000;
const DEFAULT_AGENT_TIMEOUT_MS = 300_000;
const DEFAULT_AGENT_TOOL_PROXY_PORT = 0;

/**
 * 解析 Agent 运行期配置。
 *
 * Preconditions:
 * - `env` 是调用方提供的环境变量对象（通常为 `process.env`）；可传入子集用于
 *   测试。
 *
 * Postconditions:
 * - 返回对象每个字段均为非负有限整数。
 * - 对任一 env flag，若取值为 `undefined` / `""` / 非数字 / 负数 / `NaN`，
 *   则对应字段回退到默认值。
 * - `maxIterations` / `maxTokens` / `timeoutMs` 遵守下限（最小 1 / 1 / 1000）；
 *   不达下限时回退到默认。
 * - `toolProxyPort` 合法范围 `0-65535`；越界回退到默认 `0`（随机端口）。
 *
 * 纯函数：不读 env 对象以外的状态，不写 logger。
 */
export function resolveAgentRuntimeConfig(
  env: NodeJS.ProcessEnv,
): AgentRuntimeConfig {
  return {
    maxIterations: parsePositiveIntWithDefault(
      env.BLUEPRINT_AGENT_MAX_ITERATIONS,
      DEFAULT_AGENT_MAX_ITERATIONS,
      1,
    ),
    maxTokens: parsePositiveIntWithDefault(
      env.BLUEPRINT_AGENT_MAX_TOKENS,
      DEFAULT_AGENT_MAX_TOKENS,
      1,
    ),
    timeoutMs: parsePositiveIntWithDefault(
      env.BLUEPRINT_AGENT_TIMEOUT_MS,
      DEFAULT_AGENT_TIMEOUT_MS,
      1000,
    ),
    toolProxyPort: parsePortWithDefault(
      env.BLUEPRINT_AGENT_TOOL_PROXY_PORT,
      DEFAULT_AGENT_TOOL_PROXY_PORT,
    ),
  };
}

/**
 * 解析带最小下限的正整数 env flag。
 *
 * - `undefined` / `""` → `defaultValue`
 * - 非有限数 / 负数 / 小于 `minValue` → `defaultValue`
 * - 小数部分向下取整
 */
function parsePositiveIntWithDefault(
  value: string | undefined,
  defaultValue: number,
  minValue: number,
): number {
  if (value === undefined || value === "") return defaultValue;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < minValue) return defaultValue;
  return parsed;
}

/**
 * 解析端口号 env flag。合法范围 `0-65535`（0 表示让 OS 随机分配）。
 *
 * - `undefined` / `""` → `defaultValue`
 * - 非有限数 / 负数 / 超过 65535 → `defaultValue`
 */
function parsePortWithDefault(
  value: string | undefined,
  defaultValue: number,
): number {
  if (value === undefined || value === "") return defaultValue;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 65_535) {
    return defaultValue;
  }
  return parsed;
}
