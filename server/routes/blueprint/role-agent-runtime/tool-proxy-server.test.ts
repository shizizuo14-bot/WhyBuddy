/**
 * `autopilot-role-autonomous-agent` spec Task 4.7：ToolProxyServer 单测。
 *
 * 覆盖：
 * - HMAC 验签（成功 / 失败 / 缺失 timestamp / 缺失 signature）
 * - 白名单（roleId 未注册 / toolId 未注册）
 * - 路由：mcp / skill / aigc / builtin / 未知前缀
 * - 各类"适配器未注入"的错误响应
 * - 超时触发 `timeout_after_<ms>ms`
 * - 生命周期：shutdown 后新连接失败
 */

import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createToolProxyServer,
  type AigcNodeInvokerFn,
  type ToolProxyServer,
} from "./tool-proxy-server.js";
import type { AgentToolDefinition } from "../../../../shared/blueprint/agent-tool.js";
import type { BlueprintLogger, McpToolAdapterDependency } from "../context.js";
import type { McpToolExecutionResult } from "../../../tool/api/mcp-tool-adapter.js";
import type { SkillRegistryDependency } from "../role-container-loader/skills-binder.js";

const HMAC_SECRET = "test-secret";
const ROLE_ID = "role-x";

function buildLogger(): BlueprintLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeTool(id: string, timeoutMs = 5_000): AgentToolDefinition {
  const category: AgentToolDefinition["category"] = id.startsWith("mcp.")
    ? "mcp"
    : id.startsWith("skill.")
      ? "skill"
      : id.startsWith("aigc.")
        ? "aigc_node"
        : "builtin";
  return {
    id,
    name: id.replace(/\./g, "_"),
    description: id,
    category,
    inputSchema: { type: "object", properties: {}, additionalProperties: true },
    requiresProxy: category !== "builtin",
    timeoutMs,
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
    "X-Agent-RequestId": "req-test",
  };
}

async function postInvoke(
  port: number,
  body: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<{ status: number; json: any }> {
  const bodyStr = JSON.stringify(body);
  const response = await fetch(`http://127.0.0.1:${port}/tools/invoke`, {
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

describe("createToolProxyServer", () => {
  let server: ToolProxyServer;

  beforeEach(() => {
    server = createToolProxyServer({
      hmacSecret: HMAC_SECRET,
      logger: buildLogger(),
      now: () => new Date(),
    });
  });

  afterEach(async () => {
    await server.shutdown();
  });

  it("rejects requests with missing X-Agent-Timestamp header (401 invalid_signature)", async () => {
    await server.start(0);
    server.registerTools(ROLE_ID, [makeTool("skill.echo")]);

    const body = JSON.stringify({
      roleId: ROLE_ID,
      jobId: "job-1",
      toolId: "skill.echo",
      params: {},
      requestId: "r1",
    });
    const signature = createHmac("sha256", HMAC_SECRET)
      .update(`ignored.${body}`)
      .digest("hex");

    const res = await postInvoke(server.actualPort!, JSON.parse(body), {
      "Content-Type": "application/json",
      "X-Agent-Signature": signature,
      // deliberately omit timestamp
    });

    expect(res.status).toBe(401);
    expect(res.json.error).toBe("invalid_signature");
  });

  it("rejects requests with missing X-Agent-Signature header (401 invalid_signature)", async () => {
    await server.start(0);
    server.registerTools(ROLE_ID, [makeTool("skill.echo")]);

    const res = await postInvoke(
      server.actualPort!,
      { roleId: ROLE_ID, jobId: "j", toolId: "skill.echo", params: {}, requestId: "r" },
      {
        "Content-Type": "application/json",
        "X-Agent-Timestamp": new Date().toISOString(),
        // deliberately omit signature
      },
    );

    expect(res.status).toBe(401);
    expect(res.json.error).toBe("invalid_signature");
  });

  it("rejects requests with bad HMAC signature (401 invalid_signature)", async () => {
    await server.start(0);
    server.registerTools(ROLE_ID, [makeTool("skill.echo")]);

    const res = await postInvoke(
      server.actualPort!,
      { roleId: ROLE_ID, jobId: "j", toolId: "skill.echo", params: {}, requestId: "r" },
      {
        "Content-Type": "application/json",
        "X-Agent-Timestamp": new Date().toISOString(),
        "X-Agent-Signature": "a".repeat(64),
        "X-Agent-RequestId": "r",
      },
    );

    expect(res.status).toBe(401);
    expect(res.json.error).toBe("invalid_signature");
  });

  it("rejects unregistered roleId with 403 role_not_registered", async () => {
    await server.start(0);
    // 没有注册任何角色。

    const body = { roleId: "ghost", jobId: "j", toolId: "skill.echo", params: {}, requestId: "r" };
    const bodyStr = JSON.stringify(body);
    const now = new Date();
    const res = await postInvoke(server.actualPort!, body, signedHeaders(bodyStr, now));

    expect(res.status).toBe(403);
    expect(res.json.error).toBe("role_not_registered");
  });

  it("rejects non-whitelisted toolId with 403 tool_not_whitelisted", async () => {
    await server.start(0);
    server.registerTools(ROLE_ID, [makeTool("skill.allowed")]);

    const body = {
      roleId: ROLE_ID,
      jobId: "j",
      toolId: "skill.forbidden",
      params: {},
      requestId: "r",
    };
    const bodyStr = JSON.stringify(body);
    const now = new Date();
    const res = await postInvoke(server.actualPort!, body, signedHeaders(bodyStr, now));

    expect(res.status).toBe(403);
    expect(res.json.error).toBe("tool_not_whitelisted");
  });

  it("returns mcp_adapter_not_available when mcp.* is invoked without adapter", async () => {
    await server.start(0);
    server.registerTools(ROLE_ID, [makeTool("mcp.github")]);

    const body = {
      roleId: ROLE_ID,
      jobId: "j",
      toolId: "mcp.github",
      params: {},
      requestId: "r",
    };
    const bodyStr = JSON.stringify(body);
    const res = await postInvoke(
      server.actualPort!,
      body,
      signedHeaders(bodyStr, new Date()),
    );

    expect(res.status).toBe(200);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toBe("mcp_adapter_not_available");
  });

  it("routes mcp.* via McpToolAdapterDependency.execute and returns success", async () => {
    const mcpToolAdapter: McpToolAdapterDependency = {
      async execute(_req) {
        const result: McpToolExecutionResult = {
          ok: true,
          status: "completed",
          targetLabel: "github/invoke",
          operation: "mcp_tool",
          resource: "mcp_tool://github/invoke",
          output: "ok",
          response: { foo: "bar" },
          governance: {
            approval: { required: false, status: "not_required", source: "none" },
          },
          metadata: {
            serverId: "github",
            toolName: "invoke",
            timeoutMs: 5000,
            fallbackUsed: false,
          },
        };
        return result;
      },
    };

    server = createToolProxyServer({
      hmacSecret: HMAC_SECRET,
      mcpToolAdapter,
      logger: buildLogger(),
      now: () => new Date(),
    });
    await server.start(0);
    server.registerTools(ROLE_ID, [makeTool("mcp.github")]);

    const body = {
      roleId: ROLE_ID,
      jobId: "j",
      toolId: "mcp.github",
      params: { toolName: "invoke", arguments: { q: "hello" } },
      requestId: "r",
    };
    const res = await postInvoke(
      server.actualPort!,
      body,
      signedHeaders(JSON.stringify(body), new Date()),
    );

    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.result?.ok).toBe(true);
    expect(res.json.result?.response).toEqual({ foo: "bar" });
  });

  it("returns skill_registry_not_available when skill.* is invoked without registry", async () => {
    await server.start(0);
    server.registerTools(ROLE_ID, [makeTool("skill.echo")]);

    const body = {
      roleId: ROLE_ID,
      jobId: "j",
      toolId: "skill.echo",
      params: {},
      requestId: "r",
    };
    const res = await postInvoke(
      server.actualPort!,
      body,
      signedHeaders(JSON.stringify(body), new Date()),
    );

    expect(res.status).toBe(200);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toBe("skill_registry_not_available");
  });

  it("returns skill_not_found when skillRegistry.loadForRole returns null", async () => {
    const skillRegistry: SkillRegistryDependency = {
      async loadForRole() {
        return null;
      },
    };
    server = createToolProxyServer({
      hmacSecret: HMAC_SECRET,
      skillRegistry,
      logger: buildLogger(),
      now: () => new Date(),
    });
    await server.start(0);
    server.registerTools(ROLE_ID, [makeTool("skill.ghost")]);

    const body = {
      roleId: ROLE_ID,
      jobId: "j",
      toolId: "skill.ghost",
      params: {},
      requestId: "r",
    };
    const res = await postInvoke(
      server.actualPort!,
      body,
      signedHeaders(JSON.stringify(body), new Date()),
    );

    expect(res.status).toBe(200);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toBe("skill_not_found");
  });

  it("returns success and payload when skill handle.invoke resolves", async () => {
    const skillRegistry: SkillRegistryDependency = {
      async loadForRole({ skillId, roleId }) {
        return {
          skillId,
          roleId,
          loadedAt: new Date().toISOString(),
          async invoke(input: unknown) {
            return { echoed: input };
          },
        };
      },
    };
    server = createToolProxyServer({
      hmacSecret: HMAC_SECRET,
      skillRegistry,
      logger: buildLogger(),
      now: () => new Date(),
    });
    await server.start(0);
    server.registerTools(ROLE_ID, [makeTool("skill.echo")]);

    const body = {
      roleId: ROLE_ID,
      jobId: "j",
      toolId: "skill.echo",
      params: { ping: 1 },
      requestId: "r",
    };
    const res = await postInvoke(
      server.actualPort!,
      body,
      signedHeaders(JSON.stringify(body), new Date()),
    );

    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.result).toEqual({ echoed: { ping: 1 } });
  });

  it("captures skill handle.invoke error as success=false", async () => {
    const skillRegistry: SkillRegistryDependency = {
      async loadForRole({ skillId, roleId }) {
        return {
          skillId,
          roleId,
          loadedAt: new Date().toISOString(),
          async invoke() {
            throw new Error("boom");
          },
        };
      },
    };
    server = createToolProxyServer({
      hmacSecret: HMAC_SECRET,
      skillRegistry,
      logger: buildLogger(),
      now: () => new Date(),
    });
    await server.start(0);
    server.registerTools(ROLE_ID, [makeTool("skill.broken")]);

    const body = {
      roleId: ROLE_ID,
      jobId: "j",
      toolId: "skill.broken",
      params: {},
      requestId: "r",
    };
    const res = await postInvoke(
      server.actualPort!,
      body,
      signedHeaders(JSON.stringify(body), new Date()),
    );

    expect(res.status).toBe(200);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toBe("boom");
  });

  it("returns aigc_invoker_not_available when aigc.* is invoked without invoker", async () => {
    await server.start(0);
    server.registerTools(ROLE_ID, [makeTool("aigc.summarize")]);

    const body = {
      roleId: ROLE_ID,
      jobId: "j",
      toolId: "aigc.summarize",
      params: {},
      requestId: "r",
    };
    const res = await postInvoke(
      server.actualPort!,
      body,
      signedHeaders(JSON.stringify(body), new Date()),
    );

    expect(res.status).toBe(200);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toBe("aigc_invoker_not_available");
  });

  it("routes aigc.* via aigcNodeInvoker", async () => {
    const invoker: AigcNodeInvokerFn = async (nodeId, input) => ({
      success: true,
      result: { nodeId, input },
    });
    server = createToolProxyServer({
      hmacSecret: HMAC_SECRET,
      aigcNodeInvoker: invoker,
      logger: buildLogger(),
      now: () => new Date(),
    });
    await server.start(0);
    server.registerTools(ROLE_ID, [makeTool("aigc.summarize")]);

    const body = {
      roleId: ROLE_ID,
      jobId: "j",
      toolId: "aigc.summarize",
      params: { text: "hello" },
      requestId: "r",
    };
    const res = await postInvoke(
      server.actualPort!,
      body,
      signedHeaders(JSON.stringify(body), new Date()),
    );

    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.result).toEqual({
      nodeId: "summarize",
      input: { text: "hello" },
    });
  });

  it("rejects builtin.* with builtin_tools_must_not_go_through_proxy", async () => {
    await server.start(0);
    server.registerTools(ROLE_ID, [makeTool("builtin.finish")]);

    const body = {
      roleId: ROLE_ID,
      jobId: "j",
      toolId: "builtin.finish",
      params: {},
      requestId: "r",
    };
    const res = await postInvoke(
      server.actualPort!,
      body,
      signedHeaders(JSON.stringify(body), new Date()),
    );

    expect(res.status).toBe(200);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toBe("builtin_tools_must_not_go_through_proxy");
  });

  it("rejects unknown tool category prefix with unknown_tool_category", async () => {
    await server.start(0);
    // 注册一个没有 "." 分隔的工具，逼 routeInvocation 走 unknown 分支。
    const weirdTool: AgentToolDefinition = {
      id: "weirdtool",
      name: "weirdtool",
      description: "no prefix",
      category: "builtin",
      inputSchema: {},
      requiresProxy: false,
      timeoutMs: 1000,
    };
    server.registerTools(ROLE_ID, [weirdTool]);

    const body = {
      roleId: ROLE_ID,
      jobId: "j",
      toolId: "weirdtool",
      params: {},
      requestId: "r",
    };
    const res = await postInvoke(
      server.actualPort!,
      body,
      signedHeaders(JSON.stringify(body), new Date()),
    );

    expect(res.status).toBe(200);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toBe("unknown_tool_category");
  });

  it("returns timeout_after_<ms>ms when tool invocation exceeds timeoutMs", async () => {
    // skill invoker 永不 resolve；依赖 server 侧的 timeoutMs 来兜底。
    const skillRegistry: SkillRegistryDependency = {
      async loadForRole({ skillId, roleId }) {
        return {
          skillId,
          roleId,
          loadedAt: new Date().toISOString(),
          async invoke() {
            // 故意 hang。
            return new Promise<never>(() => {});
          },
        };
      },
    };
    server = createToolProxyServer({
      hmacSecret: HMAC_SECRET,
      skillRegistry,
      logger: buildLogger(),
      now: () => new Date(),
    });
    await server.start(0);
    server.registerTools(ROLE_ID, [makeTool("skill.slow", 50)]);

    const body = {
      roleId: ROLE_ID,
      jobId: "j",
      toolId: "skill.slow",
      params: {},
      requestId: "r",
    };
    const res = await postInvoke(
      server.actualPort!,
      body,
      signedHeaders(JSON.stringify(body), new Date()),
    );

    expect(res.status).toBe(200);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toMatch(/^timeout_after_\d+ms$/);
  });

  it("shutdown closes the server and new connections fail", async () => {
    await server.start(0);
    server.registerTools(ROLE_ID, [makeTool("skill.echo")]);
    const port = server.actualPort!;
    expect(port).toBeGreaterThan(0);

    await server.shutdown();
    expect(server.actualPort).toBeUndefined();

    await expect(
      fetch(`http://127.0.0.1:${port}/tools/invoke`, { method: "POST" }),
    ).rejects.toBeDefined();
  });

  it("returns 404 when request path is not /tools/invoke", async () => {
    await server.start(0);

    const response = await fetch(`http://127.0.0.1:${server.actualPort}/other`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toBe("not_found");
  });

  it("returns 405 when method is not POST", async () => {
    await server.start(0);

    const response = await fetch(
      `http://127.0.0.1:${server.actualPort}/tools/invoke`,
      { method: "GET" },
    );
    expect(response.status).toBe(405);
  });
});
