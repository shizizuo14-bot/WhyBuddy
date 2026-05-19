/**
 * `autopilot-role-container-loader` spec Task 8：Stage Handoff 上下文构造器。
 *
 * 职责：
 * - `buildStageHandoffContext(roleRuntimeCtx, now)` 把 runtime ctx 折叠成
 *   {@link StageHandoffContext} 快照；
 * - input / output 摘要用 `sha256(JSON.stringify(...))` 前 16 位；
 * - 深拷贝返回值（`structuredClone` → fallback `JSON.parse(JSON.stringify)`），
 *   调用方后续修改 runtime ctx 不影响 handoff（需求 7.5）。
 *
 * 设计锚点：design §4.4 / §4.11。
 *
 * 说明：loader 侧维护的运行时 ctx 形态在 Task 9 的 `loader.ts` 里定稿；
 * 本模块只消费下面定义的 {@link HandoffSourceContext} 最小投影，不直接耦合
 * loader 主体，保证单测不依赖 loader 实装。
 */

import { createHash } from "node:crypto";

import type { BlueprintGenerationStage } from "../../../../shared/blueprint/index.js";

import type { RoleContainerKey } from "./capability-package.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Handoff 快照：design §4.4 `StageHandoffContext`。
 */
export interface StageHandoffContext {
  key: RoleContainerKey;
  capabilitiesInvoked: ReadonlyArray<{
    capabilityId: string;
    invocationId: string;
    executionMode: "real" | "simulated_fallback";
  }>;
  mcpSessions: ReadonlyArray<{
    serverId: string;
    invocationCount: number;
    lastStatus: "ok" | "failed";
  }>;
  skillHandles: ReadonlyArray<{
    skillId: string;
    invocationCount: number;
    inputDigest: string;
    outputDigest: string;
  }>;
  aigcNodeResults: ReadonlyArray<{
    nodeId: string;
    partialFailure: boolean;
  }>;
  warmStartHint?: string;
  generatedAt: string;
}

/**
 * handoff 构造器的最小消费形态；loader 传入的 runtime ctx 只需要暴露这一层
 * 数据即可（保持模块解耦）。
 */
export interface HandoffSourceContext {
  key: RoleContainerKey;
  capabilitiesInvoked: ReadonlyArray<{
    capabilityId: string;
    invocationId: string;
    executionMode: "real" | "simulated_fallback";
  }>;
  mcpSessions: ReadonlyArray<{
    serverId: string;
    invocationCount: number;
    lastStatus: "ok" | "failed";
  }>;
  skillHandles: ReadonlyArray<{
    skillId: string;
    invocationCount: number;
    lastInput: unknown;
    lastOutput: unknown;
  }>;
  aigcNodeResults: ReadonlyArray<{
    nodeId: string;
    partialFailure: boolean;
  }>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * 稳定 JSON 序列化：无法序列化时回退到 `String(value)`；nullish 输入返回空串。
 */
function stableStringify(value: unknown): string {
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * 计算 sha256 摘要前 16 位（hex）。
 */
function digest16(value: unknown): string {
  const source = stableStringify(value);
  return createHash("sha256").update(source).digest("hex").slice(0, 16);
}

/**
 * 深拷贝：优先 `structuredClone`，失败（或不可用）回退 JSON round-trip。
 */
function deepClone<T>(value: T): T {
  const sc = (globalThis as { structuredClone?: typeof structuredClone })
    .structuredClone;
  if (typeof sc === "function") {
    try {
      return sc(value);
    } catch {
      // fallthrough
    }
  }
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * 根据 runtime ctx 构造 handoff 快照。
 */
export function buildStageHandoffContext(
  source: HandoffSourceContext,
  now: () => Date,
): StageHandoffContext {
  const skillHandles = source.skillHandles.map((h) => ({
    skillId: h.skillId,
    invocationCount: h.invocationCount,
    inputDigest: digest16(h.lastInput),
    outputDigest: digest16(h.lastOutput),
  }));

  const snapshot: StageHandoffContext = {
    key: { ...source.key },
    capabilitiesInvoked: deepClone(source.capabilitiesInvoked.slice()),
    mcpSessions: deepClone(source.mcpSessions.slice()),
    skillHandles: deepClone(skillHandles),
    aigcNodeResults: deepClone(source.aigcNodeResults.slice()),
    warmStartHint: deriveWarmStartHint(source),
    generatedAt: now().toISOString(),
  };
  return snapshot;
}

/**
 * 根据 bindings 使用计数给出一句话 hint；无可用线索时返回 `undefined`。
 *
 * 策略：优先报告 invocationCount 最多的 MCP / Skill；都是 0 则返回 undefined。
 */
export function deriveWarmStartHint(
  source: HandoffSourceContext,
): string | undefined {
  let topMcp: { id: string; count: number } | undefined;
  for (const s of source.mcpSessions) {
    if (!topMcp || s.invocationCount > topMcp.count) {
      topMcp = { id: s.serverId, count: s.invocationCount };
    }
  }
  let topSkill: { id: string; count: number } | undefined;
  for (const s of source.skillHandles) {
    if (!topSkill || s.invocationCount > topSkill.count) {
      topSkill = { id: s.skillId, count: s.invocationCount };
    }
  }
  const parts: string[] = [];
  if (topMcp && topMcp.count > 0) {
    parts.push(`mcp:${topMcp.id}(${topMcp.count})`);
  }
  if (topSkill && topSkill.count > 0) {
    parts.push(`skill:${topSkill.id}(${topSkill.count})`);
  }
  if (parts.length === 0) return undefined;
  return `warm-start: ${parts.join(", ")}`;
}

// Re-export for convenience
export type { BlueprintGenerationStage };
