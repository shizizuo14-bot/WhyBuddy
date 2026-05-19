/**
 * `autopilot-role-container-loader` spec Task 5：MCP 绑定器。
 *
 * 职责：
 * - 遍历 `mcpIds`，对每个 id 走 `meta.ping` probe。
 * - 成功项进入返回 map；失败项进入 `bindingReport.skippedMcps` 并 warn。
 * - 函数永不抛错（需求 5.1 / 5.2 / 11.6）。
 *
 * 设计锚点：
 * - design §4.7 `ALGORITHM bindRoleMcps`。
 * - 需求 5.8：`BindingReport` 至少包含 `skippedMcps / skippedSkills / skippedAigcNodes`。
 */

import type {
  McpToolExecutionRequest,
  McpToolExecutionResult,
} from "../../../tool/api/mcp-tool-adapter.js";
import type { BlueprintLogger, McpToolAdapterDependency } from "../context.js";

/**
 * MCP session 句柄：loader 把它保存到 `RoleRuntimeContext.mcp.bindings`，
 * 调用计数 / 最终状态由 runtimeCtx 自身追踪，这里只存元数据。
 */
export interface McpSessionHandle {
  serverId: string;
  /**
   * probe 若返回 session token（未来扩展字段），这里透传；目前
   * `McpToolExecutionResult` 未承诺该字段，保持 `string | undefined`。
   */
  sessionToken?: string;
  createdAt: string;
}

/**
 * 单项跳过记录。
 */
export interface BindingSkipRecord {
  id: string;
  reason: string;
}

/**
 * 通用绑定报告，覆盖 MCP / Skill / AIGC 三类。由 loader 初始化、binder 与
 * orchestrator 各自 push。所有字段都为数组（含 `hasSkipped` 快照字段），
 * 调用方修改本对象后，loader 直接消费它作为事件 payload 的基础。
 *
 * 说明：`hasSkipped` 在每个 binder 运行结束时按需更新，由 loader 统一重算即可，
 * 我们这里不强行派生（保持 binder 为纯数据 push，不做 boolean 计算）。
 */
export interface BindingReport {
  skippedMcps: BindingSkipRecord[];
  skippedSkills: BindingSkipRecord[];
  skippedAigcNodes: BindingSkipRecord[];
  boundMcps: string[];
  boundSkills: string[];
  registeredAigcNodes: string[];
  hasSkipped: boolean;
  /**
   * lite mode 的 budget 只作为 advisory 元数据记录（需求 9.6）；
   * 仅在非 real mode 下被 loader 填充。
   */
  liteBudgetAdvisory?: Record<string, unknown>;
}

/**
 * 初始化一份全空的 {@link BindingReport}。
 */
export function createInitialBindingReport(): BindingReport {
  return {
    skippedMcps: [],
    skippedSkills: [],
    skippedAigcNodes: [],
    boundMcps: [],
    boundSkills: [],
    registeredAigcNodes: [],
    hasSkipped: false,
  };
}

/**
 * 把错误消息截断到 400 字符以内（与 diagnostics-store 同款策略）。
 */
function truncateReason(raw: unknown): string {
  const message = raw instanceof Error ? raw.message : String(raw ?? "");
  if (message.length <= 400) {
    return message;
  }
  return message.slice(0, 400);
}

/**
 * 为 probe 构造统一的请求 shape；`tool: "meta.ping"` 是约定的 probe 标识，
 * 具体 MCP server 可以选择返回 `ok: true` 的快速响应。
 */
function buildProbeRequest(
  serverId: string,
  timeoutMs: number,
): McpToolExecutionRequest {
  return {
    serverId,
    toolName: "meta.ping",
    input: "",
    context: [],
    metadata: { source: "role-container-loader", probe: true },
    timeoutMs,
  };
}

/**
 * 绑定一组 MCP id。
 *
 * - `mcpToolAdapter === undefined` → 全部 skip，不抛错（需求 5.2）。
 * - 对每个 id 独立 probe，逐项收敛；**不**并发（保持 log 顺序稳定 + 避免
 *   突发拥塞真实 MCP proxy）。
 *
 * Postconditions：
 * - `result.size + bindingReport.skippedMcps.length` 增量等于入参 `mcpIds.length`。
 * - 函数永不抛错。
 */
export async function bindRoleMcps(
  mcpIds: readonly string[],
  mcpToolAdapter: McpToolAdapterDependency | undefined,
  bindingReport: BindingReport,
  logger: BlueprintLogger,
  now: () => Date,
  timeoutMs = 5_000,
): Promise<Map<string, McpSessionHandle>> {
  const result = new Map<string, McpSessionHandle>();

  if (!mcpToolAdapter) {
    for (const id of mcpIds) {
      if (typeof id !== "string" || id.length === 0) continue;
      bindingReport.skippedMcps.push({
        id,
        reason: "mcpToolAdapter missing",
      });
    }
    return result;
  }

  for (const mcpId of mcpIds) {
    if (typeof mcpId !== "string" || mcpId.length === 0) continue;
    const probe = buildProbeRequest(mcpId, timeoutMs);
    let probeResult: McpToolExecutionResult | undefined;
    try {
      probeResult = await mcpToolAdapter.execute(probe);
    } catch (err) {
      const reason = truncateReason(err);
      bindingReport.skippedMcps.push({ id: mcpId, reason });
      logger.warn("role container loader: mcp binding threw", {
        mcpId,
        reason,
      });
      continue;
    }

    if (!probeResult || probeResult.ok !== true) {
      const reason = truncateReason(
        probeResult?.error ??
          `probe failed with status ${probeResult?.status ?? "unknown"}`,
      );
      bindingReport.skippedMcps.push({ id: mcpId, reason });
      logger.warn("role container loader: mcp binding skipped", {
        mcpId,
        reason,
      });
      continue;
    }

    const handle: McpSessionHandle = {
      serverId: mcpId,
      createdAt: now().toISOString(),
    };
    result.set(mcpId, handle);
    bindingReport.boundMcps.push(mcpId);
  }

  return result;
}
