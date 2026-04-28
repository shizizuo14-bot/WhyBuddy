import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { useNLCommandStoreMock } = vi.hoisted(() => {
  const state = {
    commands: [] as any[],
    currentDialog: null as any,
    currentCommand: null as any,
    currentAnalysis: null as any,
    currentPlan: null as any,
    draftText: "",
    lastSubmission: null as any,
    loading: false,
    error: null as string | null,
    setDraftText: (value: string) => {
      state.draftText = value;
    },
    clearError: () => {
      state.error = null;
    },
  };

  const hook = ((selector: (value: typeof state) => unknown) =>
    selector(state)) as any;
  hook.setState = (partial: Partial<typeof state>) => {
    Object.assign(state, partial);
  };
  hook.getState = () => state;

  return {
    useNLCommandStoreMock: hook,
  };
});

import { OfficeTaskCockpit } from "./OfficeTaskCockpit";
import { useAppStore } from "@/lib/store";
import { useNLCommandStore } from "@/lib/nl-command-store";
import { useTasksStore } from "@/lib/tasks-store";
import { useTelemetryStore } from "@/lib/telemetry-store";
import { useWorkflowStore } from "@/lib/workflow-store";

vi.mock("antd", () => {
  function Panel({ children }: { children?: React.ReactNode }) {
    return <div>{children}</div>;
  }

  function Splitter({
    children,
    className,
  }: {
    children?: React.ReactNode;
    className?: string;
  }) {
    return <div className={className}>{children}</div>;
  }

  Splitter.Panel = Panel;

  return { Splitter };
});

vi.mock("@/lib/nl-command-store", () => ({
  selectTaskHubLaunchSession: (state: unknown) => state,
  useNLCommandStore: useNLCommandStoreMock,
}));

vi.mock("@/components/launch/UnifiedLaunchComposer", () => ({
  UnifiedLaunchComposer: ({
    bare,
    hideHeader,
    hideClarificationPanel,
  }: {
    bare?: boolean;
    hideHeader?: boolean;
    hideClarificationPanel?: boolean;
  }) => (
    <div
      data-testid="unified-launch-composer"
      data-bare={bare ? "true" : "false"}
      data-hide-header={hideHeader ? "true" : "false"}
      data-hide-clarification={hideClarificationPanel ? "true" : "false"}
    >
      mocked composer
    </div>
  ),
}));

vi.mock("@/components/nl-command/ClarificationPanel", () => ({
  ClarificationPanel: () => (
    <div data-testid="office-clarification-panel">mocked clarification</div>
  ),
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TabsTrigger: ({
    children,
    value,
  }: {
    children?: React.ReactNode;
    value: string;
  }) => <button data-value={value}>{children}</button>,
  TabsContent: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/ExecutorStatusPanel", () => ({
  ExecutorStatusPanel: () => null,
}));

vi.mock("@/components/ExecutorTerminalPanel", () => ({
  ExecutorTerminalPanel: () => null,
}));

vi.mock("@/components/tasks/ArtifactListBlock", () => ({
  ArtifactListBlock: () => null,
}));

vi.mock("@/components/tasks/ArtifactPreviewDialog", () => ({
  ArtifactPreviewDialog: () => null,
}));

vi.mock("@/components/tasks/CreateMissionDialog", () => ({
  CreateMissionDialog: () => null,
}));

vi.mock("@/components/tasks/TasksCockpitDetail", () => ({
  TasksCockpitDetail: () => <div>mocked task detail</div>,
}));

vi.mock("@/components/tasks/TasksQueueRail", () => ({
  TasksQueueRail: () => <div>mocked task queue</div>,
}));

vi.mock("./OfficeAgentInspectorPanel", () => ({
  OfficeAgentInspectorPanel: () => null,
}));

vi.mock("./OfficeWorkflowContextPanels", () => ({
  OfficeMemoryReportsPanel: () => null,
  OfficeWorkflowFlowPanel: () => null,
  OfficeWorkflowHistoryPanel: () => null,
}));

const noopAsync = async () => {};
const noopAsyncNullable = async () => null;
const noopToggle = () => {};

beforeEach(() => {
  useAppStore.setState({
    locale: "zh-CN",
    runtimeMode: "frontend",
    selectedPet: null,
    toggleConfig: noopToggle,
    setRuntimeMode: async () => {},
  });

  useTelemetryStore.setState({
    dashboardOpen: false,
    toggleDashboard: noopToggle,
  });

  useNLCommandStore.setState({
    currentDialog: null,
    currentCommand: null,
  });

  useWorkflowStore.setState({
    workflows: [],
    agents: [],
    currentWorkflow: null,
    currentWorkflowId: null,
    fetchWorkflowDetail: noopAsync,
    fetchWorkflows: noopAsync,
    setCurrentWorkflow: () => {},
  });

  useTasksStore.setState({
    tasks: [],
    detailsById: {},
    selectedTaskId: null,
    loading: false,
    ready: true,
    error: null,
    decisionNotes: {},
    operatorActionLoadingByMissionId: {},
    refresh: noopAsync,
    selectTask: () => {},
    createMission: async () => null,
    submitOperatorAction: noopAsyncNullable,
    setDecisionNote: () => {},
    launchDecision: noopAsyncNullable,
  });
});

describe("OfficeTaskCockpit", () => {
  it("renders a single central launch trigger and keeps launch guidance informational", () => {
    const markup = renderToStaticMarkup(<OfficeTaskCockpit />);

    expect(markup).toContain('data-testid="launch-panel-trigger"');
    expect(
      markup.match(/data-testid="launch-panel-trigger"/g)?.length
    ).toBe(1);
    expect(markup).not.toContain('data-testid="unified-launch-composer"');
    expect(markup).not.toContain('data-testid="office-clarification-panel"');
    expect(markup).toContain("独立弹层");
  });

  it("renders clarification as a separate panel above the launcher", () => {
    useNLCommandStore.setState({
      currentDialog: {
        dialogId: "dialog-1",
        commandId: "cmd-1",
        questions: [
          {
            questionId: "outcome:1",
            text: "补充目标",
            type: "free_text",
          },
        ],
        answers: [],
        clarificationRounds: 1,
        status: "active",
      },
      currentCommand: {
        commandId: "cmd-1",
        commandText: "Need more delivery detail",
        userId: "user-1",
        timestamp: Date.now(),
        status: "clarifying",
        parsedIntent: "Need more delivery detail",
        constraints: [],
        objectives: [],
        priority: "medium",
      },
    });

    const markup = renderToStaticMarkup(<OfficeTaskCockpit />);

    expect(markup).toContain('data-testid="office-clarification-panel"');
    expect(markup).toContain("补问进行中");
    expect(markup).toContain("先完成澄清，再继续主执行流");
    expect(markup).toContain("待补充 1 项");
    expect(markup).toContain("当前有补问信息待处理");
    expect(markup).toContain("展开辅助信息");
  });
});
