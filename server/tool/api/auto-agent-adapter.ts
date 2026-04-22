import type { AgentHandle } from "../../../shared/workflow-runtime.js";
import type {
  ActivatedSkill,
  ResolveOptions,
  SkillBinding,
  SkillExecutionMetrics,
  SkillRecord,
} from "../../../shared/skill-contracts.js";
import type { WorkflowMcpBinding } from "../../../shared/organization-schema.js";
import db from "../../db/index.js";
import { registry } from "../../core/registry.js";
import { skillRegistry } from "../../core/dynamic-organization.js";
import { SkillActivator } from "../../core/skill-activator.js";
import { SkillMonitor } from "../../core/skill-monitor.js";
import {
  InternalApiExecutor,
  type InternalApiExecutorLike,
} from "./internal-api-adapter.js";

export type AutoAgentTargetKind =
  | "agent"
  | "guest_agent"
  | "skill"
  | "internal_api";

export interface AutoAgentExecutionRequest {
  kind: AutoAgentTargetKind;
  targetId: string;
  input: string;
  context?: string[];
  workflowId?: string;
  stage?: string;
  version?: string;
  delegateAgentId?: string;
  maxSkills?: number;
  metadata?: Record<string, unknown>;
}

export interface AutoAgentExecutionResult {
  kind: AutoAgentTargetKind;
  targetId: string;
  output: string;
  delegatedTo: {
    agentId: string;
    agentName: string;
    role: AgentHandle["config"]["role"];
    kind: "agent" | "guest_agent";
  };
  metadata: {
    source: "auto_agent";
    invokedAt: string;
    workflowId?: string;
    stage?: string;
    requestMetadata?: Record<string, unknown>;
    skillIds?: string[];
    skillVersions?: Record<string, string>;
    mcpBindings?: WorkflowMcpBinding[];
    targetLabel?: string;
  };
}

export interface AutoAgentDirectory {
  get(id: string): AgentHandle | undefined;
  getCEO(): AgentHandle | undefined;
  isGuest(id: string): boolean;
}

export interface AutoAgentSkillRegistry {
  resolveSkills(skillIds: string[], options?: ResolveOptions): SkillBinding[];
  resolveMcpForSkill(
    skill: SkillRecord,
    agentId: string,
    workflowId: string
  ): WorkflowMcpBinding[];
}

export interface AutoAgentSkillMonitor {
  recordMetrics(metrics: SkillExecutionMetrics): void;
}

export interface AutoAgentExecutorDependencies {
  directory?: AutoAgentDirectory;
  skills?: AutoAgentSkillRegistry;
  skillMonitor?: AutoAgentSkillMonitor;
  skillActivator?: SkillActivator;
  internalApis?: InternalApiExecutorLike;
}

export interface AutoAgentExecutorLike {
  execute(request: AutoAgentExecutionRequest): Promise<AutoAgentExecutionResult>;
}

function ensureText(value: string, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required field: ${field}`);
  }
  return value.trim();
}

function normalizeContext(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function dedupeMcpBindings(bindings: WorkflowMcpBinding[]): WorkflowMcpBinding[] {
  const seen = new Set<string>();
  return bindings.filter((binding) => {
    const key = `${binding.id}:${binding.server}:${binding.connection.endpoint}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function estimateTokenCount(text: string): number {
  if (!text.trim()) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function normalizeAutoAgentContextInput(value: unknown): string[] | undefined {
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  return undefined;
}

export function mapAutoAgentErrorToStatusCode(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("Missing required field:")) return 400;
  if (
    message.includes("not found") ||
    message.includes("not a guest agent") ||
    message.includes("not a resident agent") ||
    message.includes("No enabled skill bindings") ||
    message.includes("No default delegate agent is available")
  ) {
    return 404;
  }
  if (message.includes("disabled")) return 409;
  return 500;
}

export class AutoAgentExecutor implements AutoAgentExecutorLike {
  private readonly directory: AutoAgentDirectory;
  private readonly skills: AutoAgentSkillRegistry;
  private readonly skillMonitor: AutoAgentSkillMonitor;
  private readonly skillActivator: SkillActivator;
  private readonly internalApis: InternalApiExecutorLike;

  constructor(deps: AutoAgentExecutorDependencies = {}) {
    this.directory = deps.directory ?? registry;
    this.skills = deps.skills ?? skillRegistry;
    this.skillMonitor = deps.skillMonitor ?? new SkillMonitor(db);
    this.skillActivator = deps.skillActivator ?? new SkillActivator();
    this.internalApis = deps.internalApis ?? new InternalApiExecutor();
  }

  async execute(request: AutoAgentExecutionRequest): Promise<AutoAgentExecutionResult> {
    const kind = request.kind;
    const targetId = ensureText(request.targetId, "targetId");
    const input = ensureText(request.input, "input");
    const context = normalizeContext(request.context);

    if (kind === "skill") {
      return this.executeSkill({
        ...request,
        kind,
        targetId,
        input,
        context,
      });
    }

    if (kind === "internal_api") {
      return this.executeInternalApi({
        ...request,
        kind,
        targetId,
        input,
        context,
      });
    }

    const agent = this.resolveAgentTarget(targetId, kind);
    const output = await agent.invoke(input, context, {
      workflowId: request.workflowId,
      stage: request.stage ?? "auto_agent",
    });

    return {
      kind,
      targetId,
      output,
      delegatedTo: {
        agentId: agent.config.id,
        agentName: agent.config.name,
        role: agent.config.role,
        kind: this.directory.isGuest(agent.config.id) ? "guest_agent" : "agent",
      },
      metadata: {
        source: "auto_agent",
        invokedAt: new Date().toISOString(),
        workflowId: request.workflowId,
        stage: request.stage ?? "auto_agent",
        requestMetadata: request.metadata,
        targetLabel: agent.config.name,
      },
    };
  }

  private resolveAgentTarget(
    targetId: string,
    expectedKind: "agent" | "guest_agent"
  ): AgentHandle {
    const agent = this.directory.get(targetId);
    if (!agent) {
      throw new Error(`Target ${expectedKind} not found: ${targetId}`);
    }

    const isGuest = this.directory.isGuest(targetId);
    if (expectedKind === "guest_agent" && !isGuest) {
      throw new Error(`Target is not a guest agent: ${targetId}`);
    }
    if (expectedKind === "agent" && isGuest) {
      throw new Error(`Target is a guest agent, not a resident agent: ${targetId}`);
    }

    return agent;
  }

  private resolveDelegateAgent(request: AutoAgentExecutionRequest): AgentHandle {
    if (request.delegateAgentId?.trim()) {
      const delegate = this.directory.get(request.delegateAgentId.trim());
      if (!delegate) {
        throw new Error(`Delegate agent not found: ${request.delegateAgentId.trim()}`);
      }
      return delegate;
    }

    const ceo = this.directory.getCEO();
    if (!ceo) {
      throw new Error("No default delegate agent is available for skill execution");
    }
    return ceo;
  }

  private enrichSkillBindings(
    bindings: SkillBinding[],
    agentId: string,
    workflowId: string
  ): SkillBinding[] {
    return bindings.map((binding) => ({
      ...binding,
      mcpBindings: this.skills.resolveMcpForSkill(
        binding.resolvedSkill,
        agentId,
        workflowId
      ),
    }));
  }

  private materializeSkillPrompts(
    skills: ActivatedSkill[],
    input: string
  ): ActivatedSkill[] {
    return skills.map((skill) => ({
      ...skill,
      resolvedPrompt: skill.resolvedPrompt.replace(/\{input\}/g, input),
    }));
  }

  private async executeSkill(
    request: AutoAgentExecutionRequest & { kind: "skill"; targetId: string; input: string; context: string[] }
  ): Promise<AutoAgentExecutionResult> {
    const delegateAgent = this.resolveDelegateAgent(request);
    const resolveOptions: ResolveOptions | undefined = request.version
      ? { versionMap: { [request.targetId]: request.version } }
      : undefined;
    const baseBindings = this.skills.resolveSkills([request.targetId], resolveOptions);

    if (baseBindings.length === 0) {
      throw new Error(`Skill not found or disabled: ${request.targetId}`);
    }

    const workflowId = request.workflowId ?? "auto-agent";
    const taskContext = request.context.length > 0
      ? request.context.join("\n\n")
      : request.input;
    const enrichedBindings = this.enrichSkillBindings(
      baseBindings,
      delegateAgent.config.id,
      workflowId
    );

    const activationStartedAt = Date.now();
    const activatedSkills = this.skillActivator.activateSkills(
      enrichedBindings,
      taskContext,
      request.maxSkills
    );
    const activationTimeMs = Date.now() - activationStartedAt;

    if (activatedSkills.length === 0) {
      throw new Error(`No enabled skill bindings resolved for ${request.targetId}`);
    }

    const materializedSkills = this.materializeSkillPrompts(activatedSkills, request.input);
    const skillPromptSection = this.skillActivator.buildSkillPromptSection(materializedSkills);
    const prompt = [
      "Use the activated skill pack to process the incoming request.",
      skillPromptSection,
      "Input:",
      request.input,
      "Requirements:",
      "- Follow the skill instructions before adding your own synthesis.",
      "- Call out missing context briefly if the request is underspecified.",
      "- Keep the output directly usable by the next workflow step.",
    ].join("\n\n");

    const executionStartedAt = Date.now();
    let output = "";
    let success = false;
    try {
      output = await delegateAgent.invoke(prompt, request.context, {
        workflowId: request.workflowId,
        stage: request.stage ?? "auto_agent_skill",
      });
      success = true;
    } finally {
      const executionTimeMs = Date.now() - executionStartedAt;
      const tokenCount = success ? estimateTokenCount(`${request.input}\n${output}`) : 0;
      for (const skill of materializedSkills) {
        this.skillMonitor.recordMetrics({
          skillId: skill.skillId,
          version: skill.version,
          workflowId,
          agentId: delegateAgent.config.id,
          agentRole: delegateAgent.config.role,
          taskType: "auto_agent_skill",
          activationTimeMs,
          executionTimeMs,
          tokenCount,
          success,
          timestamp: new Date().toISOString(),
        });
      }
    }

    const mcpBindings = dedupeMcpBindings(
      materializedSkills.flatMap((skill) => skill.mcpBindings)
    );

    return {
      kind: "skill",
      targetId: request.targetId,
      output,
      delegatedTo: {
        agentId: delegateAgent.config.id,
        agentName: delegateAgent.config.name,
        role: delegateAgent.config.role,
        kind: this.directory.isGuest(delegateAgent.config.id) ? "guest_agent" : "agent",
      },
      metadata: {
        source: "auto_agent",
        invokedAt: new Date().toISOString(),
        workflowId: request.workflowId,
        stage: request.stage ?? "auto_agent_skill",
        requestMetadata: request.metadata,
        skillIds: materializedSkills.map((skill) => skill.skillId),
        skillVersions: Object.fromEntries(
          materializedSkills.map((skill) => [skill.skillId, skill.version])
        ),
        mcpBindings,
        targetLabel: baseBindings[0]?.resolvedSkill.name,
      },
    };
  }

  private async executeInternalApi(
    request: AutoAgentExecutionRequest & {
      kind: "internal_api";
      targetId: string;
      input: string;
      context: string[];
    },
  ): Promise<AutoAgentExecutionResult> {
    const result = await this.internalApis.execute({
      targetId: request.targetId,
      input: request.input,
      context: request.context,
      workflowId: request.workflowId,
      stage: request.stage,
      metadata: request.metadata,
    });

    return {
      kind: "internal_api",
      targetId: request.targetId,
      output: result.output,
      delegatedTo: {
        agentId: "internal_api_executor",
        agentName: "Internal API Executor",
        role: "worker",
        kind: "agent",
      },
      metadata: {
        source: "auto_agent",
        invokedAt: new Date().toISOString(),
        workflowId: request.workflowId,
        stage: request.stage ?? "auto_agent_internal_api",
        requestMetadata: request.metadata,
        targetLabel: result.targetLabel,
      },
    };
  }
}

let autoAgentExecutor: AutoAgentExecutorLike = new AutoAgentExecutor();

export function getAutoAgentExecutor(): AutoAgentExecutorLike {
  return autoAgentExecutor;
}

export function setAutoAgentExecutor(executor: AutoAgentExecutorLike): void {
  autoAgentExecutor = executor;
}

export function resetAutoAgentExecutor(): void {
  autoAgentExecutor = new AutoAgentExecutor();
}
