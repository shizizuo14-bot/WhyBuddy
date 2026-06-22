import { describe, expect, it } from "vitest";

import {
  AUDIT_RETENTION_EXPORT_PYTHON_CONTRACT_VERSION,
  isAuditRetentionExportPythonContractResult,
} from "../../shared/audit/contracts.js";
import {
  toAuditRetentionExportReport,
  validatePythonAuditRetentionExportResult,
} from "../audit/python-sink.js";

function runtimeResult(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: AUDIT_RETENTION_EXPORT_PYTHON_CONTRACT_VERSION,
    runtime: "python-audit-retention-export",
    ok: true,
    operation: "export",
    status: "exported",
    query: {
      filters: { result: "success" },
      page: { pageSize: 10, pageNum: 1 },
      total: 1,
    },
    event: {
      eventId: "ae-export-1",
      eventType: "AUDIT_EXPORT",
      timestamp: 1710000000000,
      source: "python-audit-retention-export",
      actor: { type: "system", id: "audit" },
      action: "audit.export.json",
      resource: { type: "audit", id: "audit-log" },
      result: "success",
      context: { requestId: "req-1" },
      metadata: { capabilityId: "audit.retention-export", ticket: "runtime-96" },
      lineageId: "lineage-audit-1",
    },
    retention: null,
    export: {
      manifestId: "audit-export-json-1",
      format: "json",
      entryCount: 1,
      eventIds: ["ae-export-1"],
      externalEmit: false,
      hash: "hash-1",
    },
    provenance: {
      source: "python-audit-retention-export",
      synthetic: true,
      externalAuditPlatform: false,
      boundary: "runtime",
      nodeOwnedCapabilities: ["anomaly", "compliance"],
    },
    error: null,
    ...overrides,
  };
}

describe("audit retention/export Python runtime boundary", () => {
  it("accepts retained and exported Python results with metadata and no external platform", () => {
    const exported = runtimeResult();
    const retained = runtimeResult({
      operation: "retention",
      status: "retained",
      export: null,
      retention: {
        decision: "keep",
        reason: "within_retention",
        eventId: "ae-export-1",
        externalDelete: false,
      },
    });

    expect(isAuditRetentionExportPythonContractResult(exported)).toBe(true);
    expect(isAuditRetentionExportPythonContractResult(retained)).toBe(true);
    expect(exported.event.metadata).toEqual({
      capabilityId: "audit.retention-export",
      ticket: "runtime-96",
    });
    expect(exported.export.externalEmit).toBe(false);
    expect(exported.provenance.externalAuditPlatform).toBe(false);
    expect(exported.provenance.nodeOwnedCapabilities).toEqual(["anomaly", "compliance"]);
  });

  it("maps retained and exported to stable Node reports", () => {
    const retained = validatePythonAuditRetentionExportResult(
      runtimeResult({
        operation: "retention",
        status: "retained",
        export: null,
        retention: {
          decision: "drop",
          reason: "retention_expired",
          eventId: "ae-export-1",
          externalDelete: false,
        },
      }),
    );
    const exported = validatePythonAuditRetentionExportResult(runtimeResult());

    expect(toAuditRetentionExportReport(retained)).toEqual({
      success: true,
      status: "retained",
      operation: "retention",
      eventId: "ae-export-1",
      retentionDecision: "drop",
    });
    expect(toAuditRetentionExportReport(exported)).toEqual({
      success: true,
      status: "exported",
      operation: "export",
      eventId: "ae-export-1",
      manifestId: "audit-export-json-1",
    });
  });

  it("keeps denied, degraded, and error visible instead of reporting exported", () => {
    for (const status of ["denied", "degraded", "error"] as const) {
      const result = validatePythonAuditRetentionExportResult(
        runtimeResult({
          ok: false,
          status,
          export: null,
          error: {
            code: `audit_export_${status}`,
            message: "private runtime detail",
            retryable: status !== "denied",
          },
        }),
      );
      const report = toAuditRetentionExportReport(result);

      expect(report.success).toBe(false);
      expect(report.status).toBe(status);
      expect(report.status).not.toBe("exported");
      expect(report.error).toEqual({
        code: `audit_export_${status}`,
        message: "Audit retention/export runtime failed.",
        retryable: status !== "denied",
      });
      expect(JSON.stringify(report)).not.toContain("private runtime detail");
    }
  });

  it("rejects failed results that pretend to have an export manifest", () => {
    expect(
      isAuditRetentionExportPythonContractResult(
        runtimeResult({
          ok: false,
          status: "denied",
          error: {
            code: "audit_export_denied",
            message: "denied",
            retryable: false,
          },
        }),
      ),
    ).toBe(false);
  });
});
