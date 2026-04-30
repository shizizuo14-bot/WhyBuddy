import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { MissionTaskSummary } from "@/lib/tasks-store";

import { TasksQueueRail } from "../TasksQueueRail";

function makeTask(overrides?: Partial<MissionTaskSummary>): MissionTaskSummary {
  const now = Date.now();
  return {
    id: "mission-1",
    title: "Compact cockpit queue task",
    kind: "analysis",
    sourceText: "Queue rail should remain a lightweight overlay.",
    status: "running",
    operatorState: "active",
    workflowStatus: "running",
    progress: 52,
    currentStageKey: "execute",
    currentStageLabel: "Execute",
    summary: "Queue rail should remain a lightweight overlay.",
    waitingFor: null,
    blocker: null,
    attempt: 1,
    latestOperatorAction: null,
    createdAt: now - 120_000,
    updatedAt: now - 15_000,
    startedAt: now - 100_000,
    completedAt: null,
    departmentLabels: ["Platform"],
    taskCount: 3,
    completedTaskCount: 1,
    messageCount: 0,
    activeAgentCount: 1,
    attachmentCount: 0,
    issueCount: 0,
    hasWarnings: false,
    lastSignal: null,
    ...overrides,
  };
}

describe("TasksQueueRail", () => {
  it("renders compact density as a lightweight floating rail", () => {
    const markup = renderToStaticMarkup(
      <TasksQueueRail
        tasks={[makeTask()]}
        totalCount={1}
        activeTaskId="mission-1"
        highlightedTaskId={null}
        loading={false}
        ready
        error={null}
        search=""
        onSearchChange={() => {}}
        onSelectTask={vi.fn()}
        onRefresh={vi.fn()}
        density="compact"
      />
    );

    expect(markup).toContain('data-visual-role="cockpit-queue-rail"');
    expect(markup).toContain('data-density="compact"');
    expect(markup).toContain("bg-white/42");
    expect(markup).toContain("shadow-[0_10px_24px_rgba(15,23,42,0.06)]");
    expect(markup).not.toContain("bg-accent");
    expect(markup).not.toContain("shadow-[0_16px_40px_rgba(15,23,42,0.14)]");
  });

  it("renders project, route, spec and source chips on regular task cards", () => {
    const markup = renderToStaticMarkup(
      <TasksQueueRail
        tasks={[makeTask()]}
        totalCount={1}
        activeTaskId="mission-1"
        highlightedTaskId={null}
        loading={false}
        ready
        error={null}
        search=""
        onSearchChange={() => {}}
        onSelectTask={vi.fn()}
        onRefresh={vi.fn()}
        projectMetaByTaskId={{
          "mission-1": {
            projectName: "Permission System",
            routeTitle: "Spec-first route",
            specTitle: "Permission Spec",
            sourceLabel: "Project archive",
          },
        }}
      />
    );

    expect(markup).toContain('data-testid="task-project-meta-mission-1"');
    expect(markup).toContain("项目 Permission System");
    expect(markup).toContain("路线 Spec-first route");
    expect(markup).toContain("Spec Permission Spec");
    expect(markup).toContain("Project archive");
  });
});
