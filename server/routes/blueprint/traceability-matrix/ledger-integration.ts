import type { BlueprintCheckStatus } from "../../../../shared/blueprint/checks-ledger/types.js";
import type { TraceabilityMatrix } from "../../../../shared/blueprint/traceability-matrix/types.js";
import type { ChecksLedgerService } from "../checks-ledger/types.js";

export interface MatrixLedgerIntegrationInput {
  matrix: TraceabilityMatrix;
  coverageThreshold?: number;
  checksLedger?: Pick<ChecksLedgerService, "recordCheck">;
  emitEvent?: (type: string, payload: Record<string, unknown>) => void;
}

export interface MatrixLedgerIntegrationResult {
  entriesWritten: number;
  errors: string[];
}

export function computeMatrixCoverageStatus(
  coveragePercent: number,
  threshold = 80,
): BlueprintCheckStatus {
  if (coveragePercent >= threshold) return "pass";
  if (coveragePercent >= 50) return "warn";
  return "fail";
}

function emitEvent(
  input: MatrixLedgerIntegrationInput,
  type: string,
  payload: Record<string, unknown>,
): void {
  try {
    input.emitEvent?.(type, payload);
  } catch {
    // Matrix evidence events are observational and must not block export.
  }
}

export function recordMatrixLedgerEntries(
  input: MatrixLedgerIntegrationInput,
): MatrixLedgerIntegrationResult {
  const threshold = input.coverageThreshold ?? 80;
  const errors: string[] = [];
  let entriesWritten = 0;

  const coverageStatus = computeMatrixCoverageStatus(
    input.matrix.coverage.coveragePercent,
    threshold,
  );
  const records = [
    {
      jobId: input.matrix.jobId,
      stage: "spec_docs" as const,
      checkType: "traceability_matrix" as const,
      checkName: "matrix:coverage_check",
      status: coverageStatus,
      validator: "traceability-matrix/ledger-integration.ts",
      output: JSON.stringify({
        coveragePercent: input.matrix.coverage.coveragePercent,
        threshold,
        gaps: input.matrix.coverage.gaps.length,
      }),
      metadata: {
        coveragePercent: input.matrix.coverage.coveragePercent,
        threshold,
        totalRequirements: input.matrix.coverage.totalRequirements,
      },
    },
    ...input.matrix.coverage.gaps.map((gap) => ({
      jobId: input.matrix.jobId,
      stage: "spec_docs" as const,
      checkType: "traceability_matrix" as const,
      checkName: `matrix:gap:${gap.requirementId}`,
      status: "warn" as const,
      validator: "traceability-matrix/ledger-integration.ts",
      output: JSON.stringify(gap),
      metadata: {
        requirementId: gap.requirementId,
        missingLinks: gap.missingLinks,
      },
    })),
  ];

  for (const record of records) {
    try {
      input.checksLedger?.recordCheck(record);
      entriesWritten += input.checksLedger ? 1 : 0;
      if (!input.checksLedger) {
        emitEvent(input, "checks.entry.recorded", {
          jobId: record.jobId,
          stage: record.stage,
          checkType: record.checkType,
          checkName: record.checkName,
          status: record.status,
        });
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  emitEvent(input, "evidence.recorded", {
    jobId: input.matrix.jobId,
    stage: "spec_docs",
    artifactType: "traceability_matrix",
    coveragePercent: input.matrix.coverage.coveragePercent,
    gapCount: input.matrix.coverage.gaps.length,
  });

  return { entriesWritten, errors };
}
