import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { projectState } = vi.hoisted(() => ({
  projectState: {
    currentProjectId: null as string | null,
    projects: [] as any[],
    specs: [] as any[],
    evidence: [] as any[],
    artifacts: [] as any[],
  },
}));

import SpecCenterPage from "./SpecCenterPage";

vi.mock("@/lib/project-store", () => ({
  useProjectStore: (selector: (state: typeof projectState) => unknown) =>
    selector(projectState),
}));

describe("SpecCenterPage", () => {
  beforeEach(() => {
    projectState.currentProjectId = null;
    projectState.projects = [];
    projectState.specs = [];
    projectState.evidence = [];
    projectState.artifacts = [];
  });

  it("renders current project spec versions and source counters", () => {
    projectState.currentProjectId = "project-1";
    projectState.projects = [
      {
        id: "project-1",
        name: "Permission System",
        goal: "Build RBAC with audit evidence.",
        status: "spec_ready",
        currentSpecId: "spec-2",
        createdAt: "2026-04-30T00:00:00.000Z",
        updatedAt: "2026-04-30T00:00:00.000Z",
      },
    ];
    projectState.specs = [
      {
        id: "spec-1",
        projectId: "project-1",
        version: 1,
        title: "Initial Spec",
        content: "# Initial Spec",
        status: "superseded",
        sourceMessageIds: [],
        sourceEvidenceIds: [],
        sourceArtifactIds: [],
        completeness: 0.4,
        createdAt: "2026-04-30T00:00:00.000Z",
      },
      {
        id: "spec-2",
        projectId: "project-1",
        version: 2,
        title: "Permission Spec",
        content: "# Permission Spec\nTrack audit evidence.",
        status: "accepted",
        sourceMessageIds: ["message-1"],
        sourceEvidenceIds: ["evidence-1", "evidence-2"],
        sourceArtifactIds: ["artifact-1"],
        completenessDetail: {
          score: 0.84,
          band: "usable",
          missingFields: [],
          sourceCoverage: {
            messages: 1,
            evidence: 2,
            artifacts: 1,
          },
        },
        createdAt: "2026-04-30T01:00:00.000Z",
      },
    ];
    projectState.evidence = [
      { id: "evidence-1", projectId: "project-1" },
      { id: "evidence-2", projectId: "project-1" },
    ];
    projectState.artifacts = [{ id: "artifact-1", projectId: "project-1" }];

    const markup = renderToStaticMarkup(<SpecCenterPage />);

    expect(markup).toContain('data-testid="spec-center-page"');
    expect(markup).toContain("Permission System");
    expect(markup).toContain("v2 · 权限规格");
    expect(markup).toContain("84% 完成");
    expect(markup).toContain("跟踪审计证据。");
    expect(markup).toContain("2 条证据");
    expect(markup).toContain("1 个资产");
    expect(markup).toContain("SPEC 执行概览");
    expect(markup).toContain("尚未生成 RouteSet");
    expect(markup).toContain('data-testid="spec-center-version-card"');
  });

  it("renders an empty state when no project is selected", () => {
    const markup = renderToStaticMarkup(<SpecCenterPage />);

    expect(markup).toContain("尚未选择项目");
    expect(markup).toContain("暂无规格草稿");
    expect(markup).not.toContain('data-testid="blueprint-progress-panel"');
    expect(markup).not.toContain(
      'data-testid="blueprint-clarification-strategy-summary"'
    );
  });
});
