/**
 * `autopilot-role-autonomous-agent` spec Task 2.8：
 * Agent Loop 进度回调 emitter。
 *
 * 设计要点：
 * - `emit(event)` 是**同步函数**，但内部以 fire-and-forget 方式异步 POST，
 *   保证状态机主循环不因为回调慢而阻塞（design §2.3）。
 * - 所有错误在 emitter 内部吞掉，只记 logger 层级的 warn/debug，绝不向外抛。
 * - HMAC 签名格式与 ToolProxyClient 保持一致：`sha256(secret, ts + "." + body)`。
 * - 提供 `createNoopProgressEmitter()` 用于 lite mode 或测试。
 */

import { createHmac } from "node:crypto";

import type { AgentProgressEvent } from "../../../../shared/blueprint/agent-events.js";
import type { BlueprintLogger } from "../context.js";

/** 进度 emitter 公开接口。 */
export interface ProgressEmitter {
  emit(event: AgentProgressEvent): void;
}

/** HTTP emitter 工厂参数。 */
export interface CreateHttpProgressEmitterOptions {
  /** 宿主回调 URL，例如 `https://host/api/blueprint/agent/progress`。 */
  callbackUrl: string;
  /** 与宿主共享的 HMAC 秘钥。 */
  callbackSecret: string;
  /** 可注入 fetch；默认 `globalThis.fetch`。 */
  fetch?: typeof fetch;
  /** logger，只做静默失败日志。 */
  logger: BlueprintLogger;
  /** 可替换的时间函数（测试用）。 */
  now?: () => Date;
}

function sign(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
}

/**
 * 创建 HTTP 进度 emitter：fire-and-forget POST 回调。
 */
export function createHttpProgressEmitter(
  opts: CreateHttpProgressEmitterOptions,
): ProgressEmitter {
  const fetchImpl: typeof fetch | undefined =
    opts.fetch ?? (globalThis.fetch as typeof fetch | undefined);
  const now = opts.now ?? (() => new Date());

  if (!fetchImpl) {
    opts.logger.debug("[agent.progress] fetch not available, emitter degraded to no-op");
    return createNoopProgressEmitter();
  }

  return {
    emit(event) {
      try {
        const body = JSON.stringify(event);
        const timestamp = now().toISOString();
        const signature = sign(opts.callbackSecret, timestamp, body);
        // 不 await：fire-and-forget；Promise 内部错误被 .catch 吞掉。
        fetchImpl(opts.callbackUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Agent-Timestamp": timestamp,
            "X-Agent-Signature": signature,
            "X-Agent-EventType": event.type,
          },
          body,
        })
          .then((response) => {
            if (!response.ok) {
              opts.logger.debug("[agent.progress] callback non-2xx", {
                type: event.type,
                status: response.status,
              });
            }
          })
          .catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            opts.logger.debug("[agent.progress] callback failed", {
              type: event.type,
              error: message,
            });
          });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        opts.logger.debug("[agent.progress] emit serialization failed", {
          type: event.type,
          error: message,
        });
      }
    },
  };
}

/**
 * 无操作 emitter：用于 lite mode 或不需要回调的测试场景。
 */
export function createNoopProgressEmitter(): ProgressEmitter {
  return {
    emit() {
      /* no-op */
    },
  };
}
