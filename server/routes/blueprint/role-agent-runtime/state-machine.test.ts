/**
 * `autopilot-role-autonomous-agent` spec Task 2.10：
 * AgentLoopStateMachine 单测，覆盖状态转换 / 预算 / abort / trace 累积。
 */

import { describe, expect, it, vi } from "vitest";

import type { AgentJobInput } from "../../../../shared/blueprint/agent-job.js";
import type { AgentBudget } from "../../../../shared/blueprint/agent-budget.js";
import type { AgentProgressEvent } from "../../../../shared/blueprint/agent-events.js";
import type { AgentToolDefinition } from "../../../../shared/blueprint/agent-tool.js";

import { AgentLoopStateMachine } from "./state-machine.js";
import type { LlmCallFn, LlmCallOutput } from "./llm-call.js";
import type { ToolInvoker, ToolInvokeResult } from "./tool-proxy-client.js";
import type { ProgressEmitter } from "./progress-emitter.js";

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
  ];
}

function buildBudget(overrides: Partial<AgentBudget> = {}): AgentBudget {
  return {
    maxIterations: 20,
    maxTokens: 100_000,
    timeoutMs: 300_000,
    toolTimeoutMs: 60_000,
    allowParallelTools: false,
    ...overrides,
  };
}

function buildInput(overrides: Partial<AgentJobInput> = {}): AgentJobInput {
  return {
    jobId: "job-1",
    roleId: "planner",
    stageId: "routes",
    goal: "plan a repo",
    systemPrompt: "you are planner",
    tools: buildTools(),
    budget: buildBudget(),
    context: { repo: "x" },
    callbackUrl: "http://host/cb",
    callbackSecret: "s",
    ...overrides,
  };
}

function buildRecordingEmitter(): ProgressEmitter & { events: AgentProgressEvent[] } {
  const events: AgentProgressEvent[] = [];
  return {
    events,
    emit(event) {
      events.push(event);
    },
  };
}

/** 构造一个可序列化返回值的 llmCall stub。 */
function scriptedLlmCall(responses: LlmCallOutput[]): LlmCallFn {
  let index = 0;
  return async () => {
    if (index >= responses.length) {
      // 防御：测试中不应多调。
      throw new Error("scriptedLlmCall: out of responses");
    }
    return responses[index++]!;
  };
}

function scriptedToolInvoker(results: ToolInvokeResult[]): ToolInvoker {
  let index = 0;
  return {
    async invoke() {
      if (index >= results.length) {
        throw new Error("scriptedToolInvoker: out of results");
      }
      return results[index++]!;
    },
  };
}

/** 人工推进虚拟时间的时钟。 */
function buildAdvanceableClock(startMs: number) {
  let current = startMs;
  return {
    now: () => new Date(current),
    advance(ms: number) {
      current += ms;
    },
  };
}

describe("AgentLoopStateMachine", () => {
  it("idle → thinking → acting → observing → thinking → completed full path", async () => {
    const clock = buildAdvanceableClock(1_000);
    const llmCall = scriptedLlmCall([
      {
        type: "action",
        action: { toolId: "mcp.github.clone", params: { url: "x" } },
        thought: "need repo",
        tokensUsed: 100,
      },
      {
        type: "finish",
        output: { routes: ["r1"] },
        thought: "ready",
        tokensUsed: 50,
      },
    ]);
    const toolInvoker = scriptedToolInvoker([
      { success: true, result: { ok: true }, durationMs: 42 },
    ]);
    const emitter = buildRecordingEmitter();
    const machine = new AgentLoopStateMachine(buildInput(), {
      llmCall,
      toolInvoker,
      progressEmitter: emitter,
      logger: buildLogger(),
      now: clock.now,
    });

    const output = await machine.run();

    expect(output.status).toBe("completed");
    expect(output.output).toEqual({ routes: ["r1"] });
    expect(output.iterations).toBe(2);
    expect(output.totalTokens).toBe(150);
    // trace: 第一轮 observing + 第二轮 thinking(finish)
    expect(output.trace).toHaveLength(2);
    expect(output.trace[0]?.phase).toBe("observing");
    expect(output.trace[0]?.observation?.toolId).toBe("mcp.github.clone");
    expect(output.trace[1]?.phase).toBe("thinking");
    expect(output.trace[1]?.thought).toBe("ready");

    const eventTypes = emitter.events.map((event) => event.type);
    expect(eventTypes).toContain("agent.started");
    expect(eventTypes).toContain("agent.thinking");
    expect(eventTypes).toContain("agent.acting");
    expect(eventTypes).toContain("agent.observing");
    expect(eventTypes).toContain("agent.iteration_completed");
    expect(eventTypes).toContain("agent.completed");
  });

  it("LLM returning finish immediately transitions idle → thinking → completed", async () => {
    const clock = buildAdvanceableClock(0);
    const llmCall = scriptedLlmCall([
      { type: "finish", output: { ok: true }, thought: "done", tokensUsed: 10 },
    ]);
    const toolInvoker = scriptedToolInvoker([]);
    const emitter = buildRecordingEmitter();

    const machine = new AgentLoopStateMachine(buildInput(), {
      llmCall,
      toolInvoker,
      progressEmitter: emitter,
      logger: buildLogger(),
      now: clock.now,
    });

    const output = await machine.run();

    expect(output.status).toBe("completed");
    expect(output.iterations).toBe(1);
    expect(output.trace).toHaveLength(1);
    expect(output.trace[0]?.phase).toBe("thinking");
  });

  it("passes context llmMaxTokens to each LLM thinking call", async () => {
    const clock = buildAdvanceableClock(1_000);
    const llmCall = vi.fn(async (): Promise<LlmCallOutput> => ({
      type: "finish",
      output: { ok: true },
      thought: "done",
      tokensUsed: 10,
    }));

    const machine = new AgentLoopStateMachine(
      buildInput({
        context: { repo: "x", llmMaxTokens: 16_000 },
      }),
      {
        llmCall,
        toolInvoker: scriptedToolInvoker([]),
        progressEmitter: buildRecordingEmitter(),
        logger: buildLogger(),
        now: clock.now,
      },
    );

    await machine.run();

    expect(llmCall).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 16_000 }),
    );
  });

  it("passes context llmAcceptDirectOutput to each LLM thinking call", async () => {
    const clock = buildAdvanceableClock(1_000);
    const llmCall = vi.fn(async (): Promise<LlmCallOutput> => ({
      type: "finish",
      output: { ok: true },
      tokensUsed: 10,
    }));

    const machine = new AgentLoopStateMachine(
      buildInput({
        context: { repo: "x", llmAcceptDirectOutput: true },
      }),
      {
        llmCall,
        toolInvoker: scriptedToolInvoker([]),
        progressEmitter: buildRecordingEmitter(),
        logger: buildLogger(),
        now: clock.now,
      },
    );

    await machine.run();

    expect(llmCall).toHaveBeenCalledWith(
      expect.objectContaining({ acceptDirectOutput: true }),
    );
  });

  it("LLM returning error transitions to failed with the error reason", async () => {
    const clock = buildAdvanceableClock(0);
    const llmCall = scriptedLlmCall([
      { type: "error", error: "llm_boom", tokensUsed: 5 },
    ]);
    const emitter = buildRecordingEmitter();

    const machine = new AgentLoopStateMachine(buildInput(), {
      llmCall,
      toolInvoker: { invoke: vi.fn() },
      progressEmitter: emitter,
      logger: buildLogger(),
      now: clock.now,
    });

    const output = await machine.run();
    expect(output.status).toBe("failed");
    expect(output.error).toBe("llm_boom");
    expect(output.trace).toHaveLength(1);
    expect(output.trace[0]?.error).toBe("llm_boom");
    const failedEvent = emitter.events.find((event) => event.type === "agent.failed");
    expect(failedEvent?.error).toBe("llm_boom");
  });

  it("exceeding maxIterations stops the loop with budget_iterations_exceeded", async () => {
    const clock = buildAdvanceableClock(0);
    // 每轮都返回 action，保证不自己结束；状态机会在 iteration >= max 时退出。
    const llmCall: LlmCallFn = async () => ({
      type: "action",
      action: { toolId: "mcp.github.clone", params: {} },
      tokensUsed: 0,
    });
    const toolInvoker: ToolInvoker = {
      async invoke() {
        return { success: true, result: null, durationMs: 1 };
      },
    };
    const emitter = buildRecordingEmitter();

    const machine = new AgentLoopStateMachine(
      buildInput({ budget: buildBudget({ maxIterations: 2 }) }),
      {
        llmCall,
        toolInvoker,
        progressEmitter: emitter,
        logger: buildLogger(),
        now: clock.now,
      },
    );

    const output = await machine.run();
    expect(output.status).toBe("failed");
    expect(output.error).toBe("budget_iterations_exceeded");
    expect(output.iterations).toBe(2);
  });

  it("exceeding maxTokens stops the loop with budget_tokens_exceeded", async () => {
    const clock = buildAdvanceableClock(0);
    const llmCall: LlmCallFn = async () => ({
      type: "action",
      action: { toolId: "mcp.github.clone", params: {} },
      tokensUsed: 500, // 每轮 +500
    });
    const toolInvoker: ToolInvoker = {
      async invoke() {
        return { success: true, result: null, durationMs: 1 };
      },
    };
    const emitter = buildRecordingEmitter();

    const machine = new AgentLoopStateMachine(
      buildInput({
        budget: buildBudget({ maxIterations: 50, maxTokens: 600 }),
      }),
      {
        llmCall,
        toolInvoker,
        progressEmitter: emitter,
        logger: buildLogger(),
        now: clock.now,
      },
    );

    const output = await machine.run();
    expect(output.status).toBe("failed");
    expect(output.error).toBe("budget_tokens_exceeded");
  });

  it("exceeding timeoutMs stops the loop with budget_timeout_exceeded", async () => {
    const clock = buildAdvanceableClock(0);
    const llmCall: LlmCallFn = async () => {
      // 每轮推进 60s。
      clock.advance(60_000);
      return {
        type: "action",
        action: { toolId: "mcp.github.clone", params: {} },
        tokensUsed: 0,
      };
    };
    const toolInvoker: ToolInvoker = {
      async invoke() {
        return { success: true, result: null, durationMs: 0 };
      },
    };
    const emitter = buildRecordingEmitter();

    const machine = new AgentLoopStateMachine(
      buildInput({
        budget: buildBudget({
          maxIterations: 50,
          maxTokens: 1_000_000,
          timeoutMs: 120_000,
        }),
      }),
      {
        llmCall,
        toolInvoker,
        progressEmitter: emitter,
        logger: buildLogger(),
        now: clock.now,
      },
    );

    const output = await machine.run();
    expect(output.status).toBe("failed");
    expect(output.error).toBe("budget_timeout_exceeded");
  });

  it("abort(reason) terminates the loop with aborted status on next iteration", async () => {
    const clock = buildAdvanceableClock(0);
    let machineRef: AgentLoopStateMachine | undefined;
    const llmCall: LlmCallFn = async () => {
      // 在第一轮 LLM 调用时主动 abort；下一轮循环检查即退出。
      machineRef?.abort("user_cancel");
      return {
        type: "action",
        action: { toolId: "mcp.github.clone", params: {} },
        tokensUsed: 0,
      };
    };
    const toolInvoker: ToolInvoker = {
      async invoke() {
        return { success: true, result: null, durationMs: 0 };
      },
    };
    const emitter = buildRecordingEmitter();

    const machine = new AgentLoopStateMachine(buildInput(), {
      llmCall,
      toolInvoker,
      progressEmitter: emitter,
      logger: buildLogger(),
      now: clock.now,
    });
    machineRef = machine;

    const output = await machine.run();
    expect(output.status).toBe("aborted");
    expect(output.error).toBe("user_cancel");
    expect(
      emitter.events.some((event) => event.type === "agent.aborted"),
    ).toBe(true);
  });

  it("accumulates trace history across iterations including observation payloads", async () => {
    const clock = buildAdvanceableClock(0);
    const llmCall = scriptedLlmCall([
      {
        type: "action",
        action: { toolId: "mcp.github.clone", params: { n: 1 } },
        thought: "t1",
        tokensUsed: 10,
      },
      {
        type: "action",
        action: { toolId: "mcp.github.clone", params: { n: 2 } },
        thought: "t2",
        tokensUsed: 10,
      },
      { type: "finish", output: "done", thought: "t3", tokensUsed: 5 },
    ]);
    const toolInvoker = scriptedToolInvoker([
      { success: true, result: "r1", durationMs: 10 },
      { success: false, error: "tool_broken", durationMs: 20 },
    ]);
    const emitter = buildRecordingEmitter();

    const machine = new AgentLoopStateMachine(buildInput(), {
      llmCall,
      toolInvoker,
      progressEmitter: emitter,
      logger: buildLogger(),
      now: clock.now,
    });

    const output = await machine.run();
    expect(output.status).toBe("completed");
    // trace 应该是：observing(r1) → observing(tool_broken) → thinking(finish)
    expect(output.trace).toHaveLength(3);
    expect(output.trace[0]?.phase).toBe("observing");
    expect(output.trace[0]?.observation?.result).toBe("r1");
    expect(output.trace[1]?.phase).toBe("observing");
    expect(output.trace[1]?.observation?.result).toBe("tool_broken");
    expect(output.trace[1]?.error).toBe("tool_broken");
    expect(output.trace[2]?.phase).toBe("thinking");
  });

  it("getState returns a deep copy that cannot mutate internal state", async () => {
    const clock = buildAdvanceableClock(0);
    const machine = new AgentLoopStateMachine(buildInput(), {
      llmCall: async () => ({ type: "finish", output: null, tokensUsed: 0 }),
      toolInvoker: { invoke: vi.fn() },
      progressEmitter: buildRecordingEmitter(),
      logger: buildLogger(),
      now: clock.now,
    });
    const snapshot = machine.getState();
    snapshot.history.push({
      iteration: 999,
      phase: "acting",
      timestamp: "2026",
      tokensUsed: 0,
    });
    const snapshot2 = machine.getState();
    expect(snapshot2.history).toHaveLength(0);
  });
});
