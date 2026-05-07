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
  });

  it("renders the RouteSet workspace with preflight controls over the 3D scene", () => {
    projectState.currentProjectId = "project-1";
    projectState.projects = [
      {
        id: "project-1",
        name: "Permission System",
      },
    ];

    const markup = renderToStaticMarkup(<AutopilotRoutePage />);

    expect(markup).toContain('data-testid="autopilot-route-page"');
    expect(markup).toContain('data-testid="autopilot-scene-visual"');
    expect(markup).toContain('data-testid="mock-scene-3d"');
    expect(markup).toContain('data-project-id="project-1"');
    expect(markup).toContain("RouteSet 生成与选择");
    expect(markup).toContain("Permission System");
    expect(markup).toContain('data-testid="autopilot-preflight"');
    expect(markup).toContain('data-testid="autopilot-readiness"');
    expect(markup).toContain(
      'data-testid="autopilot-generate-routeset-button"'
    );
    expect(markup).toContain('data-testid="autopilot-routeset-empty"');
    expect(markup).toContain("预检");
    expect(markup).toContain("输入、GitHub 源与澄清");
    expect(markup).toContain("创建输入");
    expect(markup).toContain("生成澄清");
    expect(markup).toContain("保存答案");
    expect(markup).toContain("生成 RouteSet");
    expect(markup).not.toContain("RouteSet generation and selection");
  });

  it("keeps the scene visual behind the interactive blueprint panel", () => {
    const markup = renderToStaticMarkup(<AutopilotRoutePage />);

    expect(markup).toContain("pointer-events-none");
    expect(markup).toContain("absolute inset-x-0 top-0 z-0");
    expect(markup).toContain("relative z-10");
    expect(markup).toContain('data-testid="blueprint-progress-panel"');
    expect(markup).toContain('data-testid="autopilot-project-context"');
    expect(markup).toContain("自动驾驶");
  });

  it("explains that SPEC tree reviewing is a handoff state, not a stuck run", () => {
    const markup = renderToStaticMarkup(
      <AutopilotSpecTreeHandoffPanel
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
    expect(markup).toContain("自动驾驶阶段已完成");
    expect(markup).toContain("不是后台卡住");
    expect(markup).toContain("SPEC 树草稿待确认");
    expect(markup).toContain("2 个");
    expect(markup).toContain('href="/specs"');
    expect(markup).toContain("进入推导工作台");
  });
});
