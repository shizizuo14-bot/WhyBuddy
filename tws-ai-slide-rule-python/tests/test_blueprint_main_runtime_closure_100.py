"""Test for Blueprint main runtime closure 100.

Covers:
- success, partial, degraded, failed, diagnostic-only outputs
- preservation of jobId/projectId/stageId/actor/causation/diagnostic metadata
- clear boundaries: python decision only, node owns persistence etc.
- sub envelopes are included for audit
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.blueprint_main_runtime_closure import (  # noqa: E402
    CONTRACT_VERSION,
    PROVENANCE,
    CLOSURE_STATUSES,
    execute_blueprint_main_runtime_closure,
)


def _base_job():
    return {
        "id": "job-closure-100",
        "projectId": "proj-closure",
        "stage": "spec_docs",
        "status": "running",
        "createdAt": "2026-06-22T00:00:00.000Z",
        "updatedAt": "2026-06-22T00:00:01.000Z",
        "artifacts": [{"id": "a1", "type": "spec_tree"}],
        "events": [],
    }


def _payload(**overrides):
    p = {
        "jobId": "job-closure-100",
        "job": _base_job(),
        "projectId": "proj-closure",
        "stageId": "spec_docs",
        "now": "2026-06-22T00:00:10.000Z",
        "actor": {"id": "user-x", "type": "human"},
        "causation": {"traceId": "t-closure-100", "parent": "job.start"},
        "diagnostics": {"source": "closure-test"},
    }
    p.update(overrides)
    return p


def test_closure_success_output():
    result = execute_blueprint_main_runtime_closure(_payload())
    assert result["status"] == "success"
    assert result["contractVersion"] == CONTRACT_VERSION
    assert result["provenance"] == PROVENANCE
    assert result["runtime"]["owner"] == "python"
    assert result["runtime"]["jobStoreOwner"] == "node"
    assert result["jobId"] == "job-closure-100"
    assert result["projectId"] == "proj-closure"
    assert result["stageId"] == "spec_docs"
    cs = result["closureSummary"]
    assert cs["jobId"] == "job-closure-100"
    assert cs["status"] == "success"
    assert cs["metadata"]["actor"]["id"] == "user-x"
    assert cs["metadata"]["causation"]["traceId"] == "t-closure-100"
    assert result["diagnostics"]["nodePersistencePreserved"] is True
    assert "subEnvelopes" in result


def test_closure_partial_output():
    result = execute_blueprint_main_runtime_closure(_payload(simulate={"partial": True}))
    assert result["status"] == "partial"
    assert result["closureSummary"]["status"] == "partial"
    assert result.get("diagnosticOnly") is not True


def test_closure_degraded_output():
    result = execute_blueprint_main_runtime_closure(_payload(simulate={"degraded": True}))
    assert result["status"] == "degraded"
    assert result["closureSummary"]["status"] == "degraded"


def test_closure_failed_output():
    result = execute_blueprint_main_runtime_closure(_payload(simulate={"forceFailed": True}))
    assert result["status"] == "failed"
    assert result["closureSummary"]["status"] == "failed"
    assert result.get("ok") is False or "status" in result


def test_closure_diagnostic_only_output():
    result = execute_blueprint_main_runtime_closure(_payload(diagnosticOnly=True))
    assert result["status"] == "diagnostic-only"
    assert result["closureSummary"]["status"] == "diagnostic-only"
    assert result.get("diagnosticOnly") is True
    assert result.get("productionTakeover") is False
    # must not masquerade as full production
    assert result["runtime"]["mode"] == "bounded_closure"


def test_closure_preserves_metadata_and_boundaries():
    result = execute_blueprint_main_runtime_closure(
        _payload(
            actor={"id": "actor-y"},
            causation={"traceId": "caus-xyz"},
            diagnostics={"reason": "audit"},
        )
    )
    cs = result["closureSummary"]
    assert cs["metadata"]["actor"]["id"] == "actor-y"
    assert cs["metadata"]["causation"]["traceId"] == "caus-xyz"
    assert cs["metadata"]["diagnostic"]["reason"] == "audit"
    assert result["diagnostics"]["nodeEventBusPreserved"] is True
    assert result["diagnostics"]["nodeLedgerPreserved"] is True


def test_closure_handles_minimal_and_invalid():
    empty = execute_blueprint_main_runtime_closure({})
    assert empty["status"] in CLOSURE_STATUSES  # at least produces a status
    assert "jobId" in empty

    bad = execute_blueprint_main_runtime_closure({"job": "not-a-dict"})
    assert bad["status"] == "failed"
    assert bad["error"] == "validation_error"
