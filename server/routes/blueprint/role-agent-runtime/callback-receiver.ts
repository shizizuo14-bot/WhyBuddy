/**
 * `autopilot-role-autonomous-agent` spec Task 7：宿主侧 CallbackReceiver。
 *
 * 职责：
 * - 在宿主进程内监听 HTTP 端口，承接容器内 Agent Loop 通过 `progress-emitter.ts`
 *   发出的进度事件回调（每次 iteration 的 thinking / acting / observing / completed
 *   等状态）。
 * - 对每条 `POST /progress` 做 HMAC-SHA256 验签（与 progress-emitter 对称）。
 * - 验签通过后：
 *   - 解析 `AgentProgressEvent` 并做最小字段校验
 *   - 通过 `onProgress(listener)` 订阅面广播给宿主（Task 5 Delegator 可订阅以回填
 *     `DelegateStatus` map）
 *   - 更新诊断计数（`totalReceived` / `validSignatureCount` /
 *     `invalidSignatureCount` / `lastEventAt` / `lastEventType`）
 * - 验签失败时只 `logger.warn` 记录安全事件，不抛错、不回显原始 body。
 *
 * 设计约束：
 * - 使用 Node 内建 `http.createServer` + `node:crypto`，不引入 express。
 * - 与 {@link createHttpProgressEmitter} 对称：header 名使用
 *   `X-Agent-Timestamp` / `X-Agent-Signature` / `X-Agent-RequestId`，签名算法为
 *   `sha256(hmacSecret, `${timestamp}.${rawBody}`)`。
 * - 绑定默认 `127.0.0.1`；容器通过 `host.docker.internal` 或 `externalBaseUrl`
 *   指定的地址访问。
 * - 不向外抛错；所有错误都收敛为 JSON 响应或静默日志。
 * - `shutdown()` 关闭 server 后会清空 listeners。
 *
 * 与相关模块的关系：
 * - {@link createHttpProgressEmitter}：容器侧 fire-and-forget 发送方，HMAC 逻辑
 *   必须 100% 对称。
 * - Task 5 {@link RoleAgentDelegator}：宿主侧消费方，通过 `onProgress(listener)`
 *   订阅事件流并将进度回写到 `DelegateStatus` map。
 * - Task 8 诊断扩展：通过 `getDiagnostics()` 聚合到
 *   `GET /api/blueprint/diagnostics` 的 `roleAutonomousAgent` 条目。
 */

import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";

import type { AgentProgressEvent } from "../../../../shared/blueprint/agent-events.js";
import type { BlueprintLogger } from "../context.js";

/** 诊断摘要。 */
export interface CallbackReceiverDiagnostics {
  /** 累计接收到的回调请求数（无论验签是否通过）。 */
  totalReceived: number;
  /** 验签通过的请求数。 */
  validSignatureCount: number;
  /** 验签失败的请求数（包含 timestamp / signature 缺失 / 不匹配等）。 */
  invalidSignatureCount: number;
  /** 最近一次成功事件的 ISO 时间；仅在 validSignatureCount > 0 时存在。 */
  lastEventAt?: string;
  /** 最近一次成功事件的 type；仅在 validSignatureCount > 0 时存在。 */
  lastEventType?: string;
}

/** 进度事件订阅函数签名；返回取消订阅回调。 */
export type ProgressListener = (event: AgentProgressEvent) => void;

/** CallbackReceiver 对外接口。design §3.7。 */
export interface CallbackReceiver {
  /** 启动 HTTP 监听；`port=0` 时由 OS 分配端口。 */
  start(port: number): Promise<void>;
  /** 关闭 server 并清空 listeners Set。 */
  shutdown(): Promise<void>;
  /** 实际监听的端口号（start 之后可读；未启动时为 undefined）。 */
  readonly actualPort?: number;
  /**
   * 生成容器应 POST 的完整回调 URL。
   * - 未 start 时返回 undefined。
   * - 若构造时传入 `externalBaseUrl`，则使用它拼接；否则使用 `http://host:port`。
   */
  readonly callbackUrl: string | undefined;
  /**
   * 订阅进度事件；返回取消订阅函数。
   * 多个 listener 独立调用，单个 listener 抛错不影响其他 listener。
   */
  onProgress(listener: ProgressListener): () => void;
  /** 诊断摘要。 */
  getDiagnostics(): CallbackReceiverDiagnostics;
}

/** 工厂参数。 */
export interface CreateCallbackReceiverOptions {
  /** 与容器 progress-emitter 共享的 HMAC 秘钥。 */
  hmacSecret: string;
  /** 可选：监听主机；默认 `127.0.0.1`。 */
  host?: string;
  /**
   * 可选：容器可达的外部 URL 基底（用于 `callbackUrl`）；
   * 例如 `http://host.docker.internal:3210`。
   * 未设则使用 `http://${host}:${actualPort}`。
   */
  externalBaseUrl?: string;
  /**
   * 可选：最大时钟偏移（ms）。未设则不校验。
   * 主要用于抵御 replay 攻击。
   */
  maxClockSkewMs?: number;
  logger: BlueprintLogger;
  now: () => Date;
}

// ─── 内部辅助：与 tool-proxy-server 对称的 HTTP / HMAC 工具 ────────────────

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
 * 最小字段校验：确认 parse 后的 JSON 具备 AgentProgressEvent 的必填字段。
 *
 * 不对所有 optional 字段做严格 schema 校验（避免过度耦合 shared 层的类型演进），
 * 只覆盖 design §3.7 中要求的字段最小集：type / jobId / roleId / iteration /
 * timestamp / phase。
 */
function isValidAgentProgressEvent(
  value: unknown,
): value is AgentProgressEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const v = value as Record<string, unknown>;
  if (typeof v.type !== "string" || v.type.length === 0) return false;
  if (typeof v.jobId !== "string" || v.jobId.length === 0) return false;
  if (typeof v.roleId !== "string" || v.roleId.length === 0) return false;
  if (typeof v.iteration !== "number" || !Number.isFinite(v.iteration)) {
    return false;
  }
  if (typeof v.timestamp !== "string" || v.timestamp.length === 0) return false;
  if (typeof v.phase !== "string" || v.phase.length === 0) return false;
  return true;
}

/**
 * 创建 CallbackReceiver 实例。与 ToolProxyServer 一样，实例应由宿主装配层管理
 * 生命周期；建议每次宿主 composition root 构造一个独立实例。
 */
export function createCallbackReceiver(
  opts: CreateCallbackReceiverOptions,
): CallbackReceiver {
  const host = opts.host ?? "127.0.0.1";
  const listeners = new Set<ProgressListener>();

  let server: Server | undefined;
  let actualPort: number | undefined;
  const diagnostics: CallbackReceiverDiagnostics = {
    totalReceived: 0,
    validSignatureCount: 0,
    invalidSignatureCount: 0,
  };

  const api: CallbackReceiver = {
    get actualPort(): number | undefined {
      return actualPort;
    },
    get callbackUrl(): string | undefined {
      if (typeof actualPort !== "number") return undefined;
      const base = opts.externalBaseUrl
        ? opts.externalBaseUrl.replace(/\/+$/, "")
        : `http://${host}:${actualPort}`;
      return `${base}/progress`;
    },
    start(port: number): Promise<void> {
      if (server) {
        return Promise.reject(new Error("callback_receiver_already_started"));
      }
      server = createServer((req, res) => {
        void handleRequest(req, res).catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          opts.logger.warn("[agent.callback] unhandled request error", {
            error: message,
          });
          try {
            writeJson(res, 500, { ok: false, error: "internal_error" });
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
        server!.listen(port, host, () => {
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
    shutdown(): Promise<void> {
      const s = server;
      if (!s) {
        listeners.clear();
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        s.close(() => {
          server = undefined;
          actualPort = undefined;
          listeners.clear();
          resolve();
        });
      });
    },
    onProgress(listener: ProgressListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getDiagnostics(): CallbackReceiverDiagnostics {
      // 返回快照，避免调用方直接改内部对象。
      return {
        totalReceived: diagnostics.totalReceived,
        validSignatureCount: diagnostics.validSignatureCount,
        invalidSignatureCount: diagnostics.invalidSignatureCount,
        lastEventAt: diagnostics.lastEventAt,
        lastEventType: diagnostics.lastEventType,
      };
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
    // 仅接受 POST /progress。
    if (req.method !== "POST") {
      writeJson(res, 405, { ok: false, error: "method_not_allowed" });
      return;
    }
    const url = req.url ?? "";
    const pathname = url.split("?")[0];
    if (pathname !== "/progress") {
      writeJson(res, 404, { ok: false, error: "not_found" });
      return;
    }

    diagnostics.totalReceived += 1;

    const timestamp = readHeader(req, "X-Agent-Timestamp");
    const signature = readHeader(req, "X-Agent-Signature");
    const requestId = readHeader(req, "X-Agent-RequestId") ?? "";

    const rawBody = await readRawBody(req);

    const remoteAddress =
      req.socket && typeof req.socket.remoteAddress === "string"
        ? req.socket.remoteAddress
        : undefined;

    if (!timestamp || !signature) {
      diagnostics.invalidSignatureCount += 1;
      opts.logger.warn("[agent.callback] invalid_signature: missing headers", {
        requestId,
        remoteAddress,
        reason: !timestamp ? "missing_timestamp" : "missing_signature",
      });
      writeJson(res, 401, { ok: false, error: "invalid_signature" });
      return;
    }

    // 可选：timestamp skew 检查。
    if (typeof opts.maxClockSkewMs === "number" && opts.maxClockSkewMs > 0) {
      const ts = Date.parse(timestamp);
      if (!Number.isFinite(ts)) {
        diagnostics.invalidSignatureCount += 1;
        opts.logger.warn("[agent.callback] invalid_signature: bad timestamp", {
          requestId,
          remoteAddress,
        });
        writeJson(res, 401, { ok: false, error: "invalid_signature" });
        return;
      }
      const skew = Math.abs(opts.now().getTime() - ts);
      if (skew > opts.maxClockSkewMs) {
        diagnostics.invalidSignatureCount += 1;
        opts.logger.warn("[agent.callback] invalid_signature: clock skew", {
          requestId,
          remoteAddress,
          skew,
        });
        writeJson(res, 401, { ok: false, error: "invalid_signature" });
        return;
      }
    }

    const expected = createHmac("sha256", opts.hmacSecret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");

    if (!signatureEquals(signature, expected)) {
      diagnostics.invalidSignatureCount += 1;
      opts.logger.warn("[agent.callback] invalid_signature: signature mismatch", {
        requestId,
        remoteAddress,
      });
      writeJson(res, 401, { ok: false, error: "invalid_signature" });
      return;
    }

    // 解析 body。
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      // 签名已通过但 body 不是合法 JSON；走 400，但不算 invalidSignature。
      writeJson(res, 400, { ok: false, error: "malformed_body" });
      return;
    }

    if (!isValidAgentProgressEvent(parsed)) {
      writeJson(res, 400, { ok: false, error: "malformed_event" });
      return;
    }

    const event = parsed;

    diagnostics.validSignatureCount += 1;
    diagnostics.lastEventAt = opts.now().toISOString();
    diagnostics.lastEventType = event.type;

    broadcast(event);

    writeJson(res, 200, { ok: true });
  }

  function broadcast(event: AgentProgressEvent): void {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        opts.logger.debug("[agent.callback] listener threw", {
          jobId: event.jobId,
          roleId: event.roleId,
          type: event.type,
          error: message,
        });
      }
    }
  }
}
