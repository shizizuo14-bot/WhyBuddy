/**
 * 遥测 REST API 路由
 *
 * GET /api/telemetry/live    — 返回当前 Mission 的实时指标快照
 * GET /api/telemetry/history — 返回最近 10 次 Mission 的历史指标摘要
 */

import { Router } from "express";
import { telemetryStore } from "../core/telemetry-store.js";

const router = Router();

const TELEMETRY_ROUTE_CONTRACT = {
  costSource: "estimated",
  tokenSource: "synthetic",
  actualCost: false,
} as const;

function withTelemetryRouteContract<T extends object>(snapshot: T) {
  return {
    ...snapshot,
    contract: TELEMETRY_ROUTE_CONTRACT,
    synthetic: true,
    actualCost: null,
  };
}

// GET /api/telemetry/live — 返回当前 Mission 实时快照
router.get("/live", (_req, res) => {
  res.json(withTelemetryRouteContract(telemetryStore.getSnapshot()));
});

// GET /api/telemetry/history — 返回最近 Mission 历史摘要
router.get("/history", (_req, res) => {
  res.json(telemetryStore.getHistory());
});

router.post("/contract/error-probe", (_req, res) => {
  res.json({
    ok: true,
    telemetry: {
      contractVersion: "telemetry-route.runtime.v1",
      runtime: "python-contract",
      operation: "error",
      route: "monitoring",
      ok: false,
      status: "failed",
      generatedAt: new Date(0).toISOString(),
      provenance: {
        source: "node-route-contract",
        synthetic: true,
        externalMonitoringRequest: false,
      },
      error: {
        code: "telemetry_contract_probe_failed",
        message: "Telemetry contract probe failed without changing business success.",
        retryable: true,
      },
      businessOutcome: {
        ok: true,
        telemetryErrorIgnored: true,
      },
    },
  });
});

export default router;
