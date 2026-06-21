import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.audit_sink import execute_audit_production_sink  # noqa: E402


def test_audit_event_runtime_boundary_returns_failure_envelope_instead_of_success():
    result = execute_audit_production_sink(
        {
            "sink": {"kind": "node-audit-store", "configured": True},
            "event": {
                "eventId": "ae-runtime-failure",
                "eventType": "AGENT_FAILED",
                "timestamp": 1710000000000,
                "actor": {"type": "agent", "id": "agent-1"},
                "action": "execute_task",
                "resource": {"type": "mission", "id": "mission-1"},
                "result": "failure",
                "context": {"sessionId": "sess-1"},
            },
            "scenario": "store_failure",
        }
    ).model_dump(mode="json")

    assert result["ok"] is False
    assert result["status"] == "failed"
    assert result["error"]["code"] == "audit_sink_store_failure"
    assert result["write"]["stored"] is False


def test_audit_event_runtime_boundary_keeps_retention_export_anomaly_compliance_node_owned():
    result = execute_audit_production_sink(
        {
            "sink": {"kind": "node-audit-store", "configured": True},
            "event": {
                "eventId": "ae-runtime-boundary",
                "eventType": "AUDIT_EXPORT",
                "timestamp": 1710000000000,
                "actor": {"type": "system", "id": "audit"},
                "action": "export_audit",
                "resource": {"type": "audit-log", "id": "audit-log-1"},
                "result": "success",
                "context": {},
            },
        }
    ).model_dump(mode="json")

    assert result["ok"] is True
    assert result["degradedCapabilities"] == {
        "retention": "node-owned",
        "export": "node-owned",
        "anomaly": "node-owned",
        "compliance": "node-owned",
    }
    assert result["provenance"]["externalAuditPlatform"] is False
