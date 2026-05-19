/**
 * `autopilot-role-autonomous-agent` spec Task 6：LiteAgentRuntime。
 *
 * 宿主进程内的简化版 Agent Loop。作为 Docker 不可用或 Real Mode 失败时的
 * **降级路径**（由 {@link RoleAgentDelegator} 按 Tier 2/3 降级链调用）。
 *
 * Real Mode vs Lite Mode 语义差异（design §4.3）：
 *
 * | 维度       | Real Mode                          | Lite Mode                 |
 * | ---------- | ---------------------------------- | ------------------------- |
 * | 执行环境   | Docker 容器                        | 宿主 Node 进程            |
 * | 工具调用   | HTTP → ToolProxyServer → 真实服务 | 直接调用进程内 adapter    |
 * | 隔离性     | 完全隔离                           | 共享进程内存              |
 * | 并行性     | 可多容器并行                       | 串行执行                  |
 * | 文件系统   | 容器内独立 `/workspace`            | 临时目录                  |
 * | 网络       | 受 allowlist 限制                  | 不限制                    |
 *
 * 实现策略：
 * - 复用 {@link AgentLoopStateMachine}，把 {@link ToolInvoker} 替换为本地版本：
 *   按 `toolId` 前缀直接路由到 MCP adapter / Skill registry / AIGC 调用函数，
 *   不经 HTTP、不验 HMAC（本身就在宿主进程）。
 * - 每次 `run()` 为 `jobId` 创建一个独立临时目录作为 workspace，通过
 *   `input.context.workspaceDir` 传递给状态机；run 结束时无论成败都做 best-effort
 *   清理（`fs.rmSync`；失败只 debug log）。
 * - Lite Mode 不需要 progress 回调：注入 {@link createNoopProgressEmitter}，
 *   所有 lifecycle 事件落入 void。
 * - 输出与 Real Mode 完全一致的 {@link AgentJobOutput}，由 Delegator 透明切换。
 *
 * 注意：本模块**不扩大** state-machine 的 API，只通过已有 ToolInvoker 接口
 * 注入本地实现；也不添加任何 `builtin.*` 分支，状态机已在 thinking 阶段就地
 * 处理 finish / think，不会把 builtin 调用路由到 invoker（防御性 fallback 见
 * `routeInvocation`）。
 */

import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

import type {
  AgentJobInput,
  AgentJobOutput,
} from "../../../../shared/blueprint/agent-job.js";
import type {
  BlueprintLogger,
  McpToolAdapterDependency,
} from "../context.js";
import type {
  McpToolExecutionRequest,
  McpToolExecutionResult,
} from "../../../tool/api/mcp-tool-adapter.js";
import type { SkillRegistryDependency } from "../role-container-loader/skills-binder.js";

import { AgentLoopStateMachine } from "./state-machine.js";
import type { LlmCallFn } from "./llm-call.js";
import { createNoopProgressEmitter } from "./progress-emitter.js";
import type {
  ToolInvokeRequest,
  ToolInvokeResult,
  ToolInvoker,
} from "./tool-proxy-client.js";
import type { AigcNodeInvokerFn } from "./tool-proxy-server.js";

// ─── Public Types ───────────────────────────────────────────────────────────

/** 对外暴露的 LiteAgentRuntime 接口（与 delegator.ts 中同名接口结构一致）。 */
export interface LiteAgentRuntime {
  run(input: AgentJobInput): Promise<AgentJobOutput>;
}

/** 工厂参数。 */
export interface CreateLiteAgentRuntimeOptions {
  /** LLM 调用函数（通常来自 {@link createLlmCall}）。 */
  llmCall: LlmCallFn;
  /** MCP 适配器；未注入时 `mcp.*` 路由返回 failure。 */
  mcpToolAdapter?: McpToolAdapterDependency;
  /** Skill 注册表；未注入时 `skill.*` 路由返回 failure。 */
  skillRegistry?: SkillRegistryDependency;
  /** AIGC 节点调用函数；未注入时 `aigc.*` 路由返回 failure。 */
  aigcNodeInvoker?: AigcNodeInvokerFn;
  /**
   * 可选：workspace 根目录；未提供时使用 `os.tmpdir()/role-agent-lite`。
   * 每次 run 为 jobId 创建一个子目录。
   */
  workspaceRoot?: string;
  logger: BlueprintLogger;
  now: () => Date;
}

// ─── Local helpers ──────────────────────────────────────────────────────────

/** 解析 toolId 前缀，如 `mcp.github` → `{ category: "mcp", rest: "github" }`。 */
function splitToolId(
  toolId: string,
): { category: string; rest: string } | null {
  const idx = toolId.indexOf(".");
  if (idx <= 0 || idx === toolId.length - 1) return null;
  return { category: toolId.slice(0, idx), rest: toolId.slice(idx + 1) };
}

/**
 * 确保 workspace 目录存在。失败时返回 undefined 并由调用方 debug log；
 * 状态机仍然可以继续运行，context.workspaceDir 仅为未缺失即可。
 */
function ensureWorkspace(
  base: string,
  jobId: string,
  logger: BlueprintLogger,
): string | undefined {
  const dir = pathJoin(base, jobId);
  try {
    mkdirSync(dir, { recursive: true });
    return dir;
  } catch (err) {
    logger.debug("[lite-agent] workspace mkdir failed", {
      jobId,
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

/** 清理 workspace 目录。任何错误只 debug log，不影响 run 结果。 */
function cleanupWorkspace(
  dir: string | undefined,
  logger: BlueprintLogger,
): void {
  if (!dir) return;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    logger.debug("[lite-agent] workspace cleanup failed", {
      dir,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Local ToolInvoker ──────────────────────────────────────────────────────

/** 本地 ToolInvoker 的依赖子集（工厂参数的裁剪版本）。 */
interface LocalToolInvokerOpts {
  mcpToolAdapter?: McpToolAdapterDependency;
  skillRegistry?: SkillRegistryDependency;
  aigcNodeInvoker?: AigcNodeInvokerFn;
  logger: BlueprintLogger;
  now: () => Date;
}

/**
 * 创建本地（进程内）ToolInvoker。
 *
 * 与 {@link createToolProxyServer} 的 `routeInvocation` 等价，但：
 * - 不经 HTTP、不验 HMAC；
 * - 不做白名单校验（state-machine 传入的 toolId 总是来自 `input.tools`，由
 *   Delegator 在构造 `AgentJobInput` 时已经锁定）；
 * - 不做时钟偏移检查；
 * - 保守加一层 `Promise.race` 超时，超时返回 `timeout_after_<ms>ms`。
 */
function createLocalToolInvoker(opts: LocalToolInvokerOpts): ToolInvoker {
  return {
    async invoke(req: ToolInvokeRequest): Promise<ToolInvokeResult> {
      const startMs = opts.now().getTime();
      const timeoutMs = Math.max(1, req.timeoutMs | 0);

      const elapsed = (): number =>
        Math.max(0, opts.now().getTime() - startMs);

      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<ToolInvokeResult>((resolve) => {
        timer = setTimeout(() => {
          resolve({
            success: false,
            error: `timeout_after_${timeoutMs}ms`,
            durationMs: elapsed(),
          });
        }, timeoutMs);
      });

      const routePromise = (async (): Promise<ToolInvokeResult> => {
        const routed = await routeInvocation(req, opts);
        if (routed.success) {
          return { success: true, result: routed.result, durationMs: elapsed() };
        }
        return { success: false, error: routed.error, durationMs: elapsed() };
      })();

      try {
        return await Promise.race([routePromise, timeoutPromise]);
      } catch (err) {
        // routeInvocation 自身已吞错，这里只是防御性兜底。
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: `tool_throw: ${message}`,
          durationMs: elapsed(),
        };
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}

/**
 * 按 toolId 前缀路由到对应 adapter。参考 tool-proxy-server.ts `routeInvocation`。
 *
 * 任何 adapter 异常都被吞掉并转换为 `{ success: false, error }`；
 * 调用方（{@link createLocalToolInvoker}）负责附上 durationMs。
 */
async function routeInvocation(
  req: ToolInvokeRequest,
  opts: LocalToolInvokerOpts,
): Promise<
  | { success: true; result: unknown }
  | { success: false; error: string }
> {
  const split = splitToolId(req.toolId);
  if (!split) {
    return { success: false, error: "unknown_tool_category" };
  }

  switch (split.category) {
    case "mcp":
      return routeMcp(req, split.rest, opts);
    case "skill":
      return routeSkill(req, split.rest, opts);
    case "aigc":
      return routeAigc(req, split.rest, opts);
    case "builtin":
      // builtin.finish / builtin.think 由 state-machine 在 thinking 阶段直接
      // 归一，不应走到 invoker。这里做防御性返回，避免意外打到 adapter。
      return {
        success: false,
        error: "builtin_tools_must_not_go_through_invoker",
      };
    default:
      return { success: false, error: "unknown_tool_category" };
  }
}

async function routeMcp(
  req: ToolInvokeRequest,
  serverId: string,
  opts: LocalToolInvokerOpts,
): Promise<
  | { success: true; result: unknown }
  | { success: false; error: string }
> {
  const adapter = opts.mcpToolAdapter;
  if (!adapter) {
    return { success: false, error: "mcp_adapter_not_available" };
  }
  const toolName =
    typeof req.params.toolName === "string" && req.params.toolName
      ? req.params.toolName
      : "invoke";
  const inputText =
    typeof req.params.input === "string" && req.params.input
      ? req.params.input
      : `lite agent ${req.roleId} invoking ${serverId}`;
  const argsCandidate = req.params.arguments;
  const argsRecord: Record<string, unknown> =
    argsCandidate && typeof argsCandidate === "object" && !Array.isArray(argsCandidate)
      ? (argsCandidate as Record<string, unknown>)
      : req.params.inputs &&
          typeof req.params.inputs === "object" &&
          !Array.isArray(req.params.inputs)
        ? (req.params.inputs as Record<string, unknown>)
        : {};

  const request: McpToolExecutionRequest = {
    serverId,
    toolName,
    arguments: argsRecord,
    input: inputText,
    context: [],
    agentId: req.roleId,
    metadata: {
      source: "lite-agent-runtime",
      jobId: req.jobId,
    },
  };

  try {
    const result: McpToolExecutionResult = await adapter.execute(request);
    if (result.ok) {
      return { success: true, result };
    }
    return {
      success: false,
      error: result.error ?? `mcp_status_${result.status}`,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function routeSkill(
  req: ToolInvokeRequest,
  skillId: string,
  opts: LocalToolInvokerOpts,
): Promise<
  | { success: true; result: unknown }
  | { success: false; error: string }
> {
  const registry = opts.skillRegistry;
  if (!registry) {
    return { success: false, error: "skill_registry_not_available" };
  }
  try {
    const handle = await registry.loadForRole({
      roleId: req.roleId,
      skillId,
    });
    if (!handle) {
      return { success: false, error: "skill_not_found" };
    }
    const result = await handle.invoke(req.params);
    return { success: true, result };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function routeAigc(
  req: ToolInvokeRequest,
  nodeId: string,
  opts: LocalToolInvokerOpts,
): Promise<
  | { success: true; result: unknown }
  | { success: false; error: string }
> {
  const invoker = opts.aigcNodeInvoker;
  if (!invoker) {
    return { success: false, error: "aigc_invoker_not_available" };
  }
  try {
    const result = await invoker(nodeId, req.params);
    if (result.success) {
      return { success: true, result: result.result };
    }
    return { success: false, error: result.error ?? "aigc_invoke_failed" };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * 创建 {@link LiteAgentRuntime} 实例。
 *
 * 每次 `run(input)` 的流程：
 * 1. 为 `jobId` 创建独立 workspace 目录；
 * 2. 把 `workspaceDir` 注入 `input.context`；
 * 3. 构造本地 ToolInvoker + noop ProgressEmitter；
 * 4. 以复用的 {@link AgentLoopStateMachine} 驱动 ReAct 循环；
 * 5. 无论成败，在 finally 里清理 workspace 目录。
 *
 * 注意：返回的 {@link AgentJobOutput} 由 state-machine 产出，与 Real Mode
 * 完全同构；Delegator 可以透明切换两种模式。
 */
export function createLiteAgentRuntime(
  opts: CreateLiteAgentRuntimeOptions,
): LiteAgentRuntime {
  const workspaceBase =
    opts.workspaceRoot ?? pathJoin(tmpdir(), "role-agent-lite");
  const progressEmitter = createNoopProgressEmitter();

  return {
    async run(input: AgentJobInput): Promise<AgentJobOutput> {
      const workspaceDir = ensureWorkspace(
        workspaceBase,
        input.jobId,
        opts.logger,
      );

      // 将 workspaceDir 注入 context；即便 mkdir 失败也保留 key（值为 undefined
      // 时 JSON 序列化会丢弃，不影响向下透传）。
      const enrichedContext: Record<string, unknown> = {
        ...input.context,
        workspaceDir,
      };
      const enrichedInput: AgentJobInput = {
        ...input,
        context: enrichedContext,
      };

      const toolInvoker = createLocalToolInvoker({
        mcpToolAdapter: opts.mcpToolAdapter,
        skillRegistry: opts.skillRegistry,
        aigcNodeInvoker: opts.aigcNodeInvoker,
        logger: opts.logger,
        now: opts.now,
      });

      const stateMachine = new AgentLoopStateMachine(enrichedInput, {
        llmCall: opts.llmCall,
        toolInvoker,
        progressEmitter,
        logger: opts.logger,
        now: opts.now,
      });

      try {
        return await stateMachine.run();
      } finally {
        cleanupWorkspace(workspaceDir, opts.logger);
      }
    },
  };
}
