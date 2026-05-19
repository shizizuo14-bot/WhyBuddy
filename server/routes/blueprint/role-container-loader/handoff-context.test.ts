import { describe, expect, it } from "vitest";

import {
  buildStageHandoffContext,
  deriveWarmStartHint,
  type HandoffSourceContext,
} from "./handoff-context.js";

function buildSource(overrides?: Partial<HandoffSourceContext>): HandoffSourceContext {
  return {
    key: {
      roleId: "role-x",
      stageId: "runtime_capability",
      jobId: "job-1",
    },
    capabilitiesInvoked: [
      { capabilityId: "cap-1", invocationId: "inv-1", executionMode: "real" },
    ],
    mcpSessions: [
      { serverId: "github", invocationCount: 3, lastStatus: "ok" },
    ],
    skillHandles: [
      {
        skillId: "architecture",
        invocationCount: 2,
        lastInput: { q: "hello" },
        lastOutput: { a: "world" },
      },
    ],
    aigcNodeResults: [
      { nodeId: "subsystem-decompose", partialFailure: false },
    ],
    ...overrides,
  };
}

describe("buildStageHandoffContext", () => {
  it("(a) 典型 ready ctx 快照字段完整", () => {
    const source = buildSource();
    const handoff = buildStageHandoffContext(
      source,
      () => new Date("2026-05-12T00:00:00.000Z"),
    );
    expect(handoff.key).toEqual(source.key);
    expect(handoff.capabilitiesInvoked).toHaveLength(1);
    expect(handoff.mcpSessions[0]?.serverId).toBe("github");
    expect(handoff.skillHandles[0]?.inputDigest).toMatch(/^[0-9a-f]{16}$/);
    expect(handoff.skillHandles[0]?.outputDigest).toMatch(/^[0-9a-f]{16}$/);
    expect(handoff.warmStartHint).toContain("mcp:github");
    expect(handoff.generatedAt).toBe("2026-05-12T00:00:00.000Z");
  });

  it("(b) 空 bindings 返回空数组且 warmStartHint 为 undefined", () => {
    const handoff = buildStageHandoffContext(
      buildSource({
        capabilitiesInvoked: [],
        mcpSessions: [],
        skillHandles: [],
        aigcNodeResults: [],
      }),
      () => new Date(),
    );
    expect(handoff.capabilitiesInvoked).toEqual([]);
    expect(handoff.mcpSessions).toEqual([]);
    expect(handoff.skillHandles).toEqual([]);
    expect(handoff.aigcNodeResults).toEqual([]);
    expect(handoff.warmStartHint).toBeUndefined();
  });

  it("(c) 深拷贝：修改 handoff 内部字段不影响再次构造", () => {
    const source = buildSource();
    const handoff = buildStageHandoffContext(source, () => new Date());
    // 强制断言 readonly 数组的可写性：运行期 deepClone 结果允许修改，typing
    // 仅约束消费方意图。
    (handoff.mcpSessions as unknown as Array<{ invocationCount: number }>)[0]
      .invocationCount = 999;
    const handoff2 = buildStageHandoffContext(source, () => new Date());
    expect(handoff2.mcpSessions[0]?.invocationCount).toBe(3);
  });

  it("(d) 相同输入产生相同 digest（稳定摘要）", () => {
    const source = buildSource();
    const h1 = buildStageHandoffContext(source, () => new Date());
    const h2 = buildStageHandoffContext(source, () => new Date());
    expect(h1.skillHandles[0]?.inputDigest).toBe(h2.skillHandles[0]?.inputDigest);
    expect(h1.skillHandles[0]?.outputDigest).toBe(h2.skillHandles[0]?.outputDigest);
  });
});

describe("deriveWarmStartHint", () => {
  it("返回调用次数最多的 mcp + skill 提示", () => {
    const source = buildSource({
      mcpSessions: [
        { serverId: "low", invocationCount: 1, lastStatus: "ok" },
        { serverId: "high", invocationCount: 7, lastStatus: "ok" },
      ],
      skillHandles: [
        {
          skillId: "s1",
          invocationCount: 5,
          lastInput: null,
          lastOutput: null,
        },
      ],
    });
    const hint = deriveWarmStartHint(source);
    expect(hint).toContain("mcp:high(7)");
    expect(hint).toContain("skill:s1(5)");
  });

  it("零调用返回 undefined", () => {
    const source = buildSource({
      mcpSessions: [
        { serverId: "x", invocationCount: 0, lastStatus: "ok" },
      ],
      skillHandles: [
        { skillId: "s1", invocationCount: 0, lastInput: null, lastOutput: null },
      ],
    });
    expect(deriveWarmStartHint(source)).toBeUndefined();
  });
});
