import { describe, expect, it } from "vitest";

import type { BlueprintGenerationJob } from "../../shared/blueprint/contracts.js";
import { buildV4SubsystemDiagnostics } from "../blueprint.js";

function job(overrides: Partial<BlueprintGenerationJob> = {}): BlueprintGenerationJob {
  return {
    id: "job-1",
    request: { targetText: "Build", githubUrls: [] },
    status: "completed",
    stage: "effect_preview",
    version: "1",
    createdAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-08T00:00:00.000Z",
    artifacts: [],
    events: [],
    ...overrides,
  };
}

describe("buildV4SubsystemDiagnostics", () => {
  it("reports companion, preview, and matrix health additively", () => {
    const diagnostics = buildV4SubsystemDiagnostics({
      ctx: {
        companionLayer: {} as any,
        previewAuditService: {} as any,
        traceabilityMatrixService: {} as any,
      },
      jobs: [
        job({
          companionFindings: [
            {
              id: "finding-1",
              role: "critic",
              stage: "spec_docs",
              targetArtifactId: "job-1",
              findings: ["citation missing"],
              severity: "error",
              suggestedActions: [],
              citations: [],
              timestamp: "2026-06-08T00:00:00.000Z",
            } as any,
          ],
          checksLedger: [
            {
              checkType: "preview_audit",
              status: "fail",
              output: "fake success",
            } as any,
            {
              checkType: "traceability_matrix",
              status: "warn",
            } as any,
          ],
        }),
      ],
    });

    expect(diagnostics.companion).toMatchObject({
      enabled: true,
      healthy: false,
      findingCount: 1,
      lastError: "citation missing",
    });
    expect(diagnostics.preview).toMatchObject({
      enabled: true,
      healthy: false,
      auditCheckCount: 1,
      lastError: "fake success",
    });
    expect(diagnostics.matrix).toMatchObject({
      enabled: true,
      healthy: true,
      ledgerEntryCount: 1,
      lastError: null,
    });
  });
});
