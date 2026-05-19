/**
 * `autopilot-role-autonomous-agent` spec Task 2.10：ToolProxyClient 单测。
 *
 * 覆盖：
 * - 成功调用 → 返回 result + durationMs。
 * - HTTP 500 → 返回 error，不抛错。
 * - 超时（AbortController）→ 返回 timeout 错误。
 * - HMAC 头部按约定格式注入（`sha256(secret, ts + "." + body)`）。
 * - 响应不合法 JSON → 返回 malformed_response。
 */

import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { createHttpToolProxyClient } from "./tool-proxy-client.js";

function buildLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function fixedNow(ms: number) {
  return () => new Date(ms);
}

function sign(secret: string, ts: string, body: string): string {
  return createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
}

describe("createHttpToolProxyClient", () => {
  it("returns tool result when proxy responds with success=true", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ success: true, result: { answer: 42 } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const client = createHttpToolProxyClient({
      proxyUrl: "http://host.internal:3210",
      hmacSecret: "secret",
      fetch: fetchMock as unknown as typeof fetch,
      logger: buildLogger(),
      now: fixedNow(1_700_000_000_000),
    });

    const result = await client.invoke({
      roleId: "role-x",
      jobId: "job-1",
      toolId: "skill.echo",
      params: { message: "hi" },
      requestId: "req-1",
      timeoutMs: 5_000,
    });

    expect(result.success).toBe(true);
    expect(result.result).toEqual({ answer: 42 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("signs requests with HMAC-SHA256 on `${ts}.${body}` and sets X-Agent-* headers", async () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    const timestamp = now.toISOString();

    let capturedHeaders: Record<string, string> | undefined;
    let capturedBody: string | undefined;
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      capturedBody = init?.body as string;
      return new Response(
        JSON.stringify({ success: true, result: "ok" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const client = createHttpToolProxyClient({
      proxyUrl: "http://host.internal:3210/",
      hmacSecret: "super-secret",
      fetch: fetchMock as unknown as typeof fetch,
      logger: buildLogger(),
      now: () => now,
    });

    await client.invoke({
      roleId: "role-x",
      jobId: "job-1",
      toolId: "skill.echo",
      params: { ping: true },
      requestId: "req-hmac",
      timeoutMs: 5_000,
    });

    expect(capturedHeaders?.["X-Agent-Timestamp"]).toBe(timestamp);
    expect(capturedHeaders?.["X-Agent-RequestId"]).toBe("req-hmac");
    expect(capturedHeaders?.["Content-Type"]).toBe("application/json");
    const expectedSignature = sign("super-secret", timestamp, capturedBody ?? "");
    expect(capturedHeaders?.["X-Agent-Signature"]).toBe(expectedSignature);
  });

  it("returns error payload when proxy responds with HTTP 500", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("internal boom", { status: 500 }),
    );

    const client = createHttpToolProxyClient({
      proxyUrl: "http://host.internal:3210",
      hmacSecret: "s",
      fetch: fetchMock as unknown as typeof fetch,
      logger: buildLogger(),
      now: fixedNow(0),
    });

    const result = await client.invoke({
      roleId: "r",
      jobId: "j",
      toolId: "skill.x",
      params: {},
      requestId: "req-500",
      timeoutMs: 1_000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/^http_500/);
  });

  it("returns timeout error when fetch aborts via AbortController", async () => {
    // 模拟 AbortError：fetch 在 controller.abort() 时 reject。
    const fetchMock = vi.fn(
      (url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal as AbortSignal | undefined;
          signal?.addEventListener("abort", () => {
            const error = new Error("The operation was aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );

    const client = createHttpToolProxyClient({
      proxyUrl: "http://host.internal:3210",
      hmacSecret: "s",
      fetch: fetchMock as unknown as typeof fetch,
      logger: buildLogger(),
      now: fixedNow(0),
    });

    const result = await client.invoke({
      roleId: "r",
      jobId: "j",
      toolId: "skill.slow",
      params: {},
      requestId: "req-timeout",
      timeoutMs: 5, // 极短超时
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/^timeout_after_/);
  });

  it("returns malformed_response when proxy returns invalid JSON", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("not-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const client = createHttpToolProxyClient({
      proxyUrl: "http://host.internal:3210",
      hmacSecret: "s",
      fetch: fetchMock as unknown as typeof fetch,
      logger: buildLogger(),
      now: fixedNow(0),
    });

    const result = await client.invoke({
      roleId: "r",
      jobId: "j",
      toolId: "skill.x",
      params: {},
      requestId: "req-malformed",
      timeoutMs: 1_000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("malformed_response");
  });

  it("returns error when proxy returns success=false and does not throw", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ success: false, error: "permission_denied" }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const client = createHttpToolProxyClient({
      proxyUrl: "http://host.internal:3210",
      hmacSecret: "s",
      fetch: fetchMock as unknown as typeof fetch,
      logger: buildLogger(),
      now: fixedNow(0),
    });

    const result = await client.invoke({
      roleId: "r",
      jobId: "j",
      toolId: "skill.x",
      params: {},
      requestId: "req-denied",
      timeoutMs: 1_000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("permission_denied");
  });
});
