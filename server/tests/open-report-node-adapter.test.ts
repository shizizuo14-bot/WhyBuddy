import { describe, expect, it, vi } from "vitest";

import { executeOpenReportNode } from "../routes/node-adapters/open-report-node-adapter.js";

function makeDeps(overrides?: {
  permission?: {
    allowed: boolean;
    reason?: string;
    suggestion?: string;
  };
  withPermissionEngine?: boolean;
  workflowExists?: boolean;
  finalReportExists?: boolean;
  finalReportFileExists?: boolean;
  departmentReportFileExists?: boolean;
  replayEventCount?: number;
}) {
  return {
    getWorkflow: vi.fn((workflowId: string) =>
      overrides?.workflowExists === false ? undefined : { id: workflowId },
    ),
    readFinalWorkflowReport: vi.fn((workflowId: string) =>
      overrides?.finalReportExists === false ? null : { workflowId, kind: "final_workflow_report" },
    ),
    getFinalWorkflowReportFilePath: vi.fn((workflowId: string, format: "json" | "md") =>
      overrides?.finalReportFileExists === false ? null : `data/reports/${workflowId}.${format}`,
    ),
    getDepartmentReportFilePath: vi.fn(
      (managerId: string, workflowId: string, format: "json" | "md") =>
        overrides?.departmentReportFileExists === false
          ? null
          : `data/reports/${workflowId}-${managerId}.${format}`,
    ),
    getReplayTimeline: vi.fn(async (replayId: string) =>
      overrides?.replayEventCount === 0
        ? null
        : {
            missionId: replayId,
            eventCount: overrides?.replayEventCount ?? 3,
          },
    ),
    ...(overrides?.withPermissionEngine
      ? {
          permissionEngine: {
            checkPermission: vi.fn(() => ({
              allowed: overrides?.permission?.allowed ?? true,
              reason: overrides?.permission?.reason,
              suggestion: overrides?.permission?.suggestion,
            })),
          },
        }
      : {}),
  };
}

describe("executeOpenReportNode", () => {
  it("returns final report view target when report exists", async () => {
    const deps = makeDeps();

    const result = await executeOpenReportNode(
      {
        nodeType: "open_report",
        input: {
          reportType: "final_report",
          workflowId: "wf-1",
        },
      },
      deps,
    );

    expect(result.ok).toBe(true);
    expect(result.output.status).toBe("completed");
    expect(result.output.target).toEqual({
      kind: "report",
      href: "/api/workflows/wf-1/report",
      apiHref: "/api/workflows/wf-1/report",
      downloadHref: "/api/workflows/wf-1/report/download?format=md",
    });
  });

  it("returns department report download target", async () => {
    const deps = makeDeps();

    const result = await executeOpenReportNode(
      {
        nodeType: "open_report",
        input: {
          reportType: "department_report",
          workflowId: "wf-1",
          managerId: "mgr-1",
          format: "json",
        },
      },
      deps,
    );

    expect(result.ok).toBe(true);
    expect(result.output.target?.href).toBe(
      "/api/workflows/wf-1/report/department/mgr-1/download?format=json",
    );
    expect(result.output.mode).toBe("download");
  });

  it("returns replay target with UI href", async () => {
    const deps = makeDeps();

    const result = await executeOpenReportNode(
      {
        nodeType: "open_report",
        input: {
          reportType: "replay",
          workflowId: "wf-1",
          replayId: "replay-1",
        },
      },
      deps,
    );

    expect(result.ok).toBe(true);
    expect(result.output.target).toEqual({
      kind: "replay",
      href: "/replay/replay-1",
      uiHref: "/replay/replay-1",
      apiHref: "/api/replay/replay-1",
    });
  });

  it("returns denied when permission engine blocks access", async () => {
    const deps = makeDeps({
      withPermissionEngine: true,
      permission: {
        allowed: false,
        reason: "No allow rule found for api:call",
      },
    });

    const result = await executeOpenReportNode(
      {
        nodeType: "open_report",
        input: {
          reportType: "final_report",
          workflowId: "wf-1",
          agentId: "agent-1",
          token: "token-1",
        },
      },
      deps,
    );

    expect(result.ok).toBe(false);
    expect(result.output.status).toBe("denied");
    expect(result.output.error).toContain("No allow rule found");
  });

  it("returns not_found when final report is missing", async () => {
    const deps = makeDeps({
      finalReportExists: false,
    });

    const result = await executeOpenReportNode(
      {
        nodeType: "open_report",
        input: {
          reportType: "final_report",
          workflowId: "wf-1",
        },
      },
      deps,
    );

    expect(result.ok).toBe(false);
    expect(result.output.status).toBe("not_found");
    expect(result.output.error).toContain("Final report not found");
  });

  it("returns not_found when replay timeline is unavailable", async () => {
    const deps = makeDeps({
      replayEventCount: 0,
    });

    const result = await executeOpenReportNode(
      {
        nodeType: "open_report",
        input: {
          reportType: "replay",
          replayId: "replay-missing",
        },
      },
      deps,
    );

    expect(result.ok).toBe(false);
    expect(result.output.status).toBe("not_found");
    expect(result.output.error).toContain("Replay timeline not found");
  });
});
