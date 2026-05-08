import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { projectState } = vi.hoisted(() => ({
  projectState: {
    currentProjectId: null as string | null,
    projects: [] as any[],
  },
}));

import AutopilotRoutePage, {
  AutopilotSpecTreeHandoffPanel,
} from "./AutopilotRoutePage";
import { useAppStore } from "@/lib/store";

vi.mock("@/components/Scene3D", () => ({
  Scene3D: ({
    performanceProfile,
    projectId,
  }: {
    performanceProfile?: string;
    projectId?: string | null;
  }) => (
    <div
      data-testid="mock-scene-3d"
      data-performance-profile={performanceProfile}
      data-project-id={projectId ?? ""}
    />
  ),
}));

vi.mock("@/lib/project-store", () => ({
  useProjectStore: (selector: (state: typeof projectState) => unknown) =>
    selector(projectState),
}));

describe("AutopilotRoutePage", () => {
  beforeEach(() => {
    projectState.currentProjectId = null;
    projectState.projects = [];
    useAppStore.setState({ locale: "zh-CN" });
  });

  it("renders the 3D scene, scene HUD, and sequential workflow in Chinese", () => {
    projectState.currentProjectId = "project-1";
    projectState.projects = [
      {
        id: "project-1",
        name: "Permission System",
      },
    ];

    const markup = renderToStaticMarkup(<AutopilotRoutePage />);

    expect(markup).toContain('data-testid="autopilot-route-page"');
    expect(markup).toContain('data-testid="autopilot-topbar"');
    expect(markup).toContain('data-testid="autopilot-visual-stage"');
    expect(markup).toContain('data-testid="autopilot-scene-visual"');
    expect(markup).toContain('data-testid="mock-scene-3d"');
    expect(markup).toContain('data-project-id="project-1"');
    expect(markup).not.toContain('data-testid="autopilot-experience-rail"');
    expect(markup).toContain('data-testid="autopilot-mission-hud"');
    expect(markup).toContain('data-testid="autopilot-workflow-rail"');
    expect(markup).toContain('data-testid="autopilot-workflow-steps"');
    expect(markup).toContain('data-testid="autopilot-step-input"');
    expect(markup).toContain('data-testid="autopilot-runtime-console"');
    expect(markup).toContain('data-testid="autopilot-advanced-workbenches"');
    expect(markup).toContain('data-testid="blueprint-progress-panel"');
    expect(markup).toContain("Permission System");
    expect(markup).toContain("ant-steps-horizontal");
    expect(markup).toContain("输入");
    expect(markup).toContain("澄清");
    expect(markup).toContain("编排");
    expect(markup).toContain("选择");
    expect(markup).toContain("编组");
    expect(markup).toContain("3D/HUD");
    expect(markup).not.toContain("自动驾驶画布");
    expect(markup).not.toContain(
      'data-testid="autopilot-generate-clarifications-button"'
    );
    expect(markup).not.toContain(
      'data-testid="autopilot-generate-routeset-button"'
    );
    expect(markup).not.toContain("RouteSet generation and selection");
  });

  it("keeps the scene visible behind the operational workspace", () => {
    const markup = renderToStaticMarkup(<AutopilotRoutePage />);

    expect(markup).toContain("pointer-events-none absolute inset-0");
    expect(markup).toContain("bg-slate-950/82");
    expect(markup).toContain('data-autopilot-stage="input"');
    expect(markup).toContain('data-autopilot-route-state="pending"');
    expect(markup).toContain('data-autopilot-crew-state="pending"');
    expect(markup).toContain('data-testid="autopilot-runtime-console"');
    expect(markup).toContain("absolute bottom-4 left-4 right-4 z-10");
    expect(markup).toContain("absolute left-4 top-4 z-10");
    expect(markup).not.toContain("radial-gradient");
    expect(markup).not.toContain("linear-gradient(180deg");
    expect(markup).not.toContain("opacity-35");
  });

  it("switches the core chrome to English without mixing the main labels", () => {
    useAppStore.setState({ locale: "en-US" });

    const markup = renderToStaticMarkup(<AutopilotRoutePage />);

    expect(markup).not.toContain("Autopilot canvas");
    expect(markup).toContain("Project autopilot");
    expect(markup).toContain("ant-steps-horizontal");
    expect(markup).toContain("Input");
    expect(markup).toContain("Clarify");
    expect(markup).toContain("RouteSet");
    expect(markup).toContain("Select");
    expect(markup).toContain("Fabric");
    expect(markup).toContain("3D/HUD");
    expect(markup).toContain("Autopilot console");
    expect(markup).toContain("Advanced asset workbenches");
    expect(markup).toContain("Create intake");
    expect(markup).toContain("Execution goal");
    expect(markup).toContain("GitHub URLs");
    expect(markup).not.toContain("鑷姩椹鹃┒鐢诲竷");
  });

  it("explains that SPEC tree reviewing is a handoff state, not a stuck run", () => {
    const markup = renderToStaticMarkup(
      <AutopilotSpecTreeHandoffPanel
        locale="en-US"
        job={
          {
            id: "job-1",
            stage: "spec_tree",
            status: "reviewing",
          } as any
        }
        selection={
          {
            routeTitle: "Primary SPEC asset route",
          } as any
        }
        specTree={
          {
            nodes: [{ id: "root" }, { id: "node-1" }],
          } as any
        }
      />
    );

    expect(markup).toContain('data-testid="autopilot-spec-tree-handoff"');
    expect(markup).toContain(
      "RouteSet selected; SPEC tree draft is waiting for review"
    );
    expect(markup).toContain("not the end");
    expect(markup).toContain("2 node");
    expect(markup).toContain('href="/specs"');
    expect(markup).toContain("Open deduction workbench");
  });
});
