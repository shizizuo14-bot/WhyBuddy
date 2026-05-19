/**
 * `autopilot-role-autonomous-agent` spec Task 2.10：LLM 调用封装单测。
 *
 * 覆盖：
 * - LLM 返回 `tool_call: {tool_id, params}` → 解析为 action。
 * - LLM 返回 `finish: {output}` → 解析为 finish。
 * - LLM 返回 `tool_call.tool_id = builtin.finish` → 归一为 finish。
 * - LLM 返回 `error: "..."` → 解析为 error。
 * - 第一次响应非法、第二次合法 → 返回第二次结果。
 * - 两次都失败 → 返回 `{ type: "error" }`（不抛错）。
 * - tool_id 不在工具集里 → 触发重试 / 最终 error。
 */

import { describe, expect, it, vi } from "vitest";

import type { AgentToolDefinition } from "../../../../shared/blueprint/agent-tool.js";

import { createLlmCall } from "./llm-call.js";

function buildLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function buildTools(): AgentToolDefinition[] {
  return [
    {
      id: "mcp.github.clone",
      name: "clone",
      description: "Clone repo",
      category: "mcp",
      inputSchema: { type: "object" },
      requiresProxy: true,
      timeoutMs: 30_000,
    },
    {
      id: "skill.summarize",
      name: "summarize",
      description: "Summarize",
      category: "skill",
      inputSchema: { type: "object" },
      requiresProxy: true,
      timeoutMs: 10_000,
    },
  ];
}

describe("createLlmCall", () => {
  it("parses finish response", async () => {
    const llm = {
      callJson: vi.fn(async () => ({
        thought: "done",
        finish: { output: { routes: [] } },
      })),
      getConfig: vi.fn(() => ({} as unknown as ReturnType<typeof vi.fn>)) as never,
    };
    const llmCall = createLlmCall({ llm: llm as never, logger: buildLogger() });
    const result = await llmCall({
      systemPrompt: "you are planner",
      history: [],
      context: {},
      tools: buildTools(),
    });
    expect(result.type).toBe("finish");
    if (result.type === "finish") {
      expect(result.output).toEqual({ routes: [] });
      expect(result.thought).toBe("done");
    }
    expect(llm.callJson).toHaveBeenCalledTimes(1);
  });

  it("parses action response (tool_call)", async () => {
    const llm = {
      callJson: vi.fn(async () => ({
        thought: "need repo",
        tool_call: { tool_id: "mcp.github.clone", params: { url: "x" } },
      })),
      getConfig: vi.fn(),
    };
    const llmCall = createLlmCall({ llm: llm as never, logger: buildLogger() });
    const result = await llmCall({
      systemPrompt: "p",
      history: [],
      context: { repo: "x" },
      tools: buildTools(),
    });
    expect(result.type).toBe("action");
    if (result.type === "action") {
      expect(result.action.toolId).toBe("mcp.github.clone");
      expect(result.action.params).toEqual({ url: "x" });
    }
  });

  it("normalizes builtin.finish tool_call into finish type", async () => {
    const llm = {
      callJson: vi.fn(async () => ({
        tool_call: {
          tool_id: "builtin.finish",
          params: { output: { ok: true } },
        },
      })),
      getConfig: vi.fn(),
    };
    const llmCall = createLlmCall({ llm: llm as never, logger: buildLogger() });
    const result = await llmCall({
      systemPrompt: "p",
      history: [],
      context: {},
      tools: buildTools(),
    });
    expect(result.type).toBe("finish");
    if (result.type === "finish") {
      expect(result.output).toEqual({ ok: true });
    }
  });

  it("parses explicit error response", async () => {
    const llm = {
      callJson: vi.fn(async () => ({ error: "llm_refused_task" })),
      getConfig: vi.fn(),
    };
    const llmCall = createLlmCall({ llm: llm as never, logger: buildLogger() });
    const result = await llmCall({
      systemPrompt: "p",
      history: [],
      context: {},
      tools: buildTools(),
    });
    expect(result.type).toBe("error");
    if (result.type === "error") {
      expect(result.error).toBe("llm_refused_task");
    }
  });

  it("retries once when first response is unrecognized and succeeds", async () => {
    const callJson = vi
      .fn()
      .mockResolvedValueOnce({ completely: "wrong" })
      .mockResolvedValueOnce({
        tool_call: { tool_id: "skill.summarize", params: {} },
      });
    const llm = { callJson, getConfig: vi.fn() };
    const logger = buildLogger();
    const llmCall = createLlmCall({ llm: llm as never, logger });
    const result = await llmCall({
      systemPrompt: "p",
      history: [],
      context: {},
      tools: buildTools(),
    });
    expect(result.type).toBe("action");
    expect(callJson).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("returns error (without throwing) when both attempts fail", async () => {
    const callJson = vi.fn(async () => {
      throw new Error("llm_network");
    });
    const llm = { callJson, getConfig: vi.fn() };
    const logger = buildLogger();
    const llmCall = createLlmCall({ llm: llm as never, logger });
    const result = await llmCall({
      systemPrompt: "p",
      history: [],
      context: {},
      tools: buildTools(),
    });
    expect(result.type).toBe("error");
    if (result.type === "error") {
      expect(result.error).toMatch(/llm_failed/);
    }
    expect(callJson).toHaveBeenCalledTimes(2);
  });

  it("retries and eventually errors when tool_id is not in tool set", async () => {
    const callJson = vi
      .fn()
      .mockResolvedValue({ tool_call: { tool_id: "unknown.tool", params: {} } });
    const llm = { callJson, getConfig: vi.fn() };
    const llmCall = createLlmCall({ llm: llm as never, logger: buildLogger() });
    const result = await llmCall({
      systemPrompt: "p",
      history: [],
      context: {},
      tools: buildTools(),
    });
    expect(result.type).toBe("error");
    if (result.type === "error") {
      expect(result.error).toMatch(/llm_failed/);
    }
    expect(callJson).toHaveBeenCalledTimes(2);
  });
});
