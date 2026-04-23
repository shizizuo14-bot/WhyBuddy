import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { NLExecutionPlan } from "../../../shared/nl-command/contracts.js";
import { AuditTrail } from "../../core/nl-command/audit-trail.js";
import { RecommendedCommandsAdapter } from "../../routes/node-adapters/recommended-commands-node-adapter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_AUDIT_PATH = resolve(
  __dirname,
  "../../../data/__test_recommended_commands__/nl-audit.json",
);

function cleanup() {
  const target = dirname(TEST_AUDIT_PATH);
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
  }
}

function makePlan(planId = "plan-1"): NLExecutionPlan {
  const now = 1710000000000;
  return {
    planId,
    commandId: "cmd-1",
    status: "approved",
    missions: [
      {
        missionId: "mission-1",
        title: "发布准备",
        description: "完成发布窗口前的准备动作",
        objectives: ["控制成本", "缩短关键路径"],
        constraints: [],
        estimatedDuration: 120,
        estimatedCost: 200,
        priority: "high",
      },
    ],
    tasks: [
      {
        taskId: "task-1",
        title: "模型压测",
        description: "验证高成本模型的实际收益",
        objectives: ["评估成本收益"],
        constraints: [],
        estimatedDuration: 90,
        estimatedCost: 180,
        requiredSkills: ["analysis"],
        priority: "high",
      },
      {
        taskId: "task-2",
        title: "发布脚本整理",
        description: "整理上线脚本和回滚步骤",
        objectives: ["发布可重复"],
        constraints: [],
        estimatedDuration: 45,
        estimatedCost: 60,
        requiredSkills: ["ops"],
        priority: "medium",
      },
    ],
    timeline: {
      startDate: "2026-04-23",
      endDate: "2026-04-24",
      criticalPath: ["task-1"],
      milestones: [],
      entries: [
        {
          entityId: "task-1",
          entityType: "task",
          startTime: now,
          endTime: now + 90,
          duration: 90,
          isCriticalPath: true,
        },
      ],
    },
    resourceAllocation: {
      entries: [
        {
          taskId: "task-1",
          agentType: "planner",
          agentCount: 1,
          requiredSkills: ["analysis"],
          startTime: now,
          endTime: now + 90,
        },
      ],
      totalAgents: 1,
      peakConcurrency: 1,
    },
    riskAssessment: {
      risks: [],
      overallRiskLevel: "medium",
    },
    costBudget: {
      totalBudget: 260,
      missionCosts: { "mission-1": 200 },
      taskCosts: { "task-1": 180, "task-2": 60 },
      agentCosts: {},
      modelCosts: {},
      currency: "CNY",
    },
    contingencyPlan: {
      alternatives: [],
      degradationStrategies: [],
      rollbackPlan: "回滚到上一个稳定版本",
    },
    createdAt: now,
    updatedAt: now,
  };
}

describe("RecommendedCommandsAdapter", () => {
  let auditTrail: AuditTrail;

  beforeEach(() => {
    cleanup();
    auditTrail = new AuditTrail(TEST_AUDIT_PATH);
  });

  afterEach(() => {
    cleanup();
  });

  it("should generate fallback suggestions with selection and confirm payloads", async () => {
    const adapter = new RecommendedCommandsAdapter({
      auditTrail,
      getPlan: () => makePlan(),
      now: () => 1710000000100,
      idFactory: (() => {
        let counter = 0;
        return () => `id-${++counter}`;
      })(),
    });

    const result = await adapter.listSuggestions("plan-1");

    expect(result.suggestions.length).toBeGreaterThanOrEqual(2);
    expect(result.selectionOptions?.length).toBe(result.suggestions.length);
    expect(result.confirmPayload?.branchKeyField).toBe("suggestionId");
    expect(result.suggestions[0].recommendedCommand).toContain("--plan plan-1");
    expect(result.observability?.generatedEventId).toBe("id-3");

    const entries = await auditTrail.query({ operationType: "suggestion_generated" });
    expect(entries).toHaveLength(1);
    expect(entries[0].entityId).toBe("plan-1");
  });

  it("should apply a generated suggestion and write suggestion_applied audit", async () => {
    const adapter = new RecommendedCommandsAdapter({
      auditTrail,
      getPlan: () => makePlan(),
      now: () => 1710000000200,
      idFactory: (() => {
        let counter = 0;
        return () => `apply-${++counter}`;
      })(),
    });

    const listed = await adapter.listSuggestions("plan-1");
    const firstSuggestionId = listed.suggestions[0]?.suggestionId;
    expect(firstSuggestionId).toBeTruthy();

    const result = await adapter.applySuggestion("plan-1", {
      suggestionId: firstSuggestionId!,
      operator: "user-1",
    });

    expect(result).not.toBeNull();
    expect(result?.adjustment.status).toBe("applied");
    expect(result?.appliedSuggestion?.suggestionId).toBe(firstSuggestionId);
    expect(result?.audit?.suggestionAppliedEntryId).toBeTruthy();

    const entries = await auditTrail.query({ operationType: "suggestion_applied" });
    expect(entries).toHaveLength(1);
    expect(entries[0].operator).toBe("user-1");
    expect(entries[0].metadata?.suggestionId).toBe(firstSuggestionId);
  });

  it("should return null when applying a non-existent suggestion", async () => {
    const adapter = new RecommendedCommandsAdapter({
      auditTrail,
      getPlan: () => makePlan(),
    });

    const result = await adapter.applySuggestion("plan-1", {
      suggestionId: "missing-suggestion",
    });

    expect(result).toBeNull();
  });
});
