import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";

import type { TraceabilityMatrix } from "../../../../shared/blueprint/traceability-matrix/types.js";
import {
  computeMatrixCoverageStatus,
  recordMatrixLedgerEntries,
} from "./ledger-integration.js";

function matrix(input: {
  coveragePercent: number;
  gaps?: TraceabilityMatrix["coverage"]["gaps"];
}): TraceabilityMatrix {
  return {
    jobId: "job-1",
    generatedAt: "2026-06-08T00:00:00.000Z",
    entries: [],
    coverage: {
      totalRequirements: 3,
      coveredByDesign: 0,
      coveredByTasks: 0,
      coveredByEvidence: 0,
      coveredByTests: 0,
      coveragePercent: input.coveragePercent,
      gaps: input.gaps ?? [],
    },
  };
}

describe("traceability matrix ledger integration", () => {
  it("maps coverage thresholds to pass/warn/fail", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 51, max: 100 }),
        (coverage, threshold) => {
          const status = computeMatrixCoverageStatus(coverage, threshold);
          if (coverage >= threshold) expect(status).toBe("pass");
          else if (coverage >= 50) expect(status).toBe("warn");
          else expect(status).toBe("fail");
        },
      ),
    );
  });

  it("writes one coverage entry and one entry per gap", () => {
    const recordCheck = vi.fn();
    const emitEvent = vi.fn();
    const gaps = [
      {
        requirementId: "REQ-1",
        requirementTitle: "Login",
        missingLinks: ["test" as const],
      },
      {
        requirementId: "REQ-2",
        requirementTitle: "Billing",
        missingLinks: ["design" as const, "task" as const],
      },
    ];

    const result = recordMatrixLedgerEntries({
      matrix: matrix({ coveragePercent: 67, gaps }),
      checksLedger: { recordCheck } as any,
      emitEvent,
      coverageThreshold: 80,
    });

    expect(result.entriesWritten).toBe(3);
    expect(recordCheck).toHaveBeenCalledTimes(3);
    expect(recordCheck).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        checkType: "traceability_matrix",
        checkName: "matrix:coverage_check",
        status: "warn",
      }),
    );
    expect(recordCheck).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        checkName: "matrix:gap:REQ-1",
        status: "warn",
      }),
    );
    expect(emitEvent).toHaveBeenCalledWith(
      "evidence.recorded",
      expect.objectContaining({
        jobId: "job-1",
        artifactType: "traceability_matrix",
      }),
    );
  });

  it("keeps matrix generation non-blocking when ledger throws", () => {
    const result = recordMatrixLedgerEntries({
      matrix: matrix({ coveragePercent: 20 }),
      checksLedger: { recordCheck: vi.fn(() => { throw new Error("boom"); }) } as any,
      emitEvent: vi.fn(),
    });

    expect(result.entriesWritten).toBe(0);
    expect(result.errors).toHaveLength(1);
  });
});
