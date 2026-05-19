/**
 * `autopilot-role-autonomous-agent` spec Task 7.5：CallbackReceiver 单测。
 *
 * 覆盖：
 * - HMAC 验签成功 / 失败 / timestamp 缺失 / signature 缺失
 * - Body malformed JSON 与 malformed event
 * - listener 订阅 / 取消订阅 / 多 listener 独立 / listener 抛错不影响其他 listener
 * - diagnostics 计数 (totalReceived / validSignatureCount / invalidSignatureCount
 *   / lastEventAt / lastEventType)
 * - `callbackUrl` 构造（默认 host / externalBaseUrl 覆盖）
 * - 路由：非 `/progress` → 404；非 POST → 405
 * - 生命周期：shutdown 后新连接失败
 */

import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCallbackReceiver,
  type CallbackReceiver,
} from "./callback-receiver.js";
import type { AgentProgressEvent } from "../../../../shared/blueprint/agent-events.js";
import type { BlueprintLogger } from "../context.js";

const HMAC_SECRET = "test-callback-secret";

function buildLogger(): BlueprintLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeEvent(overrides: Partial<AgentProgressEvent> = {}): AgentProgressEvent {
  return {
    type: "agent.thinking",
    jobId: "job-1",
    roleId: "role-planner",
    stageId: "planning",
    iteration: 3,
    timestamp: new Date("2026-05-15T10:00:00Z").toISOString(),
    phase: "thinking",
    tokensUsed: 500,
    budgetRemaining: {
      iterations: 17,
      tokens: 99500,
      timeMs: 290_000,
    },
    ...overrides,
  };
}

function signedHeaders(
  body: string,
  now: Date,
  secret: string = HMAC_SECRET,
): Record<string, string> {
  const timestamp = now.toISOString();
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return {
    "Content-Type": "application/json",
    "X-Agent-Timestamp": timestamp,
    "X-Agent-Signature": signature,
    "X-Agent-RequestId": "req-callback",
  };
}

async function postProgress(
  port: number,
  body: unknown,
  headers: Record<string, string>,
  path: string = "/progress",
): Promise<{ status: number; json: any }> {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { ...headers, "Content-Length": String(Buffer.byteLength(bodyStr)) },
    body: bodyStr,
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { __raw: text };
  }
  return { status: response.status, json };
}

describe("createCallbackReceiver", () => {
  let receiver: CallbackReceiver;

  beforeEach(() => {
    receiver = createCallbackReceiver({
      hmacSecret: HMAC_SECRET,
      logger: buildLogger(),
      now: () => new Date(),
    });
  });

  afterEach(async () => {
    await receiver.shutdown();
  });

  // ─── HMAC 验签 ─────────────────────────────────────────────────────────

  it("accepts a valid signed progress event, returns 200 ok and invokes listener", async () => {
    await receiver.start(0);

    const received: AgentProgressEvent[] = [];
    receiver.onProgress((event) => {
      received.push(event);
    });

    const event = makeEvent();
    const body = JSON.stringify(event);
    const res = await postProgress(
      receiver.actualPort!,
      event,
      signedHeaders(body, new Date()),
    );

    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true });
    expect(received).toHaveLength(1);
    expect(received[0].type).toBe("agent.thinking");
    expect(received[0].jobId).toBe("job-1");
  });

  it("rejects requests with bad HMAC signature (401) without invoking listeners", async () => {
    await receiver.start(0);

    const listener = vi.fn();
    receiver.onProgress(listener);

    const event = makeEvent();
    const res = await postProgress(receiver.actualPort!, event, {
      "Content-Type": "application/json",
      "X-Agent-Timestamp": new Date().toISOString(),
      "X-Agent-Signature": "a".repeat(64),
      "X-Agent-RequestId": "req-bad",
    });

    expect(res.status).toBe(401);
    expect(res.json.error).toBe("invalid_signature");
    expect(listener).not.toHaveBeenCalled();

    const diag = receiver.getDiagnostics();
    expect(diag.invalidSignatureCount).toBe(1);
    expect(diag.validSignatureCount).toBe(0);
  });

  it("rejects requests with missing X-Agent-Timestamp header (401)", async () => {
    await receiver.start(0);

    const event = makeEvent();
    const body = JSON.stringify(event);
    const signature = createHmac("sha256", HMAC_SECRET)
      .update(`ignored.${body}`)
      .digest("hex");

    const res = await postProgress(receiver.actualPort!, event, {
      "Content-Type": "application/json",
      "X-Agent-Signature": signature,
      // deliberately omit timestamp
    });

    expect(res.status).toBe(401);
    expect(res.json.error).toBe("invalid_signature");
    expect(receiver.getDiagnostics().invalidSignatureCount).toBe(1);
  });

  it("rejects requests with missing X-Agent-Signature header (401)", async () => {
    await receiver.start(0);

    const event = makeEvent();
    const res = await postProgress(receiver.actualPort!, event, {
      "Content-Type": "application/json",
      "X-Agent-Timestamp": new Date().toISOString(),
      // deliberately omit signature
    });

    expect(res.status).toBe(401);
    expect(res.json.error).toBe("invalid_signature");
    expect(receiver.getDiagnostics().invalidSignatureCount).toBe(1);
  });

  // ─── Body 校验 ─────────────────────────────────────────────────────────

  it("returns 400 malformed_body when body is not valid JSON (but signature matches)", async () => {
    await receiver.start(0);

    const rawBody = "not-json";
    const res = await postProgress(
      receiver.actualPort!,
      rawBody,
      signedHeaders(rawBody, new Date()),
    );

    expect(res.status).toBe(400);
    expect(res.json.error).toBe("malformed_body");
    // 验签通过不算 invalid，但也不算 valid（还没解析出事件）。
    const diag = receiver.getDiagnostics();
    expect(diag.invalidSignatureCount).toBe(0);
    expect(diag.validSignatureCount).toBe(0);
  });

  it("returns 400 malformed_event when required fields are missing", async () => {
    await receiver.start(0);

    const listener = vi.fn();
    receiver.onProgress(listener);

    // 缺少 "type" 字段。
    const incomplete = {
      jobId: "job-1",
      roleId: "role-a",
      iteration: 1,
      timestamp: new Date().toISOString(),
      phase: "thinking",
    };
    const body = JSON.stringify(incomplete);
    const res = await postProgress(
      receiver.actualPort!,
      incomplete,
      signedHeaders(body, new Date()),
    );

    expect(res.status).toBe(400);
    expect(res.json.error).toBe("malformed_event");
    expect(listener).not.toHaveBeenCalled();
  });

  // ─── 订阅 / 广播 ──────────────────────────────────────────────────────

  it("broadcasts events to multiple listeners", async () => {
    await receiver.start(0);

    const l1 = vi.fn();
    const l2 = vi.fn();
    const l3 = vi.fn();
    receiver.onProgress(l1);
    receiver.onProgress(l2);
    receiver.onProgress(l3);

    const event = makeEvent();
    const body = JSON.stringify(event);
    const res = await postProgress(
      receiver.actualPort!,
      event,
      signedHeaders(body, new Date()),
    );

    expect(res.status).toBe(200);
    expect(l1).toHaveBeenCalledTimes(1);
    expect(l2).toHaveBeenCalledTimes(1);
    expect(l3).toHaveBeenCalledTimes(1);
    expect(l1.mock.calls[0][0].jobId).toBe("job-1");
  });

  it("unsubscribe function removes listener from future events", async () => {
    await receiver.start(0);

    const l1 = vi.fn();
    const l2 = vi.fn();
    const unsubscribe1 = receiver.onProgress(l1);
    receiver.onProgress(l2);

    // 第一次事件：两个 listener 都收到。
    const e1 = makeEvent({ iteration: 1 });
    await postProgress(
      receiver.actualPort!,
      e1,
      signedHeaders(JSON.stringify(e1), new Date()),
    );

    // 取消订阅 l1 之后，第二次事件只有 l2 会收到。
    unsubscribe1();

    const e2 = makeEvent({ iteration: 2 });
    await postProgress(
      receiver.actualPort!,
      e2,
      signedHeaders(JSON.stringify(e2), new Date()),
    );

    expect(l1).toHaveBeenCalledTimes(1);
    expect(l2).toHaveBeenCalledTimes(2);
  });

  it("listener that throws does not prevent other listeners from receiving events", async () => {
    await receiver.start(0);

    const throwing = vi.fn(() => {
      throw new Error("boom");
    });
    const healthy = vi.fn();
    receiver.onProgress(throwing);
    receiver.onProgress(healthy);

    const event = makeEvent();
    const res = await postProgress(
      receiver.actualPort!,
      event,
      signedHeaders(JSON.stringify(event), new Date()),
    );

    expect(res.status).toBe(200);
    expect(throwing).toHaveBeenCalledTimes(1);
    expect(healthy).toHaveBeenCalledTimes(1);
  });

  // ─── 诊断计数 ─────────────────────────────────────────────────────────

  it("tracks diagnostics counters across valid and invalid requests", async () => {
    await receiver.start(0);

    // 2 个合法请求。
    for (const iteration of [1, 2]) {
      const e = makeEvent({ iteration });
      await postProgress(
        receiver.actualPort!,
        e,
        signedHeaders(JSON.stringify(e), new Date()),
      );
    }

    // 1 个错误签名。
    await postProgress(
      receiver.actualPort!,
      makeEvent({ iteration: 99 }),
      {
        "Content-Type": "application/json",
        "X-Agent-Timestamp": new Date().toISOString(),
        "X-Agent-Signature": "b".repeat(64),
      },
    );

    // 1 个缺失 timestamp。
    await postProgress(
      receiver.actualPort!,
      makeEvent({ iteration: 100 }),
      {
        "Content-Type": "application/json",
        "X-Agent-Signature": "c".repeat(64),
      },
    );

    const diag = receiver.getDiagnostics();
    expect(diag.totalReceived).toBe(4);
    expect(diag.validSignatureCount).toBe(2);
    expect(diag.invalidSignatureCount).toBe(2);
    expect(diag.lastEventType).toBe("agent.thinking");
    expect(typeof diag.lastEventAt).toBe("string");
  });

  // ─── callbackUrl 构造 ─────────────────────────────────────────────────

  it("exposes callbackUrl as http://host:port/progress when no externalBaseUrl is given", async () => {
    await receiver.start(0);
    expect(receiver.callbackUrl).toBe(
      `http://127.0.0.1:${receiver.actualPort}/progress`,
    );
  });

  it("callbackUrl uses externalBaseUrl when provided, stripping trailing slash", async () => {
    const r = createCallbackReceiver({
      hmacSecret: HMAC_SECRET,
      externalBaseUrl: "http://host.docker.internal:3210/",
      logger: buildLogger(),
      now: () => new Date(),
    });
    try {
      await r.start(0);
      expect(r.callbackUrl).toBe("http://host.docker.internal:3210/progress");
    } finally {
      await r.shutdown();
    }
  });

  it("callbackUrl is undefined before start()", () => {
    expect(receiver.callbackUrl).toBeUndefined();
  });

  // ─── 路由 ─────────────────────────────────────────────────────────────

  it("returns 404 for non-/progress paths even when signed correctly", async () => {
    await receiver.start(0);

    const event = makeEvent();
    const body = JSON.stringify(event);
    const res = await postProgress(
      receiver.actualPort!,
      event,
      signedHeaders(body, new Date()),
      "/other-path",
    );

    expect(res.status).toBe(404);
  });

  it("returns 405 for non-POST methods", async () => {
    await receiver.start(0);

    const response = await fetch(
      `http://127.0.0.1:${receiver.actualPort}/progress`,
      { method: "GET" },
    );

    expect(response.status).toBe(405);
    const json = (await response.json()) as { ok: boolean; error: string };
    expect(json.error).toBe("method_not_allowed");
  });

  // ─── 生命周期 ─────────────────────────────────────────────────────────

  it("shutdown closes server, clears listeners and rejects subsequent connections", async () => {
    await receiver.start(0);
    const port = receiver.actualPort!;

    const listener = vi.fn();
    receiver.onProgress(listener);

    await receiver.shutdown();

    // Socket 连接应当被拒绝；fetch 会 reject 或返回非预期错误。
    await expect(
      fetch(`http://127.0.0.1:${port}/progress`, { method: "POST" }),
    ).rejects.toBeTruthy();

    // 重复 shutdown 应幂等。
    await expect(receiver.shutdown()).resolves.toBeUndefined();
  });

  it("rejects a second start() call while already running", async () => {
    await receiver.start(0);
    await expect(receiver.start(0)).rejects.toThrow(
      /callback_receiver_already_started/,
    );
  });
});
