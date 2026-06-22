import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.audit_retention_export import execute_audit_retention_export  # noqa: E402


def _entry(event_id: str, timestamp: int = 1710000000000):
    return {
        "entryId": f"entry-{event_id}",
        "sequenceNumber": 7,
        "eventId": event_id,
        "event": {
            "eventId": event_id,
            "eventType": "AUDIT_EXPORT",
            "timestamp": timestamp,
            "actor": {"type": "system", "id": "audit"},
            "action": "audit.export.json",
            "resource": {"type": "audit", "id": "audit-log"},
            "result": "success",
            "context": {"requestId": "req-1"},
            "metadata": {"capabilityId": "audit.retention-export", "ticket": "runtime-96"},
            "lineageId": "lineage-audit-1",
        },
        "previousHash": "prev-hash",
        "currentHash": "curr-hash",
        "nonce": "nonce-1",
        "timestamp": {"system": timestamp},
        "signature": "sig-1",
    }


def test_retention_keep_decision_preserves_event_metadata_and_query_envelope():
    result = execute_audit_retention_export(
        {
            "operation": "retention",
            "scenario": "retained",
            "query": {
                "filters": {"eventType": "AUDIT_EXPORT", "actorId": "audit"},
                "page": {"pageSize": 25, "pageNum": 2},
            },
            "retention": {
                "policy": {
                    "severity": "INFO",
                    "retentionDays": 365,
                    "archiveAfterDays": 90,
                    "deleteAfterDays": 365,
                },
                "entry": _entry("ae-keep"),
                "now": 1710000000000,
            },
        }
    ).model_dump(mode="json")

    assert result["ok"] is True
    assert result["status"] == "retained"
    assert result["operation"] == "retention"
    assert result["retention"]["decision"] == "keep"
    assert result["retention"]["eventId"] == "ae-keep"
    assert result["query"] == {
        "filters": {"eventType": "AUDIT_EXPORT", "actorId": "audit"},
        "page": {"pageSize": 25, "pageNum": 2},
        "total": 1,
    }
    assert result["event"]["metadata"] == {
        "capabilityId": "audit.retention-export",
        "ticket": "runtime-96",
    }
    assert result["provenance"] == {
        "source": "python-audit-retention-export",
        "synthetic": True,
        "externalAuditPlatform": False,
        "boundary": "runtime",
        "nodeOwnedCapabilities": ["anomaly", "compliance"],
    }


def test_retention_drop_decision_is_visible_without_external_delete():
    result = execute_audit_retention_export(
        {
            "operation": "retention",
            "scenario": "retained",
            "retention": {
                "policy": {
                    "severity": "INFO",
                    "retentionDays": 365,
                    "archiveAfterDays": 90,
                    "deleteAfterDays": 365,
                },
                "entry": _entry("ae-drop", timestamp=1670000000000),
                "now": 1710000000000,
            },
        }
    ).model_dump(mode="json")

    assert result["ok"] is True
    assert result["status"] == "retained"
    assert result["retention"]["decision"] == "drop"
    assert result["retention"]["reason"] == "retention_expired"
    assert result["retention"]["externalDelete"] is False
    assert result["export"] is None


def test_export_manifest_is_runtime_only_and_preserves_metadata():
    result = execute_audit_retention_export(
        {
            "operation": "export",
            "scenario": "exported",
            "query": {"filters": {"result": "success"}, "page": {"pageSize": 10, "pageNum": 1}},
            "export": {
                "format": "json",
                "entries": [_entry("ae-export-1"), _entry("ae-export-2")],
            },
        }
    ).model_dump(mode="json")

    assert result["ok"] is True
    assert result["status"] == "exported"
    assert result["operation"] == "export"
    assert result["export"] == {
        "manifestId": "audit-export-json-2",
        "format": "json",
        "entryCount": 2,
        "eventIds": ["ae-export-1", "ae-export-2"],
        "externalEmit": False,
        "hash": result["export"]["hash"],
    }
    assert result["export"]["hash"]
    assert result["event"]["eventId"] == "ae-export-1"
    assert result["event"]["metadata"]["ticket"] == "runtime-96"
    assert result["query"]["total"] == 2


@pytest.mark.parametrize(
    ("scenario", "status", "error_code", "retryable"),
    [
        ("denied", "denied", "audit_export_denied", False),
        ("degraded", "degraded", "audit_export_degraded", True),
        ("error", "error", "audit_export_error", True),
    ],
)
def test_denied_degraded_and_error_never_masquerade_as_exported(
    scenario: str,
    status: str,
    error_code: str,
    retryable: bool,
):
    result = execute_audit_retention_export(
        {
            "operation": "export",
            "scenario": scenario,
            "export": {"format": "json", "entries": [_entry(f"ae-{scenario}")]},
        }
    ).model_dump(mode="json")

    assert result["ok"] is False
    assert result["status"] == status
    assert result["status"] != "exported"
    assert result["export"] is None
    assert result["error"] == {
        "code": error_code,
        "message": "Audit retention/export runtime did not export.",
        "retryable": retryable,
    }
