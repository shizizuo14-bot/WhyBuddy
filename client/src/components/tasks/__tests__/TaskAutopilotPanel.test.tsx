import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { MissionTaskDetail } from "@/lib/tasks-store";
import { useAppStore } from "@/lib/store";

import { TaskAutopilotPanel } from "../TaskAutopilotPanel";
import { TaskDetailView } from "../TaskDetailView";

vi.mock("@/components/rag/RAGInfoPanel", () => ({
  RAGInfoPanel: () => null,
}));

vi.mock("@/components/rag/RAGDebugPanel", () => ({
  RAGDebugPanel: () => null,
}));

type DetailWithAutopilot = MissionTaskDetail & {
  autopilotSummary?: (
    MissionTaskDetail & { autopilotSummary?: unknown }
  )["autopilotSummary"];
};

function makeDetail(
  overrides?: Partial<MissionTaskDetail>,
  autopilotSummary?: unknown
): DetailWithAutopilot {
  return {
    id: "mission-1",
    title: "Autopilot alignment",
    kind: "analysis",
    sourceText:
      "Align the autopilot projection panel with the latest task detail view.",
    status: "running",
    operatorState: "active",
    workflowStatus: "running",
    progress: 48,
    currentStageKey: "execute",
    currentStageLabel: "Execute",
    summary: "Keep the task detail view aligned with the autopilot summary.",
    waitingFor: null,
    blocker: null,
    attempt: 1,
    latestOperatorAction: null,
    createdAt: Date.now() - 300_000,
    updatedAt: Date.now() - 30_000,
    startedAt: Date.now() - 240_000,
    completedAt: null,
    departmentLabels: ["Platform"],
    taskCount: 0,
    completedTaskCount: 0,
    messageCount: 0,
    activeAgentCount: 0,
    attachmentCount: 0,
    issueCount: 0,
    hasWarnings: false,
    lastSignal: "Projection refresh succeeded.",
    workflow: {
      id: "workflow-1",
      directive:
        "Align the autopilot projection panel with the latest task detail view.",
      status: "running",
      current_stage: "execute",
      departments_involved: ["Platform"],
      started_at: new Date(Date.now() - 240_000).toISOString(),
      completed_at: null,
      results: null,
      created_at: new Date(Date.now() - 300_000).toISOString(),
    },
    tasks: [],
    messages: [],
    report: null,
    organization: null,
    stages: [],
    agents: [],
    timeline: [],
    artifacts: [],
    failureReasons: [],
    decisionPresets: [],
    decisionPrompt: null,
    decisionPlaceholder: null,
    decisionAllowsFreeText: false,
    decision: null,
    instanceInfo: [],
    logSummary: [],
    runtimeChannels: {
      socket: {
        status: "connected",
        label: "Socket connected",
        detail:
          "Mission socket is connected and can receive live runtime updates.",
      },
      callback: {
        status: "idle",
        label: "Callback idle",
        detail:
          "No executor callback has been recorded for this mission yet.",
      },
    },
    decisionHistory: [],
    operatorActions: [],
    missionArtifacts: [],
    ...overrides,
    autopilotSummary:
      autopilotSummary as DetailWithAutopilot["autopilotSummary"],
  };
}

beforeEach(() => {
  useAppStore.getState().setLocale("en-US");
});

describe("TaskAutopilotPanel", () => {
  it("renders a readable panel from the current autopilotSummary alias fields", () => {
    const markup = renderToStaticMarkup(
      <TaskAutopilotPanel
        detail={makeDetail(undefined, {
          destination: {
            goal: "Ship the weekly operations report",
          },
          route: {
            label: "Stable review lane",
            summary: "Collect evidence, draft the report, then verify.",
            mode: "standard",
          },
          driveState: "takeover-required",
          fleetRole: "Planner + Reviewer",
          takeover: {
            reason: "Need human approval before the final release handoff.",
          },
        })}
      />
    );

    expect(markup).toContain('data-testid="task-autopilot-panel"');
    expect(markup).toContain("Ship the weekly operations report");
    expect(markup).toContain("Stable review lane");
    expect(markup).toMatch(/Standard|\u6807\u51c6/);
    expect(markup).toMatch(/Takeover Required|\u9700\u8981\u63a5\u7ba1/);
    expect(markup).toContain("Planner + Reviewer");
    expect(markup).toContain(
      "Need human approval before the final release handoff."
    );
  });

  it("supports nested shared-style autopilotSummary fields without falling back to generic copy", () => {
    const markup = renderToStaticMarkup(
      <TaskAutopilotPanel
        detail={makeDetail(undefined, {
          destination: {
            goal: "Close the audit loop",
          },
          route: {
            selected: {
              title: "Deep compliance route",
              summary: "Trace evidence before publish.",
              mode: "deep",
            },
          },
          driveState: {
            key: "reviewing",
            summary: "Quality gates are running.",
          },
          fleet: {
            roles: [
              { title: "Planner" },
              { roleType: "auditor" },
              { name: "Reviewer" },
            ],
          },
          takeover: {
            status: "pending",
            reason: "Budget exception needs sign-off.",
          },
        })}
      />
    );

    expect(markup).toContain("Close the audit loop");
    expect(markup).toContain("Deep compliance route");
    expect(markup).toContain("Trace evidence before publish.");
    expect(markup).toMatch(/Deep|\u6df1\u5ea6/);
    expect(markup).toMatch(/Reviewing|\u590d\u6838\u4e2d/);
    expect(markup).toContain("Quality gates are running.");
    expect(markup).toMatch(
      /Planner \/ Auditor \/ Reviewer|Planner \/ \u5ba1\u8ba1\u8005 \/ Reviewer/
    );
    expect(markup).toMatch(/Pending|\u5f85\u5904\u7406/);
    expect(markup).toContain("Budget exception needs sign-off.");
  });

  it("renders the shared/client autopilot summary shape with stable section details", () => {
    const markup = renderToStaticMarkup(
      <TaskAutopilotPanel
        detail={makeDetail(undefined, {
          destination: {
            goal: "Close the audit loop",
            request: "Prepare the approval packet for release.",
            constraints: ["Do not change the rollout window."],
            successCriteria: ["Human approval is recorded."],
            deliverables: ["approval-packet.md"],
            missingInfo: ["Confirm the release owner."],
          },
          route: {
            label: "Server selected route",
            status: "running",
            progress: 77,
            currentStageLabel: "Run execution",
            takeoverPointIds: ["takeover-1", "takeover-2"],
            selectedRouteId: "route-release:standard",
            recommendedRouteId: "route-release:deep",
            candidateRoutes: [
              {
                id: "route-release:standard",
                label: "Standard release route",
                summary: "Keep the current release lane moving.",
                mode: "standard",
                status: "running",
                selected: true,
                recommended: false,
                locked: false,
                estimatedDuration: "20m",
                estimatedCost: "$4",
                riskLevel: "medium",
                takeoverLoad: "medium",
              },
              {
                id: "route-release:deep",
                label: "Deep verification route",
                summary: "Trace evidence before publish.",
                mode: "deep",
                status: "pending",
                selected: false,
                recommended: true,
                locked: false,
                estimatedDuration: "45m",
                estimatedCost: "$9",
                riskLevel: "low",
                takeoverLoad: "low",
              },
              {
                id: "route-release:fast",
                label: "Fast unblock route",
                summary: "Trade depth for a quick unblock.",
                mode: "fast",
                status: "pending",
                selected: false,
                recommended: false,
                locked: false,
                estimatedDuration: "10m",
                estimatedCost: "$2",
                riskLevel: "high",
                takeoverLoad: "high",
              },
            ],
            riskPoints: ["Release approval is still pending."],
            stages: [
              {
                key: "execute",
                label: "Run execution",
                status: "running",
                detail: "Executor is collecting release evidence.",
                isCurrent: true,
              },
            ],
          },
          driveState: {
            state: "reviewing",
            label: "Server reviewing",
            detail: "Server projection is reviewing artifacts.",
            currentStageLabel: "Run execution",
            waitingForUser: true,
            riskLevel: "medium",
            confidence: "high",
          },
          recovery: {
            state: "recovering",
            deviationCategory: "quality-deviation",
            reason: "Approval evidence is incomplete.",
            attemptedActions: ["retry"],
            suggestedActions: ["replan", "escalate"],
            needsHuman: true,
            canAutoRecover: false,
          },
          fleet: {
            roles: [
              {
                id: "planner",
                roleType: "planner",
                title: "Planner",
                status: "running",
              },
              {
                id: "operator",
                roleType: "operator",
                title: "Operator",
                status: "waiting",
              },
              {
                id: "executor",
                roleType: "executor",
                title: "Executor",
                status: "blocked",
              },
            ],
            activeRoleCount: 2,
            blockedRoleCount: 1,
          },
          outputs: {
            items: [
              {
                title: "approval-packet.md",
                description: "Draft approval packet for release review.",
              },
              {
                label: "risk-register.json",
                detail: "Structured risk register draft.",
              },
            ],
          },
          blockers: {
            items: [
              {
                title: "Approval gate",
                reason: "Release approval is still pending.",
                recovery: "Collect human sign-off.",
              },
            ],
          },
          evidence: {
            eventCount: 14,
            artifactCount: 3,
            lastSignal: "Executor uploaded a refreshed approval packet.",
            latestEventType: "progress",
            updatedAt: "2026-04-24T08:30:00.000Z",
            trustLevel: "partial",
            gaps: ["No signed approval attachment yet."],
            sources: ["mission logs", "executor callback"],
            timeline: [
              {
                id: "evt-1",
                type: "route_change",
                label: "Route recommendation updated",
                detail: "Deep verification route is now preferred.",
                status: "info",
                source: "planner",
                time: "2026-04-24T08:20:00.000Z",
              },
              {
                id: "evt-2",
                type: "operator_action",
                label: "Operator requested approval",
                detail: "Waiting for release owner confirmation.",
                status: "waiting",
                source: "operator",
                time: "2026-04-24T08:25:00.000Z",
              },
            ],
          },
          explanation: {
            current: "Autopilot is holding the release until evidence is complete.",
            nextSteps: ["Collect signed approval", "Re-run the release check"],
            recommendationReasons: [
              "Deep verification route reduces release risk.",
            ],
            remainingSteps: {
              currentStepKey: "execute",
              currentStepLabel: "Run execution",
              pendingSteps: [
                {
                  key: "review",
                  label: "Review approval packet",
                  status: "pending",
                  isCurrent: false,
                },
                {
                  key: "deliver",
                  label: "Deliver release summary",
                  status: "pending",
                  isCurrent: false,
                },
              ],
              parallelBranchCount: 2,
              replanChangeSummary:
                "Verification branch stays active until approval arrives.",
            },
            riskSummary: ["External write is still human-gated."],
            evidenceHints: ["Open the approval packet and audit trail."],
            telemetrySignals: ["drive.state:reviewing", "recovery.state:recovering"],
          },
          takeover: {
            status: "required",
            required: true,
            blocking: true,
            type: "approval",
            reason: "Choose whether to continue with the external write.",
            prompt: "Approve external write?",
            options: [
              {
                id: "approve",
                label: "Approve",
                description: "Continue the route.",
              },
              {
                id: "reject",
                label: "Reject",
                description: "Stop the route.",
              },
            ],
            urgency: "medium",
          },
        })}
      />
    );

    expect(markup).toContain("Close the audit loop");
    expect(markup).toMatch(
      /Constraints: Do not change the rollout window\.|\u7ea6\u675f: Do not change the rollout window\./
    );
    expect(markup).toContain("Server selected route");
    expect(markup).toMatch(
      /Selected: Standard release route|已选: Standard release route/
    );
    expect(markup).toMatch(
      /Recommended: Deep verification route|推荐: Deep verification route/
    );
    expect(markup).toMatch(
      /Alternatives: Fast unblock route|备选: Fast unblock route/
    );
    expect(markup).toMatch(
      /Route Diff: Mode: Standard (?:->|-&gt;) Deep; Risk: Medium (?:->|-&gt;) Low; Load: Medium (?:->|-&gt;) Low; ETA: 20m (?:->|-&gt;) 45m; Cost: \$4 (?:->|-&gt;) \$9|路线差异: 模式: 标准 (?:->|-&gt;) 深度; 风险: 中 (?:->|-&gt;) 低; 负担: 中 (?:->|-&gt;) 低; 时长: 20m (?:->|-&gt;) 45m; 成本: \$4 (?:->|-&gt;) \$9/
    );
    expect(markup).toContain("时长汇总: 已选 20m（范围 10m -&gt; 45m）");
    expect(markup).toContain("成本汇总: 已选 $4（范围 $2 -&gt; $9）");
    expect(markup).toContain("1 个风险点");
    expect(markup).toContain("2 个接管点");
    expect(markup).toContain("剩余 2 步");
    expect(markup).toContain("剩余步骤: Review approval packet; Deliver release summary");
    expect(markup).toContain("还有 2 个并行分支");
    expect(markup).toContain("计划变更: Verification branch stays active until approval arrives.");
    expect(markup).toMatch(/77% complete|\u8fdb\u5ea6 77%/);
    expect(markup).toMatch(/Status: Running|\u72b6\u6001: \u8fdb\u884c\u4e2d/);
    expect(markup).toContain("Executor is collecting release evidence.");
    expect(markup).toMatch(/Live execution|\u5f53\u524d\u6267\u884c/i);
    expect(markup).toMatch(/Live: Planner; Operator|Live: Planner:| \u5728\u7ebf:/);
    expect(markup).toContain("Server reviewing");
    expect(markup).toMatch(/Waiting for user|\u7b49\u5f85\u7528\u6237/);
    expect(markup).toMatch(/Risk: Medium|\u98ce\u9669: \u4e2d/);
    expect(markup).toMatch(/Confidence: High|\u7f6e\u4fe1\u5ea6: \u9ad8/);
    expect(markup).toContain("Planner / Operator / Executor");
    expect(markup).toMatch(/2 active|2 \u4e2a\u6d3b\u8dc3\u89d2\u8272/);
    expect(markup).toMatch(/1 blocked|1 \u4e2a\u963b\u585e\u89d2\u8272/);
    expect(markup).toContain("Approval gate");
    expect(markup).toMatch(/Choose whether to continue with the external write\./);
    expect(markup).toContain('data-testid="task-autopilot-recovery"');
    expect(markup).toMatch(/Recovering|恢复中/);
    expect(markup).toMatch(/Quality Deviation|质量偏航/);
    expect(markup).toContain("Approval evidence is incomplete.");
    expect(markup).toMatch(/Attempted: Retry|已尝试: 重试/);
    expect(markup).toMatch(/Suggested: Replan; Escalate|建议: 重规划; 升级/);
    expect(markup).toContain("approval-packet.md");
    expect(markup).toContain("risk-register.json");
    expect(markup).toMatch(/14 events|14 \u6761\u4e8b\u4ef6/);
    expect(markup).toMatch(/3 artifacts|3 \u4e2a\u4ea7\u7269/);
    expect(markup).toContain("Executor uploaded a refreshed approval packet.");
    expect(markup).toMatch(/Trust: Partial|可信度: 部分验证/);
    expect(markup).toMatch(/Gaps: No signed approval attachment yet\.|缺口: No signed approval attachment yet\./);
    expect(markup).toMatch(/Timeline: Route recommendation updated|时间线: Route recommendation updated/);
    expect(markup).toContain('data-testid="task-autopilot-explanation"');
    expect(markup).toContain(
      "Autopilot is holding the release until evidence is complete."
    );
    expect(markup).toMatch(
      /Next: Collect signed approval; Re-run the release check|下一步: Collect signed approval; Re-run the release check/
    );
    expect(markup).toMatch(
      /Why: Deep verification route reduces release risk\.|原因: Deep verification route reduces release risk\./
    );
    expect(markup).toMatch(/Approval required|\u5ba1\u6279\u63a5\u7ba1/);
    expect(markup).toContain("Approve external write?");
    expect(markup).toMatch(
      /Options: Approve: Continue the route\.; Reject: Stop the route\.|\u9009\u9879: Approve: Continue the route\.; Reject: Stop the route\./
    );
    expect(markup).toMatch(/Required|\u5fc5\u9700/);
    expect(markup).toMatch(/Action required|需要处理/);
    expect(markup).toMatch(
      /Blocking route progression|阻塞当前路线/
    );
  });

  it("surfaces live execution, blockers, outputs, and evidence from alias-style fields without changing panel layout", () => {
    const markup = renderToStaticMarkup(
      <TaskAutopilotPanel
        detail={makeDetail(undefined, {
          destination: {
            goal: "Prepare the launch update",
          },
          route: {
            label: "Launch review lane",
            currentStage: {
              label: "Review external copy",
              status: "running",
              detail: "Reviewer is checking the launch summary.",
            },
            progress: 62,
          },
          driveState: {
            state: "blocked",
            detail: "Waiting for compliance approval.",
            blocked: true,
          },
          fleet: {
            roles: [
              {
                title: "Reviewer",
                status: "running",
                currentFocus: "Check launch summary",
                boundAgents: ["agent-reviewer"],
              },
              {
                roleType: "executor",
                status: "waiting",
                boundExecutors: ["job-7788"],
              },
            ],
          },
          blockingSummary: "Compliance gate is holding the release.",
          blockers: {
            items: [
              {
                label: "Compliance gate",
                recovery: "Attach the final approval email.",
              },
            ],
          },
          outputsOverview: "launch-update.md; qa-checklist.json",
          evidenceOverview: "6 events | 2 artifacts",
          evidence: {
            latest: {
              type: "waiting",
              updatedAt: "2026-04-24T09:00:00.000Z",
            },
            sources: ["callback", "artifacts"],
          },
        })}
      />
    );

    expect(markup).toContain('data-testid="task-autopilot-panel"');
    expect(markup).toContain('data-testid="task-autopilot-execution"');
    expect(markup).toContain('data-testid="task-autopilot-blockers"');
    expect(markup).toContain('data-testid="task-autopilot-outputs"');
    expect(markup).toContain('data-testid="task-autopilot-evidence"');
    expect(markup).toContain("Review external copy");
    expect(markup).toContain("Reviewer is checking the launch summary.");
    expect(markup).toContain("Compliance gate is holding the release.");
    expect(markup).toContain("Attach the final approval email.");
    expect(markup).toContain("launch-update.md");
    expect(markup).toContain("qa-checklist.json");
    expect(markup).toMatch(/Waiting|Blocked|\u7b49\u5f85|\u963b\u585e/);
    expect(markup).toMatch(/callback|artifacts/i);
  });

  it("reads normalized fleet and live execution fields from the client store projection", () => {
    const markup = renderToStaticMarkup(
      <TaskAutopilotPanel
        detail={makeDetail(undefined, {
          destination: {
            goal: "Ship the governed rollout",
          },
          execution: {
            currentStepLabel: "Run rollout checks",
            currentStepStatus: "blocked",
            parallelBranchCount: 3,
            blockedReasons: [
              "Awaiting approval from the release owner.",
              "Executor callback is delayed.",
            ],
            intermediateDeliverables: [
              "rollout-checklist.md",
              "approval-packet.md",
            ],
            availableActions: [
              {
                id: "mission-1:resume",
                type: "resume",
                label: "resume",
                scope: "stage",
                enabled: true,
              },
              {
                id: "mission-1:replan",
                type: "replan",
                label: "replan",
                scope: "route",
                enabled: true,
              },
            ],
          },
          fleet: {
            roles: [
              {
                id: "planner",
                roleType: "planner",
                title: "Planner",
                status: "running",
                currentFocus: "Verify rollout guardrails",
                boundAgents: ["agent-planner"],
              },
              {
                id: "executor",
                roleType: "executor",
                title: "Executor",
                status: "waiting",
                boundExecutors: ["job-42"],
              },
              {
                id: "operator",
                roleType: "operator",
                title: "Operator",
                status: "blocked",
              },
            ],
            activeRoleCount: 2,
            blockedRoleCount: 1,
          },
        })}
      />
    );

    expect(markup).toContain('data-testid="task-autopilot-execution"');
    expect(markup).toContain('data-testid="task-autopilot-fleet"');
    expect(markup).toContain("Run rollout checks");
    expect(markup).toMatch(/Blocked|\u963b\u585e/);
    expect(markup).toMatch(/3 parallel branches|3 \u4e2a\u5e76\u884c\u5206\u652f/);
    expect(markup).toContain("Awaiting approval from the release owner.");
    expect(markup).toContain("Executor callback is delayed.");
    expect(markup).toContain("rollout-checklist.md");
    expect(markup).toContain("approval-packet.md");
    expect(markup).toMatch(/Actions: Resume; Replan|动作: 继续; 重规划/);
    expect(markup).toContain("Planner / Executor / Operator");
    expect(markup).toMatch(/2 active|2 \u4e2a\u6d3b\u8dc3\u89d2\u8272/);
    expect(markup).toMatch(/1 blocked|1 \u4e2a\u963b\u585e\u89d2\u8272/);
    expect(markup).toContain("agent-planner");
    expect(markup).toContain("job-42");
  });

  it("renders route selection, recovery, evidence, and explanation blocks from normalized autopilot summary fields", () => {
    const markup = renderToStaticMarkup(
      <TaskAutopilotPanel
        detail={makeDetail(undefined, {
          destination: {
            goal: "Recover the release lane",
          },
          route: {
            label: "Recovery lane",
            status: "running",
            takeoverPointIds: ["takeover-1"],
            selectedRouteId: "route-recovery:standard",
            recommendedRouteId: "route-recovery:deep",
            selection: {
              status: "replanned",
              mode: "runtime_replanned",
              changedBy: "runtime",
              changedAt: "2026-04-24T09:28:00.000Z",
              switchRequiresConfirmation: true,
            },
            candidateRoutes: [
              {
                id: "route-recovery:standard",
                label: "Standard recovery route",
                summary: "Keep current route while waiting on evidence.",
                mode: "standard",
                status: "running",
                selected: true,
                recommended: false,
                locked: true,
                estimatedDuration: "15m",
                estimatedCost: "$3",
                riskLevel: "medium",
                takeoverLoad: "medium",
              },
              {
                id: "route-recovery:deep",
                label: "Deep recovery route",
                summary: "Pause and verify every external side effect.",
                mode: "deep",
                status: "pending",
                selected: false,
                recommended: true,
                locked: false,
                estimatedDuration: "35m",
                estimatedCost: "$7",
                riskLevel: "low",
                takeoverLoad: "low",
              },
            ],
            changeReason: "Runtime switched to a safer route after repeated failure.",
            evidence: {
              lastEventType: "route.replanned",
              lastEventAt: "2026-04-24T09:29:00.000Z",
              events: [
                {
                  eventType: "route.replanned",
                  actor: "runtime",
                  reason: "Retry budget is exhausted.",
                  fromRouteId: "route-recovery:deep",
                  toRouteId: "route-recovery:standard",
                  at: "2026-04-24T09:29:00.000Z",
                },
              ],
            },
            replan: {
              active: true,
              reason: "Retry budget is exhausted.",
              fromRouteId: "route-recovery:deep",
              toRouteId: "route-recovery:standard",
              triggeredBy: "runtime",
            },
          },
          recovery: {
            state: "takeover-required",
            deviationCategory: "state-block",
            reason: "Automatic retry budget is exhausted.",
            attemptedActions: ["retry", "escalate"],
            suggestedActions: ["resume"],
            needsHuman: true,
            canAutoRecover: false,
          },
          evidence: {
            eventCount: 4,
            artifactCount: 1,
            trustLevel: "verified",
            latestEventType: "operator_action",
            gaps: ["Missing final owner acknowledgement."],
            timeline: [
              {
                id: "timeline-1",
                type: "operator_action",
                label: "Operator escalated the retry failure",
                detail: "Mission is waiting on a human decision.",
                status: "blocked",
                source: "runtime",
                time: "2026-04-24T09:30:00.000Z",
              },
            ],
          },
          explanation: {
            current: "The panel is surfacing the smallest safe next move.",
            nextSteps: ["Resume after owner approval"],
            recommendationReasons: ["The deep route keeps the audit trail intact."],
            remainingSteps: {
              currentStepKey: "execute",
              currentStepLabel: "Run execution",
              pendingSteps: [
                {
                  key: "approve",
                  label: "Approve the safer route",
                  status: "pending",
                  isCurrent: false,
                },
              ],
              parallelBranchCount: 1,
            },
            telemetrySignals: ["recovery.state:takeover-required"],
          },
        })}
      />
    );

    expect(markup).toContain('data-testid="task-autopilot-route"');
    expect(markup).toContain('data-testid="task-autopilot-recovery"');
    expect(markup).toContain('data-testid="task-autopilot-evidence"');
    expect(markup).toContain('data-testid="task-autopilot-explanation"');
    expect(markup).toMatch(
      /Selection Reason: Runtime switched to a safer route after repeated failure\.|切换原因: Runtime switched to a safer route after repeated failure\./
    );
    expect(markup).toMatch(/Selection: Replanned|选择状态: 已重规划/);
    expect(markup).toMatch(
      /Selection Mode: Runtime Replanned|选择模式: 运行时重规划/
    );
    expect(markup).toMatch(/Changed By: Runtime|变更方: 运行时/);
    expect(markup).toMatch(
      /Switch requires confirmation|切换需确认/
    );
    expect(markup).toMatch(/Route locked|路线已锁定/);
    expect(markup).toMatch(/Replan active|重规划已激活/);
    expect(markup).toMatch(
      /Route Evidence: Route Replanned|路线证据: 路线已重规划/
    );
    expect(markup).toMatch(
      /Route Events: Route Replanned, Runtime|路线事件: 路线已重规划, 运行时/
    );
    expect(markup).toContain("时长汇总: 已选 15m（范围 15m -&gt; 35m）");
    expect(markup).toContain("成本汇总: 已选 $3（范围 $3 -&gt; $7）");
    expect(markup).toContain("1 个接管点");
    expect(markup).toContain("剩余 1 步");
    expect(markup).toContain("剩余步骤: Approve the safer route");
    expect(markup).toContain("还有 1 个并行分支");
    expect(markup).toMatch(/State Block|状态阻塞/);
    expect(markup).toMatch(/Human handoff required|需要人工接手/);
    expect(markup).toMatch(/Auto recovery unavailable|自动恢复不可用/);
    expect(markup).toMatch(/Latest: Operator Action|最新事件: 人工操作/);
    expect(markup).toMatch(
      /Timeline: Operator escalated the retry failure|时间线: Operator escalated the retry failure/
    );
    expect(markup).toMatch(
      /Why: The deep route keeps the audit trail intact\.|原因: The deep route keeps the audit trail intact\./
    );
  });

  it("shows switchable route-selection guidance without collapsing it into a generic lock message", () => {
    const markup = renderToStaticMarkup(
      <TaskAutopilotPanel
        detail={makeDetail(undefined, {
          destination: {
            goal: "Pick the safest release route",
          },
          route: {
            label: "Route choice pending",
            selectionLocked: true,
            selection: {
              status: "alternatives-available",
              mode: "planner_default",
              locked: true,
              canSwitch: true,
              switchRequiresConfirmation: true,
              changedBy: "user",
              changedReason: "Choose the route before continuing.",
            },
            candidateRoutes: [
              {
                id: "route-choice:deep",
                label: "Deep route",
                summary: "Favor verification and auditability.",
                mode: "deep",
                status: "running",
                selected: true,
                recommended: true,
                locked: true,
                estimatedDuration: "35m",
                estimatedCost: "$7",
                riskLevel: "low",
                takeoverLoad: "low",
              },
            ],
          },
        })}
      />
    );

    expect(markup).toContain("Choose the route before continuing.");
    expect(markup).toMatch(
      /Route can switch with confirmation|可切换，需确认/
    );
  });

  it.skip("renders user-driven route replan semantics without relabeling them as runtime recovery", () => {
    const markup = renderToStaticMarkup(
      <TaskAutopilotPanel
        detail={makeDetail(undefined, {
          destination: {
            goal: "Switch to the safer route before external publish",
          },
          route: {
            label: "User replan lane",
            selectedRouteId: "route-user:safe",
            recommendedRouteId: "route-user:fast",
            selection: {
              status: "replanned",
              mode: "user_selected",
              changedBy: "user",
              changedReason: "Choose the safer route before external publish.",
            },
            candidateRoutes: [
              {
                id: "route-user:safe",
                label: "Safe route",
                summary: "Verify the publish path before dispatch.",
                mode: "standard",
                status: "running",
                selected: true,
                recommended: false,
                locked: false,
                estimatedDuration: "22m",
                estimatedCost: "$6",
                riskLevel: "low",
                takeoverLoad: "high",
              },
            ],
            evidence: {
              lastEventType: "route.replanned",
              events: [
                {
                  eventType: "route.replanned",
                  actor: "user",
                  fromRouteId: "route-user:fast",
                  toRouteId: "route-user:safe",
                  reason: "Choose the safer route before external publish.",
                  at: "2026-04-26T12:00:00.000Z",
                },
              ],
            },
            replan: {
              active: true,
              reason: "Choose the safer route before external publish.",
              fromRouteId: "route-user:fast",
              toRouteId: "route-user:safe",
              triggeredBy: "user",
            },
          },
        })}
      />
    );

    expect(markup).toMatch(/Replanned|已重规划/);
    expect(markup).toMatch(/Selection Mode: User Selected|选择模式: 人工指定/);
    expect(markup).toMatch(/Changed By: User|变更方: 用户/);
    expect(markup).toMatch(/Triggered By: User|触发方: 用户/);
    expect(markup).toContain("Choose the safer route before external publish.");
  });

  it("renders user-driven route replan semantics with the current localized labels", () => {
    const markup = renderToStaticMarkup(
      <TaskAutopilotPanel
        detail={makeDetail(undefined, {
          destination: {
            goal: "Switch to the safer route before external publish",
          },
          route: {
            label: "User replan lane",
            selectedRouteId: "route-user:safe",
            recommendedRouteId: "route-user:fast",
            selection: {
              status: "replanned",
              mode: "user_selected",
              changedBy: "user",
              changedReason: "Choose the safer route before external publish.",
            },
            candidateRoutes: [
              {
                id: "route-user:safe",
                label: "Safe route",
                summary: "Verify the publish path before dispatch.",
                mode: "standard",
                status: "running",
                selected: true,
                recommended: false,
                locked: false,
                estimatedDuration: "22m",
                estimatedCost: "$6",
                riskLevel: "low",
                takeoverLoad: "high",
              },
            ],
            evidence: {
              lastEventType: "route.replanned",
              events: [
                {
                  eventType: "route.replanned",
                  actor: "user",
                  fromRouteId: "route-user:fast",
                  toRouteId: "route-user:safe",
                  reason: "Choose the safer route before external publish.",
                  at: "2026-04-26T12:00:00.000Z",
                },
              ],
            },
            replan: {
              active: true,
              reason: "Choose the safer route before external publish.",
              fromRouteId: "route-user:fast",
              toRouteId: "route-user:safe",
              triggeredBy: "user",
            },
          },
        })}
      />
    );

    expect(markup).toContain("Choose the safer route before external publish.");
    expect(markup).toContain("选择状态: 已重规划");
    expect(markup).toContain("选择模式: 人工指定");
    expect(markup).toContain("变更方: 用户");
    expect(markup).toContain("触发方: 用户");
    expect(markup).toContain("重规划已激活");
  });

  it("adds risk counts, takeover counts, remaining steps, and eta cost summaries to the route block", () => {
    const markup = renderToStaticMarkup(
      <TaskAutopilotPanel
        detail={makeDetail(undefined, {
          destination: {
            goal: "Coordinate a safer route summary",
          },
          route: {
            label: "Planner summary lane",
            status: "running",
            progress: 58,
            currentStageLabel: "Compare route candidates",
            selectedRouteId: "route-summary:standard",
            recommendedRouteId: "route-summary:deep",
            takeoverPointIds: ["takeover-a", "takeover-b", "takeover-c"],
            riskPoints: [
              "External publish still needs owner approval.",
              "Audit packet is incomplete.",
            ],
            candidateRoutes: [
              {
                id: "route-summary:standard",
                label: "Standard route",
                summary: "Keep the route moving with one approval gate.",
                mode: "standard",
                status: "running",
                selected: true,
                recommended: false,
                estimatedDuration: "18m",
                estimatedCost: "$5",
                riskLevel: "medium",
                takeoverLoad: "medium",
              },
              {
                id: "route-summary:deep",
                label: "Deep route",
                summary: "Slow down and verify each external effect.",
                mode: "deep",
                status: "pending",
                selected: false,
                recommended: true,
                estimatedDuration: "42m",
                estimatedCost: "$11",
                riskLevel: "low",
                takeoverLoad: "low",
              },
            ],
          },
          explanation: {
            current: "Planner is comparing the safest publish path.",
            remainingSteps: {
              currentStepKey: "compare",
              currentStepLabel: "Compare route candidates",
              pendingSteps: [
                {
                  key: "choose",
                  label: "Choose the publish route",
                  status: "pending",
                  isCurrent: false,
                },
                {
                  key: "approve",
                  label: "Collect approval",
                  status: "pending",
                  isCurrent: false,
                },
              ],
              parallelBranchCount: 2,
            },
          },
        })}
      />
    );

    expect(markup).toContain('data-testid="task-autopilot-route"');
    expect(markup).toContain("Planner summary lane");
    expect(markup).toContain("时长汇总: 已选 18m（范围 18m -&gt; 42m）");
    expect(markup).toContain("成本汇总: 已选 $5（范围 $5 -&gt; $11）");
    expect(markup).toContain("2 个风险点");
    expect(markup).toContain("3 个接管点");
    expect(markup).toContain("剩余 2 步");
    expect(markup).toContain("剩余步骤: Choose the publish route; Collect approval");
    expect(markup).toContain("还有 2 个并行分支");
  });

  it("shows evidence trust when the latest event type is unavailable", () => {
    const markup = renderToStaticMarkup(
      <TaskAutopilotPanel
        detail={makeDetail(undefined, {
          destination: {
            goal: "Check evidence trust visibility",
          },
          evidence: {
            eventCount: 0,
            artifactCount: 0,
            trustLevel: "unverified",
            gaps: ["No runtime events captured yet."],
            timeline: [],
          },
        })}
      />
    );

    expect(markup).toContain('data-testid="task-autopilot-evidence"');
    expect(
      markup.includes("Unverified") || markup.includes("未验证")
    ).toBe(true);
    expect(
      markup.includes("Trust: Unverified") ||
        markup.includes("可信度: 未验证")
    ).toBe(true);
    expect(markup).toContain("No runtime events captured yet.");
  });

  it("renders destination confidence and missing-info impact without changing the destination layout", () => {
    const markup = renderToStaticMarkup(
      <TaskAutopilotPanel
        detail={makeDetail(undefined, {
          destination: {
            goal: "Ship the governed release brief",
            request: "Prepare the release brief and handoff notes.",
            taskType: "analysis",
            auxiliaryTaskTypes: ["generation"],
            confidence: {
              level: "medium",
              reason:
                "Waiting for the release owner confirmation before the route can unlock.",
              signals: [
                "owner-confirmation:pending",
                "external-write:human-gated",
              ],
            },
            constraints: ["Do not move the publish window."],
            deliverables: ["release-brief.md"],
            missingInfo: [
              "Confirm the release owner.",
              "Clarify whether external write is allowed.",
            ],
            impact:
              "Route selection will stay blocked until the release owner confirms the handoff.",
          },
        })}
      />
    );

    expect(markup).toContain('data-testid="task-autopilot-destination"');
    expect(markup).toContain("Ship the governed release brief");
    expect(markup).toMatch(/Task Type: Analysis|任务类型: 分析型/);
    expect(markup).toMatch(/Aux Types: Generation|辅助类型: 生成型/);
    expect(markup).toMatch(/Confidence: Medium|把握度: 中/);
    expect(markup).toMatch(
      /Reason: Waiting for the release owner confirmation before the route can unlock\.|依据: Waiting for the release owner confirmation before the route can unlock\./
    );
    expect(markup).toMatch(
      /Signals: owner-confirmation:pending; external-write:human-gated|信号: owner-confirmation:pending; external-write:human-gated/
    );
    expect(markup).toMatch(
      /Missing: Confirm the release owner\.; Clarify whether external write is allowed\.|缺失信息: Confirm the release owner\.; Clarify whether external write is allowed\./
    );
    expect(markup).toContain(
      "Route selection will stay blocked until the release owner confirms the handoff."
    );
    expect(markup).toMatch(/Needs Info|待澄清/);
  });

  it("renders structured destination missing-info details when flat impact fields are absent", () => {
    const markup = renderToStaticMarkup(
      <TaskAutopilotPanel
        detail={makeDetail(undefined, {
          destination: {
            goal: "Lock the governed destination",
            request: "Confirm the final workspace before continuing.",
            confidence: {
              level: "medium",
            },
            missingInfo: [],
            suggestedClarifications: [
              "Which workspace should the route continue in?",
            ],
            missingInfoDetails: [
              {
                item: "Confirm the target workspace.",
                impact:
                  "Execution remains blocked until the workspace is confirmed.",
                blocking: true,
                clarification: "Which workspace should the route continue in?",
              },
            ],
          },
        })}
      />
    );

    expect(markup).toContain('data-testid="task-autopilot-destination"');
    expect(markup).toContain("Lock the governed destination");
    expect(markup).toContain("Confirm the target workspace.");
    expect(markup).toContain(
      "Execution remains blocked until the workspace is confirmed."
    );
    expect(markup).toMatch(/Blocking|阻塞|闃诲/);
    expect(markup).toMatch(/Needs Info|待澄清|寰呮緞娓?/);
  });

  it("renders remaining parser destination fields as a readable cockpit loop", () => {
    const markup = renderToStaticMarkup(
      <TaskAutopilotPanel
        detail={makeDetail(undefined, {
          destination: {
            goal: "Close parser coverage for the cockpit destination",
            subGoals: [
              "Map parser aliases into the destination card.",
              "Keep clarifications visible for human follow-up.",
            ],
            limitations: ["Do not name a model."],
            acceptanceCriteria: [
              "Sub-goals are visible.",
              "Constraints and success criteria share the destination detail.",
            ],
            missingInfoDetails: [
              {
                item: "Confirm the owner for parser sign-off.",
                impact: "The lane cannot be checked off until ownership is clear.",
                blocking: true,
                question: "Who owns the parser sign-off?",
              },
            ],
            missingInfoClarifications: [
              "Should acceptance criteria be shown before deliverables?",
            ],
          },
        })}
      />
    );

    expect(markup).toContain('data-testid="task-autopilot-destination"');
    expect(markup).toContain("Close parser coverage for the cockpit destination");
    expect(markup).toMatch(
      /Sub-goals: Map parser aliases into the destination card\.; Keep clarifications visible for human follow-up\.|子目标: Map parser aliases into the destination card\.; Keep clarifications visible for human follow-up\./
    );
    expect(markup).toMatch(
      /Constraints: Do not name a model\.|\u7ea6\u675f: Do not name a model\./
    );
    expect(markup).toMatch(
      /Success: Sub-goals are visible\.; Constraints and success criteria share the destination detail\.|\u9a8c\u6536: Sub-goals are visible\.; Constraints and success criteria share the destination detail\./
    );
    expect(markup).toMatch(
      /Clarifications: Should acceptance criteria be shown before deliverables\?; Who owns the parser sign-off\?|澄清建议: Should acceptance criteria be shown before deliverables\?; Who owns the parser sign-off\?|婢勬竻寤鸿: Should acceptance criteria be shown before deliverables\?; Who owns the parser sign-off\?/
    );
    expect(markup).toContain("Confirm the owner for parser sign-off.");
    expect(markup).toContain(
      "The lane cannot be checked off until ownership is clear."
    );
    expect(markup).toMatch(/Needs Info|待澄清|寰呮緞娓?/);
  });

  it("renders structured explanation details from currentState and recommendationDetails", () => {
    const markup = renderToStaticMarkup(
      <TaskAutopilotPanel
        detail={makeDetail(undefined, {
          destination: {
            goal: "Explain the governed next step",
          },
          explanation: {
            currentState: {
              summary: "Runtime is holding on the approval gate.",
              driveState: "takeover-required",
              missionStatus: "waiting",
              workflowStatus: "running",
              workflowStage: "approval_gate",
              currentStageLabel: "Approve external write",
              routeSelectionStatus: "locked",
              selectedRouteId: "route-safe:standard",
              correlationTimelineId: "mission-1:current-state-timeline",
              sources: ["mission-runtime", "route-planner"],
              updatedAt: "2026-04-24T09:35:00.000Z",
            },
            recommendationDetails: [
              {
                kind: "route",
                summary: "Prefer the safer route until approval arrives.",
                source: "route-planner",
                routeId: "route-safe:deep",
                actionType: "replan",
                takeoverType: "approval",
                decisionId: "decision-approve-write",
                routeSelectionStatus: "alternatives-available",
                correlationTimelineId: "mission-1:timeline",
              },
            ],
            remainingSteps: {
              currentStepLabel: "Approve external write",
              pendingSteps: [
                {
                  key: "approve",
                  label: "Approve external write",
                  status: "pending",
                  isCurrent: false,
                },
                {
                  key: "resume",
                  label: "Resume the governed route",
                  status: "pending",
                  isCurrent: false,
                },
              ],
              parallelBranchCount: 2,
              replanChangeSummary: "Keep the verification branch open until sign-off lands.",
            },
          },
        })}
      />
    );

    expect(markup).toContain('data-testid="task-autopilot-explanation"');
    expect(markup).toContain("Runtime is holding on the approval gate.");
    expect(markup).toMatch(/State: Takeover Required|状态: .*接管/);
    expect(markup).toMatch(/Mission: Waiting|任务: Waiting/);
    expect(markup).toMatch(/Workflow: Running|工作流: Running/);
    expect(markup).toMatch(/Workflow Stage: Approval Gate|工作流阶段: Approval Gate/);
    expect(markup).toContain("Approve external write");
    expect(markup).toMatch(/Route Selection: Locked|路线选择: 已锁定/);
    expect(markup).toMatch(
      /Selected Route: route-safe:standard|已选路线: route-safe:standard/
    );
    expect(markup).toMatch(
      /Timeline: mission-1:current-state-timeline|时间线: mission-1:current-state-timeline/
    );
    expect(markup).toMatch(/Sources: Mission Runtime; Route Planner|来源: Mission Runtime; Route Planner/);
    expect(markup).toContain("Prefer the safer route until approval arrives.");
    expect(markup).toMatch(/Route: route-safe:deep|路线: route-safe:deep/);
    expect(markup).toMatch(/Decision: decision-approve-write|决策: decision-approve-write/);
    expect(markup).toMatch(
      /Selection: Alternatives Available|选择: 可切换候选路线/
    );
    expect(markup).toMatch(/Timeline: mission-1:timeline|时间线: mission-1:timeline/);
    expect(markup).toMatch(/Pending: Approve external write; Resume the governed route|待办: Approve external write; Resume the governed route/);
    expect(markup).toMatch(/Parallel branches: 2|并行分支: 2/);
    expect(markup).toContain(
      "Keep the verification branch open until sign-off lands."
    );
  });

  it("renders evidence correlation identifiers and indexed counts when present", () => {
    const markup = renderToStaticMarkup(
      <TaskAutopilotPanel
        detail={makeDetail(undefined, {
          destination: {
            goal: "Show evidence correlation coverage",
          },
          evidence: {
            eventCount: 5,
            artifactCount: 2,
            trustLevel: "verified",
            correlation: {
              workflowId: "workflow-1",
              replayId: "replay-42",
              sessionId: "session-7",
              timelineId: "timeline-55",
              selectedRouteId: "route-b",
              recommendedRouteId: "route-a",
              currentStepKey: "execute",
              routeIds: ["route-a", "route-b"],
              routeStageKeys: ["plan", "execute", "review"],
              runtimeEventIds: ["event-1", "event-2"],
              decisionIds: ["decision-1"],
              operatorActionIds: ["operator-1"],
              auditEventIds: ["audit-1", "audit-2"],
              lineageIds: ["lineage-1"],
            },
          },
        })}
      />
    );

    expect(markup).toContain('data-testid="task-autopilot-evidence"');
    expect(markup).toContain("Workflow: workflow-1");
    expect(markup).toContain("Replay: replay-42");
    expect(markup).toContain("Session: session-7");
    expect(markup).toContain("Timeline: timeline-55");
    expect(markup).toContain("Selected Route: route-b");
    expect(markup).toContain("Recommended Route: route-a");
    expect(markup).toContain("Current Step: Execute");
    expect(markup).toContain("Decision IDs: decision-1");
    expect(markup).toContain("Operator IDs: operator-1");
    expect(markup).toContain("Audit IDs: audit-1; audit-2");
    expect(markup).toContain("Lineage IDs: lineage-1");
    expect(markup).toContain("Routes: 2");
    expect(markup).toContain("Stages: 3");
    expect(markup).toContain("Runtime Events: 2");
    expect(markup).toContain("Decisions: 1");
    expect(markup).toContain("Operator Actions: 1");
    expect(markup).toContain("Audit Events: 2");
    expect(markup).toContain("Lineage: 1");
  });

  it("is wired into TaskDetailView without changing the surrounding layout", () => {
    const markup = renderToStaticMarkup(
      <TaskDetailView
        detail={makeDetail(undefined, {
          destination: {
            goal: "Publish the aligned task cockpit",
          },
          route: {
            label: "Minimal UI route",
            summary:
              "Add one readable panel and keep the page structure intact.",
          },
          driveState: {
            key: "executing",
          },
        })}
        decisionNote=""
        onDecisionNoteChange={() => {}}
        onLaunchDecision={() => {}}
      />
    );

    expect(markup).toContain('data-testid="task-autopilot-panel"');
    expect(markup).toContain("Publish the aligned task cockpit");
    expect(markup).toContain("Minimal UI route");
    expect(markup).toMatch(/Executing|\u6267\u884c\u4e2d/);
    expect(markup).toMatch(/RAG Context|RAG \u4e0a\u4e0b\u6587/);
  });

  it("renders the autopilot cockpit panel inside TaskDetailView cockpit mode", () => {
    const markup = renderToStaticMarkup(
      <TaskDetailView
        detail={makeDetail(undefined, {
          destination: {
            goal: "Keep cockpit mode aligned with the governed route",
          },
          route: {
            label: "Cockpit review route",
            summary: "Surface the active route context in the cockpit layout.",
          },
          driveState: {
            key: "reviewing",
          },
        })}
        variant="cockpit"
        decisionNote=""
        onDecisionNoteChange={() => {}}
        onLaunchDecision={() => {}}
      />
    );

    expect(markup).toContain('data-testid="task-autopilot-panel"');
    expect(markup).toContain("Keep cockpit mode aligned with the governed route");
    expect(markup).toContain("Cockpit review route");
    expect(markup).toMatch(/Reviewing|\u590d\u6838\u4e2d/);
  });

  it("stays hidden when detail.autopilotSummary is missing", () => {
    const markup = renderToStaticMarkup(
      <TaskDetailView
        detail={makeDetail()}
        decisionNote=""
        onDecisionNoteChange={() => {}}
        onLaunchDecision={() => {}}
      />
    );

    expect(markup).not.toContain("Autopilot Summary");
  });
});
