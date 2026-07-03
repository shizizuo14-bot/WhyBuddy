import { describe, expect, it } from "vitest";

import { deriveCrossRuntimeGraphSummary } from "../derive-cross-runtime-summary";
import type { CrossRuntimeGraph } from "@/lib/skills/orchestrator";
import { derivePublishClosureSummary } from "../derive-cross-runtime-summary";

describe("deriveCrossRuntimeGraphSummary", () => {
  it("summarizes allowed and blocked runtime graph edges for the page", () => {
    const graph: CrossRuntimeGraph = {
      edges: [
        {
          sourceSkill: "datamodel",
          targetSkill: "rbac",
          state: "allowed",
          evidenceKey: "DM_EVIDENCE:leave_request:rbac",
          raw: "datamodel->rbac:allowed",
        },
        {
          sourceSkill: "rbac",
          targetSkill: "page",
          state: "blocked",
          evidenceKey: "RBAC_EVIDENCE:policy:page",
          raw: "rbac->page:blocked",
        },
      ],
      bySkill: {},
      evidenceBySkill: {
        datamodel: ["DM_EVIDENCE:leave_request:rbac"],
        rbac: ["RBAC_EVIDENCE:policy:page"],
      },
    };

    expect(deriveCrossRuntimeGraphSummary(graph, { exampleLimit: 1 })).toEqual({
      edgeCount: 2,
      allowedCount: 1,
      blockedCount: 1,
      skillCount: 3,
      evidenceCount: 2,
      examples: [
        {
          sourceSkill: "datamodel",
          targetSkill: "rbac",
          state: "allowed",
          evidenceKey: "DM_EVIDENCE:leave_request:rbac",
        },
      ],
    });
  });

  it("returns null for empty graph input", () => {
    expect(deriveCrossRuntimeGraphSummary(null)).toBeNull();
    expect(
      deriveCrossRuntimeGraphSummary({ edges: [], bySkill: {}, evidenceBySkill: {} })
    ).toBeNull();
  });

  it("summarizes AppBundle publish runtime closure for the page", () => {
    expect(
      derivePublishClosureSummary({
        blocked: false,
        blockers: [],
        perSkillEvidence: {
          datamodel: { evidencePresent: true },
          rbac: { evidencePresent: true },
          workflow: { evidencePresent: true },
          page: { evidencePresent: true },
          aigc: { evidencePresent: true },
          appbundle: { evidencePresent: true },
        } as any,
        runtimeClosure: {
          skillsChecked: ["datamodel", "rbac", "workflow", "page", "aigc", "appbundle"],
          versionPinsChecked: true,
          perSkill: {} as any,
        },
      })
    ).toEqual({
      blocked: false,
      blockerCount: 0,
      evidencePresentCount: 6,
      skillCount: 6,
      versionPinsChecked: true,
      topBlockers: [],
    });
  });
});
