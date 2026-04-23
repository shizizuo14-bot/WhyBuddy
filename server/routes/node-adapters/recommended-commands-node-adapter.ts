import { randomUUID } from "node:crypto";

import type {
  ApplySuggestionRequest,
  ApplySuggestionResponse,
  GetSuggestionsResponse,
  RecommendedCommandDecisionOption,
  RecommendedCommandsConfirmPayload,
  Suggestion,
} from "../../../shared/nl-command/api.js";
import type {
  AdjustmentChange,
  AdjustmentImpact,
  AuditEntry,
  NLExecutionPlan,
} from "../../../shared/nl-command/contracts.js";
import type {
  CostOptimizationSuggestion,
  ResourceAdjustmentSuggestion,
} from "../../core/nl-command/decision-support.js";

export interface RecommendedCommandsAuditTrail {
  record(entry: AuditEntry): Promise<void>;
}

export interface RecommendedCommandsDecisionSupportEngine {
  suggestCostOptimization(
    plan: NLExecutionPlan,
  ): Promise<CostOptimizationSuggestion[]>;
  suggestResourceAdjustment(
    plan: NLExecutionPlan,
  ): Promise<ResourceAdjustmentSuggestion[]>;
}

export interface RecommendedCommandsAdapterDeps {
  auditTrail?: RecommendedCommandsAuditTrail;
  decisionSupportEngine?: RecommendedCommandsDecisionSupportEngine;
  getPlan?: (
    planId: string,
  ) => Promise<NLExecutionPlan | undefined> | NLExecutionPlan | undefined;
  now?: () => number;
  idFactory?: () => string;
}

export interface RecommendedCommandsService {
  listSuggestions(planId: string): Promise<GetSuggestionsResponse>;
  applySuggestion(
    planId: string,
    request: ApplySuggestionRequest,
  ): Promise<ApplySuggestionResponse | null>;
}

interface StoredSuggestionBatch {
  generatedEventId: string;
  generatedAt: number;
  source: "decision_support" | "heuristic" | "mixed";
  plan?: NLExecutionPlan;
  suggestions: Suggestion[];
  selectionOptions: RecommendedCommandDecisionOption[];
  confirmPayload: RecommendedCommandsConfirmPayload;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function buildImpact(
  type: Suggestion["type"],
  estimatedImpact: string,
): AdjustmentImpact {
  const summary = asNonEmptyString(estimatedImpact) ?? "预计产生正向影响";

  if (type === "cost") {
    return {
      timelineImpact: "默认保持当前交付节奏",
      costImpact: summary,
      riskImpact: "需要验证成本收敛不会影响质量门槛",
    };
  }

  if (type === "resource") {
    return {
      timelineImpact: summary,
      costImpact: "可能引入额外资源投入，需要结合预算确认",
      riskImpact: "需要确认新增并发不会挤压关键资源",
    };
  }

  return {
    timelineImpact: summary,
    costImpact: "影响待结合计划上下文确认",
    riskImpact: "需要在采纳前做额外核验",
  };
}

function clonePlan(plan: NLExecutionPlan): NLExecutionPlan {
  return JSON.parse(JSON.stringify(plan)) as NLExecutionPlan;
}

function applyChanges(
  plan: NLExecutionPlan,
  changes: AdjustmentChange[],
  updatedAt: number,
): NLExecutionPlan {
  const nextPlan = clonePlan(plan);

  for (const change of changes) {
    if (change.entityType === "task") {
      const target = nextPlan.tasks.find(task => task.taskId === change.entityId);
      if (target && change.field in target) {
        (target as unknown as Record<string, unknown>)[change.field] =
          change.newValue;
      }
      continue;
    }

    if (change.entityType === "mission") {
      const target = nextPlan.missions.find(
        mission => mission.missionId === change.entityId,
      );
      if (target && change.field in target) {
        (target as unknown as Record<string, unknown>)[change.field] =
          change.newValue;
      }
      continue;
    }

    if (change.entityType === "resource") {
      const target = nextPlan.resourceAllocation.entries.find(
        entry => entry.taskId === change.entityId,
      );
      if (target && change.field in target) {
        (target as unknown as Record<string, unknown>)[change.field] =
          change.newValue;
      }
      continue;
    }

    const target = nextPlan.timeline.entries.find(
      entry => entry.entityId === change.entityId,
    );
    if (target && change.field in target) {
      (target as unknown as Record<string, unknown>)[change.field] =
        change.newValue;
    }
  }

  nextPlan.updatedAt = updatedAt;
  return nextPlan;
}

function buildSelectionOptions(
  suggestions: Suggestion[],
): RecommendedCommandDecisionOption[] {
  return suggestions.map(suggestion => ({
    optionId: suggestion.suggestionId,
    suggestionId: suggestion.suggestionId,
    label: suggestion.title,
    description: suggestion.description,
    action: "multi-choice",
  }));
}

function buildConfirmPayload(
  planId: string,
  suggestions: Suggestion[],
): RecommendedCommandsConfirmPayload {
  return {
    prompt: `请确认是否采纳计划 ${planId} 的推荐命令。`,
    branchKeyField: "suggestionId",
    defaultSuggestionId: suggestions[0]?.suggestionId,
    options: suggestions.map(suggestion => ({
      optionId: `confirm:${suggestion.suggestionId}`,
      suggestionId: suggestion.suggestionId,
      label: `采纳：${suggestion.title}`,
      description: suggestion.rationale ?? suggestion.description,
      action: "approve",
    })),
  };
}

function buildRecommendedCommand(planId: string, suggestionId: string): string {
  return `apply_suggestion --plan ${planId} --suggestion ${suggestionId}`;
}

function buildFallbackCostSuggestion(
  planId: string,
  suggestionId: string,
  plan?: NLExecutionPlan,
): Suggestion {
  const highestCostTask = plan?.tasks.reduce((selected, task) => {
    if (!selected || task.estimatedCost > selected.estimatedCost) {
      return task;
    }
    return selected;
  }, undefined as NLExecutionPlan["tasks"][number] | undefined);
  const costChanges: AdjustmentChange[] = highestCostTask
    ? [
        {
          entityId: highestCostTask.taskId,
          entityType: "task",
          field: "estimatedCost",
          oldValue: highestCostTask.estimatedCost,
          newValue: Math.max(0, Math.round(highestCostTask.estimatedCost * 0.9)),
        },
      ]
    : [];
  const title = highestCostTask
    ? `收敛高成本任务 ${highestCostTask.title}`
    : `为计划 ${planId} 生成成本收敛命令`;
  const description = highestCostTask
    ? `优先收敛成本最高的任务 ${highestCostTask.title}，减少不必要的模型或执行开销。`
    : "在缺少完整计划上下文时，优先生成成本收敛型推荐命令。";
  const rationale = highestCostTask
    ? "优先处理高成本任务，通常能最快形成可感知的预算收益。"
    : "当前未解析到完整计划实体，先返回通用的成本优化建议。";

  return {
    suggestionId,
    type: "cost",
    title,
    description,
    estimatedImpact: buildImpact("cost", "预计节省 5% - 15% 成本"),
    changes: costChanges,
    source: "heuristic",
    rationale,
    recommendedCommand: buildRecommendedCommand(planId, suggestionId),
    metadata: {
      strategy: "fallback-cost",
      planResolved: Boolean(plan),
    },
  };
}

function buildFallbackResourceSuggestion(
  planId: string,
  suggestionId: string,
  plan?: NLExecutionPlan,
): Suggestion {
  const longestTask = plan?.tasks.reduce((selected, task) => {
    if (!selected || task.estimatedDuration > selected.estimatedDuration) {
      return task;
    }
    return selected;
  }, undefined as NLExecutionPlan["tasks"][number] | undefined);
  const durationChanges: AdjustmentChange[] = longestTask
    ? [
        {
          entityId: longestTask.taskId,
          entityType: "task",
          field: "estimatedDuration",
          oldValue: longestTask.estimatedDuration,
          newValue: Math.max(1, Math.round(longestTask.estimatedDuration * 0.85)),
        },
      ]
    : [];
  const title = longestTask
    ? `压缩关键任务 ${longestTask.title} 的交付时长`
    : `为计划 ${planId} 生成资源节奏命令`;
  const description = longestTask
    ? `针对耗时最长的任务 ${longestTask.title} 补充并发资源或前置准备，缩短关键路径。`
    : "在缺少完整计划上下文时，先返回通用的节奏与资源优化建议。";
  const rationale = longestTask
    ? "优先缩短关键路径上最长的任务，能更直接支撑下游 selection/confirm_judge 做决策。"
    : "当前未解析到完整计划实体，先返回可被人工确认的通用资源建议。";

  return {
    suggestionId,
    type: "resource",
    title,
    description,
    estimatedImpact: buildImpact("resource", "预计压缩 10% - 20% 关键路径时长"),
    changes: durationChanges,
    source: "heuristic",
    rationale,
    recommendedCommand: buildRecommendedCommand(planId, suggestionId),
    metadata: {
      strategy: "fallback-resource",
      planResolved: Boolean(plan),
    },
  };
}

function mergeDecisionSupportSuggestions(
  planId: string,
  costSuggestions: CostOptimizationSuggestion[],
  resourceSuggestions: ResourceAdjustmentSuggestion[],
): Suggestion[] {
  return [
    ...costSuggestions.map(suggestion => ({
      suggestionId: suggestion.suggestionId,
      type: "cost" as const,
      title: suggestion.title,
      description: suggestion.description,
      estimatedImpact: buildImpact("cost", suggestion.estimatedImpact),
      changes: [],
      source: "decision_support" as const,
      rationale: "来自 decision-support 的成本优化建议，可直接进入人工选择或确认环节。",
      recommendedCommand: buildRecommendedCommand(planId, suggestion.suggestionId),
      metadata: {
        provider: "decision_support",
      },
    })),
    ...resourceSuggestions.map(suggestion => ({
      suggestionId: suggestion.suggestionId,
      type: "resource" as const,
      title: suggestion.title,
      description: suggestion.description,
      estimatedImpact: buildImpact("resource", suggestion.estimatedImpact),
      changes: [],
      source: "decision_support" as const,
      rationale: "来自 decision-support 的资源调整建议，可直接进入人工确认节点。",
      recommendedCommand: buildRecommendedCommand(planId, suggestion.suggestionId),
      metadata: {
        provider: "decision_support",
      },
    })),
  ];
}

export class RecommendedCommandsAdapter
  implements RecommendedCommandsService
{
  private readonly auditTrail?: RecommendedCommandsAuditTrail;
  private readonly decisionSupportEngine?: RecommendedCommandsDecisionSupportEngine;
  private readonly getPlan?: RecommendedCommandsAdapterDeps["getPlan"];
  private readonly now: () => number;
  private readonly idFactory: () => string;
  private readonly suggestionStore = new Map<string, StoredSuggestionBatch>();

  constructor(deps: RecommendedCommandsAdapterDeps = {}) {
    this.auditTrail = deps.auditTrail;
    this.decisionSupportEngine = deps.decisionSupportEngine;
    this.getPlan = deps.getPlan;
    this.now = deps.now ?? Date.now;
    this.idFactory = deps.idFactory ?? randomUUID;
  }

  async listSuggestions(planId: string): Promise<GetSuggestionsResponse> {
    const plan = await this.getPlan?.(planId);
    let suggestions: Suggestion[] = [];

    if (plan && this.decisionSupportEngine) {
      const [costSuggestions, resourceSuggestions] = await Promise.all([
        this.decisionSupportEngine.suggestCostOptimization(plan),
        this.decisionSupportEngine.suggestResourceAdjustment(plan),
      ]);
      suggestions = mergeDecisionSupportSuggestions(
        planId,
        costSuggestions,
        resourceSuggestions,
      );
    }

    if (suggestions.length === 0) {
      suggestions = [
        buildFallbackCostSuggestion(planId, this.idFactory(), plan),
        buildFallbackResourceSuggestion(planId, this.idFactory(), plan),
      ];
    } else if (suggestions.length === 1) {
      suggestions = [
        ...suggestions,
        suggestions[0].type === "cost"
          ? buildFallbackResourceSuggestion(planId, this.idFactory(), plan)
          : buildFallbackCostSuggestion(planId, this.idFactory(), plan),
      ];
    }

    const selectionOptions = buildSelectionOptions(suggestions);
    const confirmPayload = buildConfirmPayload(planId, suggestions);
    const generatedEventId = this.idFactory();
    const generatedAt = this.now();
    const source = suggestions.every(item => item.source === "decision_support")
      ? "decision_support"
      : suggestions.every(item => item.source === "heuristic")
        ? "heuristic"
        : "mixed";
    const batch: StoredSuggestionBatch = {
      generatedEventId,
      generatedAt,
      source,
      plan,
      suggestions: suggestions.map((suggestion, index) => ({
        ...suggestion,
        selectionOption: selectionOptions[index],
        confirmOption: confirmPayload.options[index],
      })),
      selectionOptions,
      confirmPayload,
    };
    this.suggestionStore.set(planId, batch);

    await this.auditTrail?.record({
      entryId: generatedEventId,
      operationType: "suggestion_generated",
      operator: "system",
      content: `Generated ${batch.suggestions.length} recommended commands for plan ${planId}`,
      timestamp: generatedAt,
      result: "success",
      entityId: planId,
      entityType: "plan",
      metadata: {
        source,
        planResolved: Boolean(plan),
        suggestionIds: batch.suggestions.map(item => item.suggestionId),
      },
    });

    return {
      suggestions: batch.suggestions,
      selectionOptions: batch.selectionOptions,
      confirmPayload: batch.confirmPayload,
      observability: {
        generatedEventId,
        generatedAt,
        source,
      },
    };
  }

  async applySuggestion(
    planId: string,
    request: ApplySuggestionRequest,
  ): Promise<ApplySuggestionResponse | null> {
    const suggestionId = asNonEmptyString(request.suggestionId);
    if (!suggestionId) {
      return null;
    }

    const batch = this.suggestionStore.get(planId);
    const suggestion = batch?.suggestions.find(
      item => item.suggestionId === suggestionId,
    );
    if (!batch || !suggestion) {
      return null;
    }

    const appliedAt = this.now();
    const adjustment = {
      adjustmentId: this.idFactory(),
      planId,
      reason: `采纳推荐命令：${suggestion.title}`,
      changes: suggestion.changes,
      impact: suggestion.estimatedImpact,
      approvalRequired: false,
      status: "applied" as const,
      createdAt: appliedAt,
    };
    const auditEntryId = this.idFactory();
    const operator = asNonEmptyString(request.operator) ?? "system";
    const livePlan = (await this.getPlan?.(planId)) ?? batch.plan;
    const updatedPlan =
      livePlan && suggestion.changes.length > 0
        ? applyChanges(livePlan, suggestion.changes, appliedAt)
        : livePlan
          ? { ...clonePlan(livePlan), updatedAt: appliedAt }
          : undefined;

    await this.auditTrail?.record({
      entryId: auditEntryId,
      operationType: "suggestion_applied",
      operator,
      content: `Applied recommended command ${suggestion.suggestionId} for plan ${planId}`,
      timestamp: appliedAt,
      result: "success",
      entityId: planId,
      entityType: "plan",
      metadata: {
        suggestionId: suggestion.suggestionId,
        suggestionType: suggestion.type,
        source: suggestion.source,
        recommendedCommand: suggestion.recommendedCommand,
      },
    });

    return {
      adjustment,
      updatedPlan,
      appliedSuggestion: suggestion,
      audit: {
        suggestionAppliedEntryId: auditEntryId,
      },
    };
  }
}
