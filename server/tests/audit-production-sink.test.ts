import { describe, expect, it } from "vitest";

import {
  AUDIT_PRODUCTION_SINK_PYTHON_CONTRACT_VERSION,
  isAuditProductionSinkPythonContractResult,
} from "../../shared/audit/contracts.js";
import {
  toAuditSinkCollectorReport,
  validatePythonAuditProductionSinkResult,
} from "../audit/python-sink.js";

function buildSink(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: AUDIT_PRODUCTION_SINK_PYTHON_CONTRACT_VERSION,
    runtime: "python-audit-production-sink",
    ok: true,
    status: "written",
    sink: {
      kind: "node-audit-store",
      configured: true,
      storeId: "local-audit-chain",
      externalEmit: false,
    },
    event: {
      eventId: "ae-production-sink-1",
      eventType: "AGENT_EXECUTED",
      timestamp: 1710000000000,
      source: "python-audit-production-sink",
      actor: { type: "agent", id: "agent-1" },
      action: "execute_task",
      resource: { type: "mission", id: "mission-1" },
      result: "success",
      context: { sessionId: "sess-1", requestId: "req-1" },
      metadata: { capabilityId: "audit.event" },
    },
    write: {
      attempted: true,
      stored: true,
      eventId: "ae-production-sink-1",
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
    error: null,
    ...overrides,
  };
}

describe("audit Python production sink contract", () => {
  it("accepts synthetic write success without external audit platform emission", () => {
    const sink = buildSink();

    expect(isAuditProductionSinkPythonContractResult(sink)).toBe(true);
    expect(sink.status).toBe("written");
    expect(sink.sink.externalEmit).toBe(false);
    expect(sink.write.stored).toBe(true);
    expect(sink.provenance.externalAuditPlatform).toBe(false);
    expect(sink.degradedCapabilities).toEqual({
      retention: "node-owned",
      export: "node-owned",
      anomaly: "node-owned",
      compliance: "node-owned",
    });
  });

  it("preserves store failure, degraded, and missing config as observable failures", () => {
    const cases = [
      {
        status: "failed",
        attempted: true,
        error: {
          code: "audit_sink_store_failure",
          message: "Audit production sink store write failed.",
          retryable: true,
        },
      },
      {
        status: "degraded",
        attempted: true,
        error: {
          code: "audit_sink_degraded",
          message: "Audit production sink is degraded.",
          retryable: true,
        },
      },
      {
        status: "misconfigured",
        attempted: false,
        error: {
          code: "audit_sink_missing_config",
          message: "Audit production sink is not configured.",
          retryable: false,
        },
      },
    ];

    for (const item of cases) {
      const sink = buildSink({
        ok: false,
        status: item.status,
        sink: {
          kind: "node-audit-store",
          configured: item.status !== "misconfigured",
          externalEmit: false,
        },
        write: {
          attempted: item.attempted,
          stored: false,
          eventId: "ae-production-sink-1",
        },
        error: item.error,
      });

      expect(isAuditProductionSinkPythonContractResult(sink)).toBe(true);
      expect(sink.status).not.toBe("written");
      expect(sink.write.stored).toBe(false);
      expect(sink.sink.externalEmit).toBe(false);
    }
  });

  it("rejects degraded or externally emitted sink results that masquerade as healthy", () => {
    expect(
      isAuditProductionSinkPythonContractResult(
        buildSink({
          ok: true,
          status: "degraded",
          error: null,
        }),
      ),
    ).toBe(false);
    expect(
      isAuditProductionSinkPythonContractResult(
        buildSink({
          sink: {
            kind: "node-audit-store",
            configured: true,
            externalEmit: true,
          },
        }),
      ),
    ).toBe(false);
    expect(
      isAuditProductionSinkPythonContractResult(
        buildSink({
          provenance: {
            source: "python-audit-production-sink",
            synthetic: true,
            externalAuditPlatform: true,
            nodeOwnedCapabilities: ["retention", "export", "anomaly", "compliance"],
          },
        }),
      ),
    ).toBe(false);
  });

  it("maps Python sink failures to collector-visible reports instead of swallowing them", () => {
    const sink = validatePythonAuditProductionSinkResult(
      buildSink({
        ok: false,
        status: "failed",
        write: {
          attempted: true,
          stored: false,
          eventId: "ae-production-sink-1",
        },
        error: {
          code: "audit_sink_store_failure",
          message: "disk path C:/private/audit-store failed",
          retryable: true,
        },
      }),
    );

    const report = toAuditSinkCollectorReport(sink);

    expect(report).toEqual({
      success: false,
      status: "failed",
      eventId: "ae-production-sink-1",
      error: {
        code: "audit_sink_store_failure",
        message: "Audit production sink failed.",
        retryable: true,
      },
    });
    expect(JSON.stringify(report)).not.toContain("C:/private/audit-store");
  });
});
