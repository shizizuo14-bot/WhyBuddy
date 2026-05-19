/**
 * `autopilot-role-autonomous-agent` spec Task 2.6：
 * 容器内 Agent 通过 HTTP 调用宿主 ToolProxyServer 的最小客户端。
 *
 * 行为：
 * 1. 构造请求体 `{ roleId, jobId, toolId, params, requestId }`。
 * 2. 基于共享 HMAC 秘钥对 `${timestamp}.${body}` 做 SHA-256 签名，
 *    头部携带 `X-Agent-Timestamp`、`X-Agent-Signature`、`X-Agent-RequestId`。
 * 3. 使用 `AbortController` + `setTimeout(timeoutMs)` 做调用级超时控制。
 * 4. 任何错误（网络 / 超时 / 非 2xx / 响应解析失败）都转换为
 *    `{ success: false, error, durationMs }`，绝不向外抛错。
 *
 * 设计约束：
 * - 不引入第三方 HTTP 库，使用全局 `fetch`（Node 18+）。
 * - 不缓存 fetch 引用于模块级，调用方可通过 `opts.fetch` 注入 mock。
 */

import { createHmac } from "node:crypto";

import type { BlueprintLogger } from "../context.js";

/** 单次工具调用请求（容器侧视角）。 */
export interface ToolInvokeRequest {
  roleId: string;
  jobId: string;
  toolId: string;
  params: Record<string, unknown>;
  requestId: string;
  /** 最长等待时长（ms），覆盖 proxyUrl 默认配置。 */
  timeoutMs: number;
}

/** 工具调用结果（success === false 时 result 不会给出）。 */
export interface ToolInvokeResult {
  success: boolean;
  result?: unknown;
  error?: string;
  durationMs: number;
}

/** 统一调用接口；state-machine 通过该接口发起工具调用。 */
export interface ToolInvoker {
  invoke(req: ToolInvokeRequest): Promise<ToolInvokeResult>;
}

/** HTTP 客户端工厂依赖。 */
export interface CreateHttpToolProxyClientOptions {
  /** ToolProxyServer 的根地址，例如 `http://host.docker.internal:3210`。 */
  proxyUrl: string;
  /** 与 ToolProxyServer 共享的 HMAC 秘钥。 */
  hmacSecret: string;
  /** 可选：注入自定义 fetch（测试 mock）。默认 `globalThis.fetch`。 */
  fetch?: typeof fetch;
  /** 日志接口（静默失败时 debug 输出）。 */
  logger: BlueprintLogger;
  /** 可替换的“当前时间”函数。测试中固定时间戳用。 */
  now: () => Date;
}

function sign(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
}

/**
 * 创建 HTTP ToolProxy 客户端。
 */
export function createHttpToolProxyClient(
  opts: CreateHttpToolProxyClientOptions,
): ToolInvoker {
  const fetchImpl: typeof fetch =
    opts.fetch ?? (globalThis.fetch as typeof fetch | undefined) ?? (undefined as unknown as typeof fetch);
  if (!fetchImpl) {
    // 在极少数不具备 fetch 的环境下退化为永远失败。
    return {
      async invoke(req) {
        return {
          success: false,
          error: "fetch_not_available",
          durationMs: 0,
        } satisfies ToolInvokeResult;
      },
    };
  }
  const base = opts.proxyUrl.replace(/\/+$/, "");

  async function invoke(req: ToolInvokeRequest): Promise<ToolInvokeResult> {
    const startMs = opts.now().getTime();
    const body = JSON.stringify({
      roleId: req.roleId,
      jobId: req.jobId,
      toolId: req.toolId,
      params: req.params,
      requestId: req.requestId,
    });
    const timestamp = opts.now().toISOString();
    const signature = sign(opts.hmacSecret, timestamp, body);

    const controller = new AbortController();
    const timeoutMs = Math.max(1, req.timeoutMs | 0);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(`${base}/tools/invoke`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Agent-Timestamp": timestamp,
          "X-Agent-Signature": signature,
          "X-Agent-RequestId": req.requestId,
        },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await safeText(response);
        return {
          success: false,
          error: `http_${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
          durationMs: elapsed(opts, startMs),
        };
      }

      const parsed = await safeJson(response);
      if (!parsed || typeof parsed !== "object") {
        return {
          success: false,
          error: "malformed_response",
          durationMs: elapsed(opts, startMs),
        };
      }
      const payload = parsed as Record<string, unknown>;
      const success = payload.success === true;
      if (success) {
        return {
          success: true,
          result: payload.result,
          durationMs: elapsed(opts, startMs),
        };
      }
      const errorText =
        typeof payload.error === "string" ? payload.error : "tool_invoke_failed";
      return {
        success: false,
        error: errorText,
        durationMs: elapsed(opts, startMs),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // AbortError → timeout 语义。
      const isAbort =
        (error instanceof Error && error.name === "AbortError") ||
        /abort/i.test(message);
      const errorText = isAbort
        ? `timeout_after_${timeoutMs}ms`
        : `fetch_failed: ${message}`;
      opts.logger.debug("[agent.toolProxy] invoke failed", {
        toolId: req.toolId,
        error: errorText,
      });
      return {
        success: false,
        error: errorText,
        durationMs: elapsed(opts, startMs),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return { invoke };
}

function elapsed(opts: CreateHttpToolProxyClientOptions, startMs: number): number {
  return Math.max(0, opts.now().getTime() - startMs);
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
