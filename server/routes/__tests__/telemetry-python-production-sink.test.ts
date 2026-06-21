import { describe, expect, it } from "vitest";

import {
  TELEMETRY_PRODUCTION_SINK_PYTHON_CONTRACT_VERSION,
  isTelemetryProductionSinkPythonContractResult,
} from "../../../shared/telemetry/contracts.js";

function buildSink(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: TELEMETRY_PRODUCTION_SINK_PYTHON_CONTRACT_VERSION,
    runtime: "python-telemetry-production-sink",
    ok: true,
    status: "delivered",
    sink: {
      kind: "otlp",
      configured: true,
      endpoint: "memory://otlp",
      externalEmit: false,
    },
    event: {
      eventId: "evt-production-sink-1",
      type: "telemetry:llm_call",
      severity: "info",
      message: "production sink smoke",
      timestamp: 1710000000000,
    },
    delivery: {
      attempted: true,
      emitted: false,
      eventId: "evt-production-sink-1",
    },
    provenance: {
      source: "python-telemetry-production-sink",
      synthetic: true,
      externalMonitoringRequest: false,
      externalSink: false,
    },
    error: null,
    ...overrides,
  };
}

describe("telemetry Python production sink contract", () => {
  it("accepts synthetic delivered sink smoke without external emission", () => {
    const sink = buildSink();

    expect(isTelemetryProductionSinkPythonContractResult(sink)).toBe(true);
    expect(sink.status).toBe("delivered");
    expect(sink.sink.externalEmit).toBe(false);
    expect(sink.delivery.emitted).toBe(false);
    expect(sink.provenance).toMatchObject({
      externalMonitoringRequest: false,
      externalSink: false,
    });
  });

  it("preserves missing config, timeout, unhealthy, and unknown as non-delivered", () => {
    const cases = [
      {
        status: "misconfigured",
        error: {
          code: "telemetry_sink_missing_config",
          message: "Telemetry production sink is not configured.",
          retryable: false,
        },
      },
      {
        status: "degraded",
        error: {
          code: "telemetry_sink_timeout",
          message: "Telemetry production sink timed out.",
          retryable: true,
        },
      },
      {
        status: "degraded",
        error: {
          code: "telemetry_sink_unhealthy",
          message: "Telemetry production sink reported unhealthy.",
          retryable: true,
        },
      },
      {
        status: "unknown",
        error: {
          code: "telemetry_sink_unknown",
          message: "Telemetry production sink state is unknown.",
          retryable: true,
        },
      },
    ];

    for (const item of cases) {
      const sink = buildSink({
        ok: false,
        status: item.status,
        delivery: {
          attempted: item.status !== "misconfigured",
          emitted: false,
          eventId: "evt-production-sink-1",
        },
        error: item.error,
      });

      expect(isTelemetryProductionSinkPythonContractResult(sink)).toBe(true);
      expect(sink.status).not.toBe("delivered");
      expect(sink.delivery.emitted).toBe(false);
    }
  });

  it("rejects degraded or unknown states that masquerade as delivered", () => {
    expect(
      isTelemetryProductionSinkPythonContractResult(
        buildSink({
          ok: true,
          status: "degraded",
          error: null,
        }),
      ),
    ).toBe(false);
    expect(
      isTelemetryProductionSinkPythonContractResult(
        buildSink({
          provenance: {
            source: "python-telemetry-production-sink",
            synthetic: true,
            externalMonitoringRequest: true,
            externalSink: true,
          },
        }),
      ),
    ).toBe(false);
    expect(
      isTelemetryProductionSinkPythonContractResult(
        buildSink({
          delivery: {
            attempted: true,
            emitted: true,
            eventId: "evt-production-sink-1",
          },
        }),
      ),
    ).toBe(false);
  });
});
