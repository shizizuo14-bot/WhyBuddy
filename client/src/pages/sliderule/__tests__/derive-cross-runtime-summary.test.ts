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
      closureId: undefined,
      closureHash: undefined,
      stableDigest: undefined,
      tierCounts: {
        hard_blocker: 0,
        warning: 0,
        info: 0,
      },
      topBlockers: [],
    });
  });

  it("surfaces AppBundle closure digest and tier counts for the page", () => {
    expect(
      derivePublishClosureSummary(
        {
          blocked: true,
          blockers: [
            {
              code: "APPBUNDLE_RUNTIME_CLOSURE_BLOCKED",
              severity: "error",
              path: "page",
              message: "Missing Page runtime evidence for task view consistency.",
            },
          ],
          perSkillEvidence: {
            page: { evidencePresent: false },
            appbundle: { evidencePresent: true },
          } as any,
          runtimeClosure: {
            skillsChecked: ["page", "appbundle"],
            versionPinsChecked: false,
            perSkill: {} as any,
          },
          closureId: "appbundle:app_test@1.0.0:runtime-closure",
          closureHash: "feedface",
          generatedAt: "2026-07-03T00:00:00.000Z",
          stableDigest: "deadbeef",
          findingsByTier: {
            hard_blocker: [
              {
                code: "APPBUNDLE_RUNTIME_CLOSURE_BLOCKED",
                severity: "error",
                path: "page",
                message: "Missing Page runtime evidence for task view consistency.",
              },
            ],
            warning: [
              {
                code: "APPBUNDLE_RUNTIME_AIGC_OPTIONAL",
                severity: "warning",
                path: "aigc",
                message: "AIGC runtime evidence is optional for this app.",
              },
            ],
            info: [
              {
                code: "APPBUNDLE_RUNTIME_EVIDENCE_PRESENT",
                severity: "warning",
                path: "appbundle",
                message: "Runtime evidence present for appbundle.",
              },
            ],
          },
        },
        { blockerLimit: 1 }
      )
    ).toEqual({
      blocked: true,
      blockerCount: 1,
      evidencePresentCount: 1,
      skillCount: 2,
      versionPinsChecked: false,
      closureId: "appbundle:app_test@1.0.0:runtime-closure",
      closureHash: "feedface",
      stableDigest: "deadbeef",
      tierCounts: {
        hard_blocker: 1,
        warning: 1,
        info: 1,
      },
      topBlockers: [
        {
          code: "APPBUNDLE_RUNTIME_CLOSURE_BLOCKED",
          path: "page",
        },
      ],
    });
  });
});
