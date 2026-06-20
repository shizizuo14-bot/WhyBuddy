import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _dump(result):
    return result.model_dump(mode="json")


def test_python_contract_covers_metrics_events_cost_and_error_shapes():
    from services.telemetry_runtime import (
        TELEMETRY_ROUTE_CONTRACT_VERSION,
        execute_telemetry_route_contract,
    )

    metrics = _dump(
        execute_telemetry_route_contract(
            {
                "operation": "metrics",
                "route": "telemetry",
                "snapshot": {
                    "totalTokensIn": 12,
                    "totalTokensOut": 8,
                    "totalCost": 0.00042,
                    "totalCalls": 2,
                    "activeAgentCount": 1,
                    "errorCount": 0,
                    "updatedAt": 1710000000000,
                },
            }
        )
    )
    events = _dump(
        execute_telemetry_route_contract(
            {
                "operation": "events",
                "route": "telemetry",
                "events": [
                    {
                        "eventId": "evt-contract-1",
                        "type": "telemetry:llm_call",
                        "timestamp": 1710000000001,
                        "severity": "info",
                        "message": "contract event",
                    }
                ],
            }
        )
    )
    cost = _dump(
        execute_telemetry_route_contract(
            {
                "operation": "cost",
                "route": "cost",
                "cost": {
                    "amountUsd": 0.0015,
                    "estimatedUsd": 0.0015,
                    "actualUsd": None,
                    "source": "estimated",
                    "billingSource": "static_pricing_table",
                    "isEstimate": True,
                    "pricingSource": "contract_static_fixture",
                },
                "tokens": {
                    "promptTokens": 1000,
                    "completionTokens": 500,
                    "totalTokens": 1500,
                    "source": "estimated",
                },
            }
        )
    )
    error = _dump(
        execute_telemetry_route_contract(
            {
                "operation": "error",
                "route": "monitoring",
                "error": {
                    "code": "telemetry_contract_probe_failed",
                    "message": "Telemetry projection failed but the business response stays successful.",
                    "retryable": True,
                },
                "businessOutcome": {
                    "ok": True,
                    "telemetryErrorIgnored": True,
                },
            }
        )
    )

    assert metrics["contractVersion"] == TELEMETRY_ROUTE_CONTRACT_VERSION
    assert metrics["operation"] == "metrics"
    assert metrics["ok"] is True
    assert metrics["metrics"]["tokens"] == {
        "promptTokens": 12,
        "completionTokens": 8,
        "totalTokens": 20,
        "source": "synthetic",
    }
    assert metrics["metrics"]["cost"]["source"] == "estimated"
    assert metrics["metrics"]["cost"]["actualUsd"] is None

    assert events["operation"] == "events"
    assert events["events"][0]["source"] == "synthetic"
    assert events["eventCount"] == 1

    assert cost["operation"] == "cost"
    assert cost["cost"]["source"] == "estimated"
    assert cost["cost"]["estimatedUsd"] == pytest.approx(0.0015)
    assert cost["cost"]["actualUsd"] is None
    assert cost["tokens"]["source"] == "estimated"

    assert error["operation"] == "error"
    assert error["ok"] is False
    assert error["status"] == "failed"
    assert error["businessOutcome"] == {
        "ok": True,
        "telemetryErrorIgnored": True,
    }


def test_contract_rejects_estimated_cost_masquerading_as_actual():
    from services.telemetry_runtime import execute_telemetry_route_contract

    with pytest.raises(ValueError, match="actual cost"):
        execute_telemetry_route_contract(
            {
                "operation": "cost",
                "route": "cost",
                "cost": {
                    "amountUsd": 0.0015,
                    "estimatedUsd": 0.0015,
                    "actualUsd": None,
                    "source": "actual",
                    "billingSource": "static_pricing_table",
                    "isEstimate": True,
                },
                "tokens": {
                    "promptTokens": 1000,
                    "completionTokens": 500,
                    "totalTokens": 1500,
                    "source": "estimated",
                },
            }
        )


def test_contract_rejects_token_source_mismatch():
    from services.telemetry_runtime import execute_telemetry_route_contract

    with pytest.raises(ValueError, match="totalTokens"):
        execute_telemetry_route_contract(
            {
                "operation": "cost",
                "route": "cost",
                "cost": {
                    "amountUsd": 0.0,
                    "syntheticUsd": 0.0,
                    "actualUsd": None,
                    "source": "synthetic",
                    "billingSource": "synthetic_fixture",
                    "isEstimate": True,
                },
                "tokens": {
                    "promptTokens": 4,
                    "completionTokens": 5,
                    "totalTokens": 99,
                    "source": "synthetic",
                },
            }
        )
