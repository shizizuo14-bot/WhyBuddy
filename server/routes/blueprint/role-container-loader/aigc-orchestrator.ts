/**
 * `autopilot-role-container-loader` spec Task 7：AIGC 节点编排器。
 *
 * 职责：
 * - `registerOnDemandAigcNodes(...)`：仅登记闭包引用，不实际加载（需求 5.5）；
 * - `orchestrateAigcInvocation(...)`：按 serial / parallel 模式组合调用多节点，
 *   单节点失败不阻塞整体（需求 5.6 / 5.7）；
 * - `buildMergedSummary(...)`：把多节点输出合并为可读摘要，≤ 800 字符，
 *   复用 `applyAgentCrewRedaction` 脱敏（需求 5.7）。
 *
 * 硬约束：
 * - 所有 public API 永不抛错到调用方（需求 11.6）。
 *
 * 设计锚点：design §4.9 `ALGORITHM orchestrateAigcInvocation`。
 *
 * 与 `aigcSpecNodeCapabilityBridge` 的关系：
 * 本模块不直接消费 `AigcSpecNodeCapabilityBridge`——该 bridge 的输入需要完整
 * `capability / route / request / invocationId / roleId` 等字段，而 loader 只
 * 关心"节点可不可调"。因此本模块使用 {@link AigcNodeInvoker} 抽象：loader 装
 * 配侧可以选择接入 bridge 或接入一个简化的闭包；未装配时 invoke 直接返回
 * `success: false + simulated_fallback`，保持语义一致。
 */

import {
  applyAgentCrewRedaction,
  createDefaultAgentCrewStageActivationPolicy,
} from "../agent-crew-stage-activation/policy.js";

import type { BlueprintLogger } from "../context.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * 单节点一次调用的结果。
 */
export interface AigcNodeInvocation {
  nodeId: string;
  success: boolean;
  executionMode: "real" | "simulated_fallback";
  durationMs: number;
  output?: unknown;
  error?: string;
}

/**
 * 多节点编排的聚合结果。
 */
export interface OrchestratedAigcResult {
  success: boolean;
  nodeResults: AigcNodeInvocation[];
  mergedOutputSummary: string;
  partialFailures: number;
}

/**
 * 节点句柄：登记期只存引用 + 懒调用闭包；真正执行由 `invoke(input)` 触发。
 */
export interface AigcNodeHandle {
  nodeId: string;
  registeredAt: string;
  invoke: (input: unknown) => Promise<AigcNodeInvocation>;
}

/**
 * 节点 invoker：把 `(nodeId, input)` 映射到一次执行结果。
 *
 * 约定：
 * - 返回的 `output` 由调用方决定形态；`buildMergedSummary` 会尝试 `String(...)`
 *   后合并。
 * - 失败只通过返回值表达（`success: false`），不抛错。
 */
export type AigcNodeInvoker = (
  nodeId: string,
  input: unknown,
) => Promise<{
  success: boolean;
  executionMode: "real" | "simulated_fallback";
  output?: unknown;
  error?: string;
}>;

/**
 * 编排器调用参数。
 */
export interface OrchestrateParams {
  nodeIds: readonly string[];
  input: unknown;
  handles: ReadonlyMap<string, AigcNodeHandle>;
  mode: "serial" | "parallel";
}

/**
 * 编排器依赖。
 */
export interface OrchestrateDeps {
  logger: BlueprintLogger;
  now: () => Date;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const REDACTION_POLICY = createDefaultAgentCrewStageActivationPolicy();

function truncate(raw: string, limit: number): string {
  return raw.length <= limit ? raw : raw.slice(0, limit);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? "");
}

function stringifyOutput(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * 构造单节点 {@link AigcNodeInvocation}。保证 durationMs ≥ 0。
 */
function buildInvocation(
  nodeId: string,
  partial: {
    success: boolean;
    executionMode: "real" | "simulated_fallback";
    output?: unknown;
    error?: string;
  },
  startedAtMs: number,
  now: () => Date,
): AigcNodeInvocation {
  const durationMs = Math.max(0, now().getTime() - startedAtMs);
  return {
    nodeId,
    success: partial.success,
    executionMode: partial.executionMode,
    durationMs,
    output: partial.output,
    error: partial.error,
  };
}

/**
 * 包裹 invoker 调用：把 throw 转为 `success: false`；保留错误字符串。
 */
async function invokeSingleAigcNodeSafely(
  nodeId: string,
  invoker: AigcNodeInvoker | undefined,
  input: unknown,
  deps: OrchestrateDeps,
): Promise<AigcNodeInvocation> {
  const startedAtMs = deps.now().getTime();
  if (!invoker) {
    return buildInvocation(
      nodeId,
      {
        success: false,
        executionMode: "simulated_fallback",
        error: "aigcSpecNodeBridge missing",
      },
      startedAtMs,
      deps.now,
    );
  }
  try {
    const raw = await invoker(nodeId, input);
    return buildInvocation(
      nodeId,
      {
        success: raw.success === true,
        executionMode:
          raw.executionMode === "real" ? "real" : "simulated_fallback",
        output: raw.output,
        error: raw.error,
      },
      startedAtMs,
      deps.now,
    );
  } catch (err) {
    const reason = truncate(errorMessage(err), 400);
    deps.logger.warn(
      "role container loader: aigc node invoker threw",
      { nodeId, error: reason },
    );
    return buildInvocation(
      nodeId,
      {
        success: false,
        executionMode: "simulated_fallback",
        error: reason,
      },
      startedAtMs,
      deps.now,
    );
  }
}

// ─── Registration ───────────────────────────────────────────────────────────

/**
 * 为一组 on-demand AIGC 节点 id 登记句柄；**不**实际调用 invoker。
 *
 * 每个句柄的 `invoke(input)` 在首次被调用时才会触发 invoker；多次调用允许，
 * 统计由调用方（handoff 快照侧）在 handle metadata 之外单独维护。
 */
export function registerOnDemandAigcNodes(
  nodeIds: readonly string[],
  invoker: AigcNodeInvoker | undefined,
  logger: BlueprintLogger,
  now: () => Date,
): Map<string, AigcNodeHandle> {
  const handles = new Map<string, AigcNodeHandle>();
  const registeredAt = now().toISOString();
  for (const id of nodeIds) {
    if (typeof id !== "string" || id.length === 0) continue;
    handles.set(id, {
      nodeId: id,
      registeredAt,
      invoke: (input) =>
        invokeSingleAigcNodeSafely(id, invoker, input, { logger, now }),
    });
  }
  return handles;
}

// ─── Orchestration ──────────────────────────────────────────────────────────

/**
 * 串行 / 并行编排若干 AIGC 节点调用。
 *
 * - 空 `nodeIds`：返回 `success: true, nodeResults: [], partialFailures: 0`。
 * - serial 模式下，前序节点的 `output` 不会自动传递给后继节点；`input`
 *   对所有节点相同（设计在本阶段刻意保持简单，便于幂等重试）。如果未来
 *   需要 "accumulated" 语义，再扩展 policy 参数。
 */
export async function orchestrateAigcInvocation(
  params: OrchestrateParams,
  deps: OrchestrateDeps,
): Promise<OrchestratedAigcResult> {
  const { nodeIds, input, handles, mode } = params;

  // 空入参直接返回空结果
  if (!nodeIds || nodeIds.length === 0) {
    return {
      success: true,
      nodeResults: [],
      mergedOutputSummary: "",
      partialFailures: 0,
    };
  }

  const results: AigcNodeInvocation[] = [];
  const unknownNodeIds: string[] = [];

  async function runOne(nodeId: string): Promise<AigcNodeInvocation> {
    const handle = handles.get(nodeId);
    if (!handle) {
      unknownNodeIds.push(nodeId);
      return buildInvocation(
        nodeId,
        {
          success: false,
          executionMode: "simulated_fallback",
          error: "node not registered",
        },
        deps.now().getTime(),
        deps.now,
      );
    }
    // handle.invoke 本身已经吞错；此处再外裹一层 try/catch 以防用户自定义
    // handle 抛错。
    try {
      return await handle.invoke(input);
    } catch (err) {
      const reason = truncate(errorMessage(err), 400);
      deps.logger.warn(
        "role container loader: aigc node handle.invoke threw (unexpected)",
        { nodeId, error: reason },
      );
      return buildInvocation(
        nodeId,
        {
          success: false,
          executionMode: "simulated_fallback",
          error: reason,
        },
        deps.now().getTime(),
        deps.now,
      );
    }
  }

  if (mode === "parallel") {
    const settled = await Promise.all(nodeIds.map((id) => runOne(id)));
    results.push(...settled);
  } else {
    for (const id of nodeIds) {
      // eslint-disable-next-line no-await-in-loop
      const r = await runOne(id);
      results.push(r);
    }
  }

  const partialFailures = results.filter((r) => !r.success).length;
  const success = partialFailures === 0;
  const mergedOutputSummary = buildMergedSummary(results);

  if (unknownNodeIds.length > 0) {
    deps.logger.warn(
      "role container loader: orchestrator received unregistered nodeIds",
      { unknownNodeIds },
    );
  }

  return { success, nodeResults: results, mergedOutputSummary, partialFailures };
}

/**
 * 合并多节点输出为可读摘要；脱敏 + 800 字符上限（需求 5.7）。
 */
export function buildMergedSummary(results: readonly AigcNodeInvocation[]): string {
  if (results.length === 0) return "";
  const segments = results.map((r) => {
    if (r.success) {
      const out = stringifyOutput(r.output);
      return `[${r.nodeId}] ${out}`;
    }
    return `[${r.nodeId}] FAILED: ${r.error ?? "unknown"}`;
  });
  const joined = segments.join(" | ");
  const redacted = applyAgentCrewRedaction(joined, REDACTION_POLICY);
  return truncate(redacted, 800);
}
