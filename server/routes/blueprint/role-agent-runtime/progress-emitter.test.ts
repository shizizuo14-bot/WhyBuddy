/**
 * `autopilot-role-autonomous-agent` spec Task 2.10：ProgressEmitter 单测。
 *
 * 覆盖：
 * - emit 是非阻塞的（同步返回，不等待 fetch）。
 * - HMAC 签名 / 头部按约定注入。
 * - fetch 失败只记 debug，不抛错。
 * - createNoopProgressEmitter 完全静默。
 */

import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import type { AgentProgressEvent } from "../../../../shared/blueprint/agent-events.js";
import {
  createHttpProgressEmitter,
  createNoopProgressEmitter,
} from "./progress-emitter.js";

function buildLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function buildEvent(overrides: Partial<AgentProgressEvent> = {}): AgentProgressEvent {
  return {
    type: "agent.thinking",
    jobId: "job-1",
    roleId: "role-x",
    stageId: "runtime_capability",
    iteration: 1,
    timestamp: "2026-06-01T12:00:00.000Z",
    phase: "thinking",
    tokensUsed: 0,
    budgetRemaining: { iterations: 20, tokens: 100_000, timeMs: 300_000 },
    ...overrides,
  };
}

describe("createHttpProgressEmitter", () => {
  it("emit returns synchronously before the fetch promise resolves", async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const emitter = createHttpProgressEmitter({
      callbackUrl: "http://host/api/callback",
      callbackSecret: "secret",
      fetch: fetchMock as unknown as typeof fetch,
      logger: buildLogger(),
    });

    const returnValue = emitter.emit(buildEvent());
    expect(returnValue).toBeUndefined(); // 非 Promise
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 解除 fetch promise 让测试清理不挂起。
    resolveFetch?.(new Response("", { status: 200 }));
    await Promise.resolve();
  });

  it("signs requests with HMAC-SHA256 over `${ts}.${body}` and sets X-Agent-* headers", async () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    let capturedHeaders: Record<string, string> | undefined;
    let capturedBody: string | undefined;

    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      capturedBody = init?.body as string;
      return new Response("", { status: 200 });
    });

    const emitter = createHttpProgressEmitter({
      callbackUrl: "http://host/api/callback",
      callbackSecret: "shared-secret",
      fetch: fetchMock as unknown as typeof fetch,
      logger: buildLogger(),
      now: () => now,
    });

    emitter.emit(buildEvent({ type: "agent.acting" }));
    // fire-and-forget：等微任务 queue 清空。
    await new Promise((resolve) => setImmediate(resolve));

    const expectedSignature = createHmac("sha256", "shared-secret")
      .update(`${now.toISOString()}.${capturedBody ?? ""}`)
      .digest("hex");
    expect(capturedHeaders?.["X-Agent-Signature"]).toBe(expectedSignature);
    expect(capturedHeaders?.["X-Agent-Timestamp"]).toBe(now.toISOString());
    expect(capturedHeaders?.["X-Agent-EventType"]).toBe("agent.acting");
    expect(capturedHeaders?.["Content-Type"]).toBe("application/json");
  });

  it("swallows fetch rejection and records a debug log", async () => {
    const logger = buildLogger();
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });

    const emitter = createHttpProgressEmitter({
      callbackUrl: "http://host/api/callback",
      callbackSecret: "s",
      fetch: fetchMock as unknown as typeof fetch,
      logger,
    });

    expect(() => emitter.emit(buildEvent())).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
    expect(logger.debug).toHaveBeenCalled();
  });

  it("swallows non-2xx responses and logs debug", async () => {
    const logger = buildLogger();
    const fetchMock = vi.fn(async () => new Response("boom", { status: 500 }));

    const emitter = createHttpProgressEmitter({
      callbackUrl: "http://host/api/callback",
      callbackSecret: "s",
      fetch: fetchMock as unknown as typeof fetch,
      logger,
    });

    expect(() => emitter.emit(buildEvent())).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
    expect(logger.debug).toHaveBeenCalled();
  });
});

describe("createNoopProgressEmitter", () => {
  it("emit is a no-op and never throws", () => {
    const emitter = createNoopProgressEmitter();
    expect(() => emitter.emit(buildEvent())).not.toThrow();
  });
});
