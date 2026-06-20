import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TELEMETRY_ROUTE_PYTHON_CONTRACT_VERSION,
  isTelemetryRoutePythonContractResult,
} from "../../../shared/telemetry/contracts.js";
import costRouter from "../cost.js";
import telemetryRouter from "../telemetry.js";

async function withApp(
  configure: (app: express.Express) => void,
  handler: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json());
  configure(app);
  const server = createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error?: Error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await handler(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function baseContract(operation: string, payload: Record<string, unknown>) {
  return {
    contractVersion: TELEMETRY_ROUTE_PYTHON_CONTRACT_VERSION,
    runtime: "python-contract",
    operation,
    route: "telemetry",
    ok: true,
    status: "completed",
    generatedAt: "2026-06-20T00:00:00.000Z",
    provenance: {
      source: "contract-test",
      synthetic: true,
      externalMonitoringRequest: false,
    },
    ...payload,
  };
}

describe("telemetry Python route contract", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts metrics, events, cost, and error envelopes with explicit source fields", () => {
    const metrics = baseContract("metrics", {
      metrics: {
        totalCalls: 2,
        errorCount: 0,
        latencyMs: { average: 12, p95: 18 },
        tokens: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          source: "synthetic",
        },
        cost: {
          amountUsd: 0.000045,
          estimatedUsd: 0.000045,
          actualUsd: null,
          source: "estimated",
          billingSource: "static_pricing_table",
          isEstimate: true,
          pricingSource: "contract_static_fixture",
        },
        updatedAt: 1710000000000,
      },
    });
    const events = baseContract("events", {
      events: [
        {
          eventId: "evt-contract-1",
          type: "telemetry:llm_call",
          timestamp: 1710000000001,
          severity: "info",
          message: "contract event",
          source: "synthetic",
        },
      ],
      eventCount: 1,
    });
    const cost = baseContract("cost", {
      route: "cost",
      cost: {
        amountUsd: 0.0015,
        estimatedUsd: 0.0015,
        actualUsd: null,
        source: "estimated",
        billingSource: "static_pricing_table",
        isEstimate: true,
      },
      tokens: {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        source: "estimated",
      },
    });
    const error = {
      ...baseContract("error", {
        route: "monitoring",
        error: {
          code: "telemetry_contract_probe_failed",
          message: "Telemetry projection failed.",
          retryable: true,
        },
        businessOutcome: {
          ok: true,
          telemetryErrorIgnored: true,
        },
      }),
      ok: false,
      status: "failed",
    };

    for (const result of [metrics, events, cost, error]) {
      expect(isTelemetryRoutePythonContractResult(result)).toBe(true);
      expect(result.provenance).toMatchObject({
        synthetic: true,
        externalMonitoringRequest: false,
      });
    }
  });

  it("rejects estimated/synthetic data that masquerades as actual billing", () => {
    const estimatedAsActual = baseContract("cost", {
      route: "cost",
      cost: {
        amountUsd: 0.0015,
        estimatedUsd: 0.0015,
        actualUsd: null,
        source: "actual",
        billingSource: "static_pricing_table",
        isEstimate: true,
      },
      tokens: {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        source: "estimated",
      },
    });
    const syntheticAsActual = baseContract("metrics", {
      metrics: {
        totalCalls: 0,
        errorCount: 0,
        latencyMs: { average: 0, p95: 0 },
        tokens: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          source: "actual",
        },
        cost: {
          amountUsd: 0,
          syntheticUsd: 0,
          actualUsd: null,
          source: "synthetic",
          billingSource: "synthetic_fixture",
          isEstimate: true,
        },
        updatedAt: 1710000000000,
      },
    });

    expect(isTelemetryRoutePythonContractResult(estimatedAsActual)).toBe(false);
    expect(isTelemetryRoutePythonContractResult(syntheticAsActual)).toBe(false);
  });

  it("telemetry route returns current metrics with estimated cost and synthetic token source", async () => {
    await withApp(
      (app) => app.use("/api/telemetry", telemetryRouter),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/telemetry/live`);

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.contract).toMatchObject({
          costSource: "estimated",
          tokenSource: "synthetic",
          actualCost: false,
        });
        expect(body.actualCost).toBeNull();
        expect(body.synthetic).toBe(true);
      },
    );
  });

  it("cost route returns estimated/synthetic accounting without actual billing fields", async () => {
    await withApp(
      (app) => app.use("/api/cost", costRouter),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/cost/live`);

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.contract).toMatchObject({
          costSource: "estimated",
          tokenSource: "synthetic",
          actualCost: false,
        });
        expect(body.actualCost).toBeNull();
        expect(body.totalCost).toBeGreaterThanOrEqual(0);
      },
    );
  });

  it("telemetry persistence failures do not change successful business response semantics", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await withApp(
      (app) => app.use("/api/telemetry", telemetryRouter),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/telemetry/contract/error-probe`, {
          method: "POST",
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toMatchObject({
          ok: true,
          telemetry: {
            ok: false,
            status: "failed",
            businessOutcome: {
              ok: true,
              telemetryErrorIgnored: true,
            },
          },
        });
        expect(isTelemetryRoutePythonContractResult(body.telemetry)).toBe(true);
      },
    );

    expect(consoleError).not.toHaveBeenCalled();
  });
});
