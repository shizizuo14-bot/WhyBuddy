/**
 * `autopilot-role-autonomous-agent` spec Task 4：宿主侧 ToolProxyServer。
 *
 * 职责：
 * - 在宿主进程内监听 HTTP 端口，承接容器内 Agent 的工具调用请求。
 * - 对每条 `POST /tools/invoke` 做 HMAC-SHA256 验签 + 白名单校验（需求 4.3 / 5.3）。
 * - 按 toolId 前缀路由到真实适配器：
 *   - `mcp.*`   → `McpToolAdapterDependency.execute()`
 *   - `skill.*` → `SkillRegistryDependency.loadForRole()` → `handle.invoke()`
 *   - `aigc.*`  → 注入式 `AigcNodeInvokerFn(nodeId, input)`
 *   - `builtin.*` → 直接拒绝（Agent Loop 本地消费，绝不走 HTTP）
 * - 每个 tool 独立超时，超时返回 `timeout_after_<ms>ms`（需求 4.6）。
 *
 * 设计约束：
 * - 使用 Node 内建 `http.createServer` + `node:crypto`，不引入 express。
 * - 与 {@link createHttpToolProxyClient} 对称：客户端计算的签名为
 *   `sha256(hmacSecret, `${timestamp}.${rawBody}`)`。
 * - 绑定 `127.0.0.1`，避免容器以外的网络访问。
 * - 不向外抛错；所有错误都收敛为 JSON 响应。
 */

import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";

import type { AgentToolDefinition } from "../../../../shared/blueprint/agent-tool.js";
import type { BlueprintLogger, McpToolAdapterDependency } from "../context.js";
import type {
  McpToolExecutionRequest,
  McpToolExecutionResult,
} from "../../../tool/api/mcp-tool-adapter.js";
import type { SkillRegistryDependency } from "../role-container-loader/skills-binder.js";

/**
 * ToolProxyServer 暴露给宿主装配层的最小接口。design §3.5。
 */
export interface ToolProxyServer {
  /** 启动 HTTP 监听。`port=0` 时由 OS 分配端口。 */
  start(port: number): Promise<void>;
  /** 注册某 roleId 的白名单工具列表；重复调用会覆盖。 */
  registerTools(roleId: string, tools: AgentToolDefinition[]): void;
  /** 关闭 server，停止接受新连接。 */
  shutdown(): Promise<void>;
  /** 实际监听的端口号（start 之后可读；未启动时为 undefined）。 */
  readonly actualPort?: number;
}

/**
 * 容器发来的请求负载（验签后解析得到）。design §3.5。
 *
 * 注意：`hmacSignature` / `timestamp` 不在 body 里，而是 header 传递；
 * 这里保留声明与 design 对齐，但实际以 header 为准。
 */
export interface ToolProxyRequest {
  roleId: string;
  jobId: string;
  toolId: string;
  params: Record<string, unknown>;
  requestId: string;
  hmacSignature: string;
  timestamp: string;
}

/**
 * 返回给容器的响应负载。
 */
export interface ToolProxyResponse {
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: string;
  durationMs: number;
}

/**
 * AIGC 节点调用函数：ToolProxy 只负责调单节点，不做 orchestrate。
 *
 * 完整 orchestrator 语义参考 `aigc-orchestrator.ts`；本 spec 只需要一个薄薄的
 * "按 nodeId 跑一遍"的桥梁，后续 Task 5/6 的 Delegator 会收紧真正的注入方式。
 */
export type AigcNodeInvokerFn = (
  nodeId: string,
  input: unknown,
) => Promise<{ success: boolean; result?: unknown; error?: string }>;

/**
 * 工厂参数。
 */
export interface CreateToolProxyServerOptions {
  /** 与 ToolProxyClient 共享的 HMAC 秘钥。 */
  hmacSecret: string;
  /** 可选：MCP 工具适配器；未注入时 `mcp.*` 路由直接失败。 */
  mcpToolAdapter?: McpToolAdapterDependency;
  /** 可选：Skill 注册表；未注入时 `skill.*` 路由直接失败。 */
  skillRegistry?: SkillRegistryDependency;
  /** 可选：AIGC 节点调用函数；未注入时 `aigc.*` 路由直接失败。 */
  aigcNodeInvoker?: AigcNodeInvokerFn;
  logger: BlueprintLogger;
  now: () => Date;
  /**
   * 可选：最大时钟偏移（ms）。未设则不校验。
   * 主要用于抵御 replay 攻击；受限于测试复杂度，默认关闭。
   */
  maxClockSkewMs?: number;
}

/** 内部：解析 toolId 前缀。 */
function splitToolId(toolId: string): { category: string; rest: string } | null {
  const idx = toolId.indexOf(".");
  if (idx <= 0 || idx === toolId.length - 1) {
    return null;
  }
  return { category: toolId.slice(0, idx), rest: toolId.slice(idx + 1) };
}

/** 读 header：string | string[] | undefined → string | undefined。 */
function readHeader(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0];
  return typeof v === "string" ? v : undefined;
}

/** 读完整 raw body；用于 HMAC 验签前的原样保留。 */
function readRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** 恒定时间对比两个 hex signature；长度不一致直接返回 false。 */
function signatureEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

/** 写 JSON 响应；statusCode 默认 200。 */
function writeJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Length", Buffer.byteLength(body).toString());
  res.end(body);
}

/**
 * 创建 ToolProxyServer 实例。实例可重复 `start` → `shutdown`，但建议每次宿主
 * 装配一个独立实例。
 */
export function createToolProxyServer(
  opts: CreateToolProxyServerOptions,
): ToolProxyServer {
  // roleId -> (toolId -> AgentToolDefinition)；保留完整定义以便读取 timeoutMs。
  const registeredTools = new Map<string, Map<string, AgentToolDefinition>>();

  let server: Server | undefined;
  let actualPort: number | undefined;

  const api: ToolProxyServer = {
    get actualPort(): number | undefined {
      return actualPort;
    },
    start(port: number): Promise<void> {
      if (server) {
        return Promise.reject(new Error("tool_proxy_server_already_started"));
      }
      server = createServer((req, res) => {
        void handleRequest(req, res).catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          opts.logger.warn("[toolProxy] unhandled request error", {
            error: message,
          });
          try {
            writeJson(res, 500, {
              requestId: "",
              success: false,
              error: `internal_error: ${message}`,
              durationMs: 0,
            });
          } catch {
            // res 可能已关闭；忽略。
          }
        });
      });
      return new Promise<void>((resolve, reject) => {
        const onError = (err: Error) => {
          server?.removeListener("error", onError);
          reject(err);
        };
        server!.once("error", onError);
        server!.listen(port, "127.0.0.1", () => {
          server?.removeListener("error", onError);
          const address = server?.address();
          if (address && typeof address === "object") {
            actualPort = address.port;
          } else {
            actualPort = port;
          }
          resolve();
        });
      });
    },
    registerTools(roleId: string, tools: AgentToolDefinition[]): void {
      if (typeof roleId !== "string" || roleId.length === 0) return;
      const map = new Map<string, AgentToolDefinition>();
      for (const tool of tools) {
        if (tool && typeof tool.id === "string" && tool.id.length > 0) {
          map.set(tool.id, tool);
        }
      }
      registeredTools.set(roleId, map);
    },
    shutdown(): Promise<void> {
      const s = server;
      if (!s) return Promise.resolve();
      return new Promise<void>((resolve) => {
        s.close(() => {
          server = undefined;
          actualPort = undefined;
          resolve();
        });
      });
    },
  };

  return api;

  // ---------------------------------------------------------------------------
  // 内部：单请求处理
  // ---------------------------------------------------------------------------

  async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    // 仅接受 POST /tools/invoke。
    if (req.method !== "POST") {
      writeJson(res, 405, {
        requestId: "",
        success: false,
        error: "method_not_allowed",
        durationMs: 0,
      });
      return;
    }
    const url = req.url ?? "";
    // 允许带 query string，但 pathname 必须严格匹配。
    const pathname = url.split("?")[0];
    if (pathname !== "/tools/invoke") {
      writeJson(res, 404, {
        requestId: "",
        success: false,
        error: "not_found",
        durationMs: 0,
      });
      return;
    }

    const startMs = opts.now().getTime();

    const timestamp = readHeader(req, "X-Agent-Timestamp");
    const signature = readHeader(req, "X-Agent-Signature");
    const headerRequestId = readHeader(req, "X-Agent-RequestId");

    const rawBody = await readRawBody(req);

    if (!timestamp || !signature) {
      writeJson(res, 401, {
        requestId: headerRequestId ?? "",
        success: false,
        error: "invalid_signature",
        durationMs: 0,
      });
      return;
    }

    // 可选：timestamp skew 检查。
    if (typeof opts.maxClockSkewMs === "number" && opts.maxClockSkewMs > 0) {
      const ts = Date.parse(timestamp);
      if (!Number.isFinite(ts)) {
        writeJson(res, 401, {
          requestId: headerRequestId ?? "",
          success: false,
          error: "invalid_signature",
          durationMs: 0,
        });
        return;
      }
      const skew = Math.abs(opts.now().getTime() - ts);
      if (skew > opts.maxClockSkewMs) {
        writeJson(res, 401, {
          requestId: headerRequestId ?? "",
          success: false,
          error: "invalid_signature",
          durationMs: 0,
        });
        return;
      }
    }

    const expected = createHmac("sha256", opts.hmacSecret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");

    if (!signatureEquals(signature, expected)) {
      writeJson(res, 401, {
        requestId: headerRequestId ?? "",
        success: false,
        error: "invalid_signature",
        durationMs: 0,
      });
      return;
    }

    // 解析 body。
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(rawBody);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        writeJson(res, 400, {
          requestId: headerRequestId ?? "",
          success: false,
          error: "malformed_body",
          durationMs: 0,
        });
        return;
      }
      body = parsed as Record<string, unknown>;
    } catch {
      writeJson(res, 400, {
        requestId: headerRequestId ?? "",
        success: false,
        error: "malformed_body",
        durationMs: 0,
      });
      return;
    }

    const roleId = typeof body.roleId === "string" ? body.roleId : "";
    const jobId = typeof body.jobId === "string" ? body.jobId : "";
    const toolId = typeof body.toolId === "string" ? body.toolId : "";
    const requestId =
      typeof body.requestId === "string" && body.requestId
        ? body.requestId
        : headerRequestId ?? "";
    const params =
      body.params && typeof body.params === "object" && !Array.isArray(body.params)
        ? (body.params as Record<string, unknown>)
        : {};

    if (!roleId || !jobId || !toolId) {
      writeJson(res, 400, {
        requestId,
        success: false,
        error: "missing_required_fields",
        durationMs: 0,
      });
      return;
    }

    // 白名单校验。
    const roleBucket = registeredTools.get(roleId);
    if (!roleBucket) {
      writeJson(res, 403, {
        requestId,
        success: false,
        error: "role_not_registered",
        durationMs: 0,
      });
      return;
    }
    const toolDef = roleBucket.get(toolId);
    if (!toolDef) {
      writeJson(res, 403, {
        requestId,
        success: false,
        error: "tool_not_whitelisted",
        durationMs: 0,
      });
      return;
    }

    // 路由 + 超时。
    const invokeResult = await routeInvocationWithTimeout({
      roleId,
      jobId,
      toolId,
      params,
      toolDef,
    });

    const durationMs = Math.max(0, opts.now().getTime() - startMs);
    writeJson(res, 200, {
      requestId,
      success: invokeResult.success,
      result: invokeResult.success ? invokeResult.result : undefined,
      error: invokeResult.success ? undefined : invokeResult.error,
      durationMs,
    });
  }

  async function routeInvocationWithTimeout(input: {
    roleId: string;
    jobId: string;
    toolId: string;
    params: Record<string, unknown>;
    toolDef: AgentToolDefinition;
  }): Promise<{ success: true; result: unknown } | { success: false; error: string }> {
    const timeoutMs = resolveTimeoutMs(input.toolDef);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ success: false; error: string }>(
      (resolve) => {
        timer = setTimeout(() => {
          resolve({
            success: false,
            error: `timeout_after_${timeoutMs}ms`,
          });
        }, timeoutMs);
      },
    );

    try {
      return await Promise.race([
        routeInvocation(input),
        timeoutPromise,
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function resolveTimeoutMs(toolDef: AgentToolDefinition): number {
    const raw = toolDef.timeoutMs;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      return Math.floor(raw);
    }
    return 60_000;
  }

  async function routeInvocation(input: {
    roleId: string;
    jobId: string;
    toolId: string;
    params: Record<string, unknown>;
    toolDef: AgentToolDefinition;
  }): Promise<{ success: true; result: unknown } | { success: false; error: string }> {
    const split = splitToolId(input.toolId);
    if (!split) {
      return { success: false, error: "unknown_tool_category" };
    }
    const { category, rest } = split;

    switch (category) {
      case "mcp":
        return routeMcp(input, rest);
      case "skill":
        return routeSkill(input, rest);
      case "aigc":
        return routeAigc(input, rest);
      case "builtin":
        return {
          success: false,
          error: "builtin_tools_must_not_go_through_proxy",
        };
      default:
        return { success: false, error: "unknown_tool_category" };
    }
  }

  async function routeMcp(
    input: {
      roleId: string;
      jobId: string;
      params: Record<string, unknown>;
    },
    serverId: string,
  ): Promise<{ success: true; result: unknown } | { success: false; error: string }> {
    const adapter = opts.mcpToolAdapter;
    if (!adapter) {
      return { success: false, error: "mcp_adapter_not_available" };
    }

    // TODO(Task 5/6 Delegator)：收紧 McpToolExecutionRequest 构造，允许按需传入
    // agentId / token / workflowId / metadata 等上下文，而不是在此硬编码默认值。
    const toolName =
      typeof input.params.toolName === "string" && input.params.toolName
        ? input.params.toolName
        : "invoke";
    const inputText =
      typeof input.params.input === "string" && input.params.input
        ? input.params.input
        : `agent ${input.roleId} invoking ${serverId}`;
    const argsCandidate = input.params.arguments;
    const argsRecord: Record<string, unknown> =
      argsCandidate && typeof argsCandidate === "object" && !Array.isArray(argsCandidate)
        ? (argsCandidate as Record<string, unknown>)
        : (input.params.inputs && typeof input.params.inputs === "object" &&
            !Array.isArray(input.params.inputs)
            ? (input.params.inputs as Record<string, unknown>)
            : {});

    const request: McpToolExecutionRequest = {
      serverId,
      toolName,
      arguments: argsRecord,
      input: inputText,
      context: [],
      agentId: input.roleId,
      metadata: { source: "role-agent-runtime", jobId: input.jobId },
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
    input: {
      roleId: string;
      params: Record<string, unknown>;
    },
    skillId: string,
  ): Promise<{ success: true; result: unknown } | { success: false; error: string }> {
    const registry = opts.skillRegistry;
    if (!registry) {
      return { success: false, error: "skill_registry_not_available" };
    }
    try {
      const handle = await registry.loadForRole({
        roleId: input.roleId,
        skillId,
      });
      if (!handle) {
        return { success: false, error: "skill_not_found" };
      }
      const result = await handle.invoke(input.params);
      return { success: true, result };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async function routeAigc(
    input: {
      params: Record<string, unknown>;
    },
    nodeId: string,
  ): Promise<{ success: true; result: unknown } | { success: false; error: string }> {
    const invoker = opts.aigcNodeInvoker;
    if (!invoker) {
      return { success: false, error: "aigc_invoker_not_available" };
    }
    try {
      const result = await invoker(nodeId, input.params);
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
}
