import { describe, expect, it } from "vitest";

import {
  toAuditSinkCollectorReport,
  validatePythonAuditProductionSinkResult,
} from "../audit/python-sink.js";
import { AuditEventType } from "../../shared/audit/contracts.js";

function runtimeSink(status: "written" | "failed" | "degraded" | "misconfigured") {
  const ok = status === "written";
  return {
    contractVersion: "audit-production-sink.runtime.v1",
    runtime: "python-audit-production-sink",
    ok,
    status,
    sink: {
      kind: "node-audit-store",
      configured: status !== "misconfigured",
      externalEmit: false,
    },
    event: {
      eventId: "ae-runtime-boundary",
      eventType: AuditEventType.AGENT_EXECUTED,
      timestamp: 1710000000000,
      source: "python-audit-production-sink",
      actor: { type: "agent", id: "agent-1" },
      action: "execute_task",
      resource: { type: "mission", id: "mission-1" },
      result: "success",
      context: { sessionId: "sess-1" },
    },
    write: {
      attempted: status !== "misconfigured",
      stored: ok,
      eventId: "ae-runtime-boundary",
    },
    provenance: {
      source: "python-audit-production-sink",
      synthetic: true,
      externalAuditPlatform: false,
      nodeOwnedCapabilities: ["retention", "export", "anomaly", "compliance"],
    },
    degradedCapabilities: {
      retention: "node-owned",
      export: "node-owned",
      anomaly: "node-owned",
      compliance: "node-owned",
    },
    error: ok
      ? null
      : {
          code:
            status === "misconfigured"
              ? "audit_sink_missing_config"
              : status === "degraded"
                ? "audit_sink_degraded"
                : "audit_sink_store_failure",
          message: "private runtime detail",
          retryable: status !== "misconfigured",
        },
  };
}

describe("audit event Python runtime boundary", () => {
  it("reports Python write success as stored without migrating retention/export/anomaly/compliance", () => {
    const result = validatePythonAuditProductionSinkResult(runtimeSink("written"));
    const report = toAuditSinkCollectorReport(result);

    expect(report).toEqual({
      success: true,
      status: "written",
      eventId: "ae-runtime-boundary",
    });
    expect(result.degradedCapabilities).toEqual({
      retention: "node-owned",
      export: "node-owned",
      anomaly: "node-owned",
      compliance: "node-owned",
    });
  });

  it("reports Python audit failures visibly instead of treating business flow as success", () => {
    for (const status of ["failed", "degraded", "misconfigured"] as const) {
      const result = validatePythonAuditProductionSinkResult(runtimeSink(status));
      const report = toAuditSinkCollectorReport(result);

      expect(report.success).toBe(false);
      expect(report.status).toBe(status);
      expect(report.eventId).toBe("ae-runtime-boundary");
      expect(report.error?.code).toMatch(/^audit_sink_/);
      expect(report.error?.message).toBe("Audit production sink failed.");
    }
  });
});
