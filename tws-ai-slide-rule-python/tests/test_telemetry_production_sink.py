"""Production sink smoke tests for Python telemetry evidence.

The sink is synthetic. It proves production wiring states are diagnosable
without sending telemetry to Datadog, OTLP, billing, or any external service.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.telemetry import execute_telemetry_production_sink  # noqa: E402


def test_production_sink_success_keeps_provenance_and_no_external_emit():
    result = execute_telemetry_production_sink(
        {
            "sink": {"kind": "otlp", "configured": True, "endpoint": "memory://otlp"},
            "event": {
                "eventId": "evt-production-sink-1",
                "type": "telemetry:llm_call",
                "severity": "info",
                "message": "production sink smoke",
                "timestamp": 1710000000000,
            },
        }
    ).model_dump(mode="json")

    assert result["ok"] is True
    assert result["status"] == "delivered"
    assert result["sink"]["kind"] == "otlp"
    assert result["sink"]["configured"] is True
    assert result["sink"]["externalEmit"] is False
    assert result["provenance"] == {
        "source": "python-telemetry-production-sink",
        "synthetic": True,
        "externalMonitoringRequest": False,
        "externalSink": False,
    }
    assert result["delivery"]["attempted"] is True
    assert result["delivery"]["emitted"] is False
    assert result["delivery"]["eventId"] == "evt-production-sink-1"


@pytest.mark.parametrize(
    ("scenario", "expected_status", "expected_code"),
    [
        ("missing_config", "misconfigured", "telemetry_sink_missing_config"),
        ("timeout", "degraded", "telemetry_sink_timeout"),
        ("unhealthy", "degraded", "telemetry_sink_unhealthy"),
        ("unknown", "unknown", "telemetry_sink_unknown"),
    ],
)
def test_production_sink_failures_are_visible_and_not_delivered(
    scenario: str,
    expected_status: str,
    expected_code: str,
):
    result = execute_telemetry_production_sink(
        {
            "sink": {"kind": "otlp", "configured": scenario != "missing_config"},
            "event": {
                "eventId": f"evt-{scenario}",
                "type": "telemetry:llm_call",
                "severity": "warning",
                "message": scenario,
                "timestamp": 1710000000000,
            },
            "scenario": scenario,
        }
    ).model_dump(mode="json")

    assert result["ok"] is False
    assert result["status"] == expected_status
    assert result["status"] != "delivered"
    assert result["error"]["code"] == expected_code
    assert result["sink"]["externalEmit"] is False
    assert result["delivery"]["emitted"] is False
    assert result["provenance"]["externalMonitoringRequest"] is False
    assert result["provenance"]["externalSink"] is False
