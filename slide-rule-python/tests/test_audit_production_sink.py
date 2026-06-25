import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.audit_sink import execute_audit_production_sink  # noqa: E402


def _event(event_id: str = "ae-production-sink-1"):
    return {
        "eventId": event_id,
        "eventType": "AGENT_EXECUTED",
        "timestamp": 1710000000000,
        "actor": {"type": "agent", "id": "agent-1"},
        "action": "execute_task",
        "resource": {"type": "mission", "id": "mission-1"},
        "result": "success",
        "context": {"sessionId": "sess-1", "requestId": "req-1"},
        "metadata": {"capabilityId": "audit.event"},
    }


def test_audit_sink_write_success_keeps_source_fields_and_no_external_emit():
    result = execute_audit_production_sink(
        {
            "sink": {
                "kind": "node-audit-store",
                "configured": True,
                "storeId": "local-audit-chain",
            },
            "event": _event(),
        }
    ).model_dump(mode="json")

    assert result["ok"] is True
    assert result["status"] == "written"
    assert result["runtime"] == "python-audit-production-sink"
    assert result["event"]["eventId"] == "ae-production-sink-1"
    assert result["event"]["eventType"] == "AGENT_EXECUTED"
    assert result["event"]["source"] == "python-audit-production-sink"
    assert result["event"]["context"] == {"sessionId": "sess-1", "requestId": "req-1"}
    assert result["sink"]["externalEmit"] is False
    assert result["write"] == {
        "attempted": True,
        "stored": True,
        "eventId": "ae-production-sink-1",
    }
    assert result["provenance"] == {
        "source": "python-audit-production-sink",
        "synthetic": True,
        "externalAuditPlatform": False,
        "nodeOwnedCapabilities": ["retention", "export", "anomaly", "compliance"],
    }
    assert result["degradedCapabilities"] == {
        "retention": "node-owned",
        "export": "node-owned",
        "anomaly": "node-owned",
        "compliance": "node-owned",
    }


def test_audit_sink_store_failure_is_visible_and_not_written():
    result = execute_audit_production_sink(
        {
            "sink": {"kind": "node-audit-store", "configured": True},
            "event": _event("ae-store-failure"),
            "scenario": "store_failure",
        }
    ).model_dump(mode="json")

    assert result["ok"] is False
    assert result["status"] == "failed"
    assert result["write"] == {
        "attempted": True,
        "stored": False,
        "eventId": "ae-store-failure",
    }
    assert result["error"] == {
        "code": "audit_sink_store_failure",
        "message": "Audit production sink store write failed.",
        "retryable": True,
    }
    assert result["sink"]["externalEmit"] is False
    assert result["provenance"]["externalAuditPlatform"] is False


def test_audit_sink_degraded_state_is_not_reported_as_healthy():
    result = execute_audit_production_sink(
        {
            "sink": {"kind": "node-audit-store", "configured": True},
            "event": _event("ae-degraded"),
            "scenario": "degraded",
        }
    ).model_dump(mode="json")

    assert result["ok"] is False
    assert result["status"] == "degraded"
    assert result["status"] != "written"
    assert result["write"]["attempted"] is True
    assert result["write"]["stored"] is False
    assert result["error"]["code"] == "audit_sink_degraded"
    assert result["error"]["retryable"] is True


def test_audit_sink_missing_config_is_diagnostic_and_does_not_write():
    result = execute_audit_production_sink(
        {
            "sink": {"kind": "node-audit-store", "configured": False},
            "event": _event("ae-missing-config"),
        }
    ).model_dump(mode="json")

    assert result["ok"] is False
    assert result["status"] == "misconfigured"
    assert result["write"] == {
        "attempted": False,
        "stored": False,
        "eventId": "ae-missing-config",
    }
    assert result["error"] == {
        "code": "audit_sink_missing_config",
        "message": "Audit production sink is not configured.",
        "retryable": False,
    }


@pytest.mark.parametrize("scenario", ["written", "missing_config", "store_failure", "degraded"])
def test_audit_sink_scenarios_preserve_node_owned_capability_boundary(scenario: str):
    result = execute_audit_production_sink(
        {
            "sink": {"kind": "node-audit-store", "configured": scenario != "missing_config"},
            "event": _event(f"ae-{scenario}"),
            "scenario": scenario,
        }
    ).model_dump(mode="json")

    assert result["provenance"]["nodeOwnedCapabilities"] == [
        "retention",
        "export",
        "anomaly",
        "compliance",
    ]
    assert set(result["degradedCapabilities"].values()) == {"node-owned"}
