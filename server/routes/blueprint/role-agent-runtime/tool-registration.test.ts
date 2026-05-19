/**
 * `autopilot-role-autonomous-agent` spec Task 3.5：工具注册协议单测。
 *
 * 覆盖：
 * - 空 ctx 下只输出两个 builtin。
 * - 仅 MCP / 仅 Skill / 仅 AIGC 场景的字段、category 与 timeout。
 * - 混合场景下 `mcp → skill → aigc → builtin` 的输出顺序与总数。
 * - 每个 tool 的 7 个必填字段都有值。
 * - `requiresProxy` 语义：mcp / skill / aigc_node 全部 true；builtin 全部 false。
 * - `finish` / `think` 内置工具的 id / 超时。
 *
 * 禁止 PBT（`req 8.5 / 11.5`）：仅 example-based。
 */

import { describe, expect, it } from "vitest";

import type { AgentToolDefinition } from "../../../../shared/blueprint/agent-tool.js";
import type { RoleRuntimeContext } from "../role-container-loader/loader.js";

import { buildToolDefinitions } from "./tool-registration.js";

/**
 * 构造一个最小 {@link RoleRuntimeContext}：buildToolDefinitions 只消费三个
 * `list()` 方法，其余字段用 `as unknown as RoleRuntimeContext` 省略。
 */
function createMinimalRoleCtx(opts: {
  mcp?: string[];
  skill?: string[];
  aigc?: string[];
}): RoleRuntimeContext {
  const mcpIds = opts.mcp ?? [];
  const skillIds = opts.skill ?? [];
  const aigcIds = opts.aigc ?? [];
  return {
    mcp: { list: () => mcpIds },
    skill: { list: () => skillIds },
    aigcNode: { list: () => aigcIds },
  } as unknown as RoleRuntimeContext;
}

/** 断言一个 tool definition 的 7 个必填字段都 non-empty。 */
function expectRequiredFields(tool: AgentToolDefinition): void {
  expect(typeof tool.id).toBe("string");
  expect(tool.id.length).toBeGreaterThan(0);
  expect(typeof tool.name).toBe("string");
  expect(tool.name.length).toBeGreaterThan(0);
  expect(typeof tool.description).toBe("string");
  expect(tool.description.length).toBeGreaterThan(0);
  expect(["mcp", "skill", "aigc_node", "builtin"]).toContain(tool.category);
  expect(tool.inputSchema).toBeDefined();
  expect(typeof tool.inputSchema).toBe("object");
  expect(typeof tool.requiresProxy).toBe("boolean");
  expect(typeof tool.timeoutMs).toBe("number");
  expect(Number.isFinite(tool.timeoutMs)).toBe(true);
  expect(tool.timeoutMs).toBeGreaterThan(0);
}

describe("buildToolDefinitions", () => {
  it("returns only the two builtin tools when the role has no bindings", () => {
    const tools = buildToolDefinitions(createMinimalRoleCtx({}));
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.id)).toEqual(["builtin.finish", "builtin.think"]);
    for (const tool of tools) {
      expect(tool.category).toBe("builtin");
      expectRequiredFields(tool);
    }
  });

  it("produces MCP tool definitions with category 'mcp' and 30s timeout", () => {
    const tools = buildToolDefinitions(
      createMinimalRoleCtx({ mcp: ["server-a", "server-b"] }),
    );
    // 2 MCP + 2 builtin
    expect(tools).toHaveLength(4);
    const mcpTools = tools.filter((t) => t.category === "mcp");
    expect(mcpTools).toHaveLength(2);
    expect(mcpTools.map((t) => t.id)).toEqual(["mcp.server-a", "mcp.server-b"]);
    expect(mcpTools.map((t) => t.name)).toEqual(["mcp_server-a", "mcp_server-b"]);
    for (const tool of mcpTools) {
      expect(tool.timeoutMs).toBe(30_000);
      expect(tool.requiresProxy).toBe(true);
      expectRequiredFields(tool);
    }
  });

  it("produces Skill tool definitions with category 'skill' and 60s timeout", () => {
    const tools = buildToolDefinitions(
      createMinimalRoleCtx({ skill: ["code_review", "summarize"] }),
    );
    expect(tools).toHaveLength(4);
    const skillTools = tools.filter((t) => t.category === "skill");
    expect(skillTools).toHaveLength(2);
    expect(skillTools.map((t) => t.id)).toEqual([
      "skill.code_review",
      "skill.summarize",
    ]);
    expect(skillTools.map((t) => t.name)).toEqual([
      "skill_code_review",
      "skill_summarize",
    ]);
    for (const tool of skillTools) {
      expect(tool.timeoutMs).toBe(60_000);
      expect(tool.requiresProxy).toBe(true);
      expectRequiredFields(tool);
    }
  });

  it("produces AIGC node tool definitions with category 'aigc_node' and 120s timeout", () => {
    const tools = buildToolDefinitions(
      createMinimalRoleCtx({ aigc: ["slide_generator"] }),
    );
    expect(tools).toHaveLength(3);
    const aigcTools = tools.filter((t) => t.category === "aigc_node");
    expect(aigcTools).toHaveLength(1);
    expect(aigcTools[0]?.id).toBe("aigc.slide_generator");
    expect(aigcTools[0]?.name).toBe("aigc_slide_generator");
    expect(aigcTools[0]?.timeoutMs).toBe(120_000);
    expect(aigcTools[0]?.requiresProxy).toBe(true);
    expectRequiredFields(aigcTools[0]!);
  });

  it("emits tools in order mcp → skill → aigc → builtin and respects total count", () => {
    const mcp = ["m1", "m2"];
    const skill = ["s1", "s2", "s3"];
    const aigc = ["a1"];
    const tools = buildToolDefinitions(createMinimalRoleCtx({ mcp, skill, aigc }));

    // N + M + K + 2 = 2 + 3 + 1 + 2 = 8
    expect(tools).toHaveLength(mcp.length + skill.length + aigc.length + 2);

    const categories = tools.map((t) => t.category);
    expect(categories).toEqual([
      "mcp",
      "mcp",
      "skill",
      "skill",
      "skill",
      "aigc_node",
      "builtin",
      "builtin",
    ]);

    const ids = tools.map((t) => t.id);
    expect(ids).toEqual([
      "mcp.m1",
      "mcp.m2",
      "skill.s1",
      "skill.s2",
      "skill.s3",
      "aigc.a1",
      "builtin.finish",
      "builtin.think",
    ]);
  });

  it("always includes both builtin tools with correct id, timeout, and requiresProxy=false", () => {
    const tools = buildToolDefinitions(
      createMinimalRoleCtx({ mcp: ["m"], skill: ["s"], aigc: ["a"] }),
    );

    const finish = tools.find((t) => t.id === "builtin.finish");
    expect(finish).toBeDefined();
    expect(finish?.name).toBe("finish");
    expect(finish?.category).toBe("builtin");
    expect(finish?.requiresProxy).toBe(false);
    expect(finish?.timeoutMs).toBe(1_000);
    expect(finish?.inputSchema).toMatchObject({
      type: "object",
      required: ["output"],
    });

    const think = tools.find((t) => t.id === "builtin.think");
    expect(think).toBeDefined();
    expect(think?.name).toBe("think");
    expect(think?.category).toBe("builtin");
    expect(think?.requiresProxy).toBe(false);
    expect(think?.timeoutMs).toBe(1_000);
    expect(think?.inputSchema).toMatchObject({
      type: "object",
      required: ["thought"],
    });
  });

  it("populates all required fields on every tool definition", () => {
    const tools = buildToolDefinitions(
      createMinimalRoleCtx({
        mcp: ["m-x"],
        skill: ["s-x"],
        aigc: ["a-x"],
      }),
    );
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expectRequiredFields(tool);
    }
  });

  it("sets requiresProxy=true for mcp/skill/aigc and false for builtin", () => {
    const tools = buildToolDefinitions(
      createMinimalRoleCtx({ mcp: ["m"], skill: ["s"], aigc: ["a"] }),
    );
    for (const tool of tools) {
      if (tool.category === "builtin") {
        expect(tool.requiresProxy).toBe(false);
      } else {
        expect(tool.requiresProxy).toBe(true);
      }
    }
  });

  it("preserves duplicate ids emitted by the underlying list() (no dedupe responsibility)", () => {
    // 如果 loader 本身在 list() 中返回重复项，buildToolDefinitions 不应吞掉重复。
    const tools = buildToolDefinitions(
      createMinimalRoleCtx({ mcp: ["dup", "dup"] }),
    );
    // 2 MCP (含重复) + 2 builtin = 4
    expect(tools).toHaveLength(4);
    const mcpTools = tools.filter((t) => t.category === "mcp");
    expect(mcpTools).toHaveLength(2);
    expect(mcpTools.every((t) => t.id === "mcp.dup")).toBe(true);
  });
});
