import { describe, expect, it, vi } from "vitest";

import type {
  McpToolExecutionRequest,
  McpToolExecutionResult,
} from "../../../tool/api/mcp-tool-adapter.js";
import type { McpToolAdapterDependency } from "../context.js";

import {
  bindRoleMcps,
  createInitialBindingReport,
} from "./mcp-binder.js";

/**
 * Co-located 单元测试（Task 5.5）。
 */

function buildLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function buildAdapter(
  handler: (req: McpToolExecutionRequest) => Promise<McpToolExecutionResult>,
): McpToolAdapterDependency {
  return { execute: handler };
}

function okResult(serverId: string): McpToolExecutionResult {
  return {
    ok: true,
    status: "completed",
    targetLabel: serverId,
    operation: "meta.ping",
    resource: `mcp://${serverId}`,
    output: "pong",
    response: { ok: true },
    governance: {
      approval: { required: false, status: "not_required", source: "none" },
    },
    metadata: {
      serverId,
      toolName: "meta.ping",
      timeoutMs: 5_000,
      fallbackUsed: false,
    },
  };
}

function failResult(serverId: string, reason: string): McpToolExecutionResult {
  return {
    ok: false,
    status: "failed",
    targetLabel: serverId,
    operation: "meta.ping",
    resource: `mcp://${serverId}`,
    output: "",
    response: null,
    error: reason,
    governance: {
      approval: { required: false, status: "not_required", source: "none" },
    },
    metadata: {
      serverId,
      toolName: "meta.ping",
      timeoutMs: 5_000,
      fallbackUsed: false,
    },
  };
}

describe("bindRoleMcps", () => {
  it("(a) 正常绑定 2 项", async () => {
    const adapter = buildAdapter(async (req) => okResult(req.serverId));
    const report = createInitialBindingReport();
    const now = () => new Date("2026-05-12T00:00:00.000Z");

    const result = await bindRoleMcps(
      ["github", "search"],
      adapter,
      report,
      buildLogger(),
      now,
    );

    expect(result.size).toBe(2);
    expect(result.get("github")?.serverId).toBe("github");
    expect(result.get("github")?.createdAt).toBe("2026-05-12T00:00:00.000Z");
    expect(report.skippedMcps).toHaveLength(0);
    expect(report.boundMcps).toEqual(["github", "search"]);
  });

  it("(b) 单项 probe 失败跳过，其它正常", async () => {
    const adapter = buildAdapter(async (req) =>
      req.serverId === "broken"
        ? failResult(req.serverId, "server_unavailable")
        : okResult(req.serverId),
    );
    const report = createInitialBindingReport();
    const logger = buildLogger();

    const result = await bindRoleMcps(
      ["github", "broken", "search"],
      adapter,
      report,
      logger,
      () => new Date(),
    );

    expect([...result.keys()]).toEqual(["github", "search"]);
    expect(report.skippedMcps).toEqual([
      { id: "broken", reason: "server_unavailable" },
    ]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("(c) mcpToolAdapter === undefined 时全部跳过", async () => {
    const report = createInitialBindingReport();
    const result = await bindRoleMcps(
      ["a", "b"],
      undefined,
      report,
      buildLogger(),
      () => new Date(),
    );

    expect(result.size).toBe(0);
    expect(report.skippedMcps).toEqual([
      { id: "a", reason: "mcpToolAdapter missing" },
      { id: "b", reason: "mcpToolAdapter missing" },
    ]);
  });

  it("(d) probe throw 不传播，计入跳过", async () => {
    const adapter = buildAdapter(async () => {
      throw new Error("network reset");
    });
    const report = createInitialBindingReport();
    const logger = buildLogger();

    const result = await bindRoleMcps(
      ["github"],
      adapter,
      report,
      logger,
      () => new Date(),
    );

    expect(result.size).toBe(0);
    expect(report.skippedMcps).toEqual([
      { id: "github", reason: "network reset" },
    ]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("(e) 空列表返回空 map", async () => {
    const adapter = buildAdapter(async () => okResult("anything"));
    const report = createInitialBindingReport();

    const result = await bindRoleMcps(
      [],
      adapter,
      report,
      buildLogger(),
      () => new Date(),
    );

    expect(result.size).toBe(0);
    expect(report.skippedMcps).toHaveLength(0);
  });
});
