import { describe, expect, it, vi } from "vitest";
import type { AgentHandle } from "../../shared/workflow-runtime.js";
import type { SkillBinding, SkillExecutionMetrics } from "../../shared/skill-contracts.js";
import type { WorkflowMcpBinding } from "../../shared/organization-schema.js";
import { AutoAgentExecutor } from "../tool/api/auto-agent-adapter.js";

function makeAgent(
  id: string,
  role: AgentHandle["config"]["role"],
  name = id
): AgentHandle {
  return {
    config: {
      id,
      name,
      department: "engineering",
      role,
      managerId: role === "ceo" ? null : "ceo",
      model: "test-model",
      soulMd: "You are a helpful test agent.",
    },
    invoke: vi.fn(async (prompt: string) => `handled by ${id}: ${prompt}`),
    invokeJson: vi.fn(),
  };
}

describe("AutoAgentExecutor", () => {
  it("executes a resident agent target directly", async () => {
    const resident = makeAgent("agent-1", "worker", "Resident Agent");
    const executor = new AutoAgentExecutor({
      directory: {
        get: (id: string) => (id === resident.config.id ? resident : undefined),
        getCEO: () => resident,
        isGuest: () => false,
      },
      skills: {
        resolveSkills: () => [],
        resolveMcpForSkill: () => [],
      },
      skillMonitor: { recordMetrics: vi.fn() },
    });

    const result = await executor.execute({
      kind: "agent",
      targetId: "agent-1",
      input: "Ship the adapter patch",
      context: ["Prefer a thin integration layer."],
      workflowId: "wf-1",
    });

    expect(result.kind).toBe("agent");
    expect(result.targetId).toBe("agent-1");
    expect(result.delegatedTo.agentId).toBe("agent-1");
    expect(result.output).toContain("handled by agent-1");
    expect(vi.mocked(resident.invoke)).toHaveBeenCalledWith(
      "Ship the adapter patch",
      ["Prefer a thin integration layer."],
      expect.objectContaining({
        workflowId: "wf-1",
        stage: "auto_agent",
      }),
    );
  });

  it("executes a skill via delegate agent and records metrics", async () => {
    const delegate = makeAgent("ceo", "ceo", "CEO");
    const monitorCalls: SkillExecutionMetrics[] = [];
    const mcpBinding: WorkflowMcpBinding = {
      id: "workflow-memory",
      name: "Workflow Memory",
      server: "internal.memory",
      description: "Memory lookup",
      connection: {
        transport: "internal",
        endpoint: "memory://ceo?workflow=wf-1",
      },
      tools: ["recent_memory"],
    };
    const skillBinding: SkillBinding = {
      skillId: "tooling-integration",
      version: "1.0.0",
      resolvedSkill: {
        id: "tooling-integration",
        name: "Tooling Integration",
        category: "code",
        summary: "Reason about tools.",
        prompt: "Given the context: {context}\n\nUse tools carefully.\n\nInput: {input}",
        requiredMcp: ["workflow-memory"],
        version: "1.0.0",
        tags: ["tooling"],
        enabled: true,
        createdAt: "2026-04-22T00:00:00.000Z",
        updatedAt: "2026-04-22T00:00:00.000Z",
      },
      mcpBindings: [],
      enabled: true,
      config: { priority: 10 },
    };

    const executor = new AutoAgentExecutor({
      directory: {
        get: (id: string) => (id === delegate.config.id ? delegate : undefined),
        getCEO: () => delegate,
        isGuest: () => false,
      },
      skills: {
        resolveSkills: () => [skillBinding],
        resolveMcpForSkill: () => [mcpBinding],
      },
      skillMonitor: {
        recordMetrics: (metrics: SkillExecutionMetrics) => {
          monitorCalls.push(metrics);
        },
      },
    });

    const result = await executor.execute({
      kind: "skill",
      targetId: "tooling-integration",
      input: "Design an internal API adapter",
      context: ["We only need the first thin slice."],
      workflowId: "wf-1",
    });

    expect(result.kind).toBe("skill");
    expect(result.delegatedTo.agentId).toBe("ceo");
    expect(result.metadata.skillIds).toEqual(["tooling-integration"]);
    expect(result.metadata.mcpBindings).toEqual([mcpBinding]);
    expect(monitorCalls).toHaveLength(1);
    expect(monitorCalls[0].skillId).toBe("tooling-integration");
    expect(vi.mocked(delegate.invoke)).toHaveBeenCalledTimes(1);
    const prompt = vi.mocked(delegate.invoke).mock.calls[0][0];
    expect(prompt).toContain("Active Skills");
    expect(prompt).toContain("Design an internal API adapter");
    expect(prompt).toContain("Use tools carefully.");
  });

  it("executes an internal api target via the internal adapter", async () => {
    const executeInternalApi = vi.fn(async () => ({
      output: '{"ok":true}',
      targetLabel: "工作流图实例快照",
      operation: "workflow.graph_instance_snapshot",
      response: { ok: true },
    }));

    const executor = new AutoAgentExecutor({
      directory: {
        get: () => undefined,
        getCEO: () => undefined,
        isGuest: () => false,
      },
      skills: {
        resolveSkills: () => [],
        resolveMcpForSkill: () => [],
      },
      skillMonitor: { recordMetrics: vi.fn() },
      internalApis: {
        execute: executeInternalApi,
      },
    });

    const result = await executor.execute({
      kind: "internal_api",
      targetId: "workflow.graph_instance_snapshot",
      input: "读取工作流图",
      workflowId: "wf-1",
      metadata: {
        workflowId: "wf-1",
      },
    });

    expect(executeInternalApi).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: "workflow.graph_instance_snapshot",
        input: "读取工作流图",
        workflowId: "wf-1",
        metadata: { workflowId: "wf-1" },
      }),
    );
    expect(result.kind).toBe("internal_api");
    expect(result.output).toBe('{"ok":true}');
    expect(result.delegatedTo.agentId).toBe("internal_api_executor");
    expect(result.metadata.targetLabel).toBe("工作流图实例快照");
  });
});
