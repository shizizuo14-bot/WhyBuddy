"""Test for Blueprint job store scope decision 103.

Verifies:
- Stable decision envelope: area, ownership, productionTakeover, migrationDenominator, reason, evidence.
- jobStore/eventBus/ledger/replan/promptPackage/previewState default to node-retained with productionTakeover=false.
- jobStateSlice can be marked python-owned (thin slice) but takeover remains false.
- Node bridge can consume and assert retained/out-of-scope != takeover.
- No masquerading of node surfaces as python production.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.blueprint_job_store_scope_decision import (  # noqa: E402
    CONTRACT_VERSION,
    PROVENANCE,
    AREAS,
    decide_blueprint_job_store_scope_decision,
)


def _payload(**overrides):
    base = {"area": "all"}
    base.update(overrides)
    return base


def test_decision_envelope_shape_and_keys():
    result = decide_blueprint_job_store_scope_decision(_payload())
    assert result["ok"] is True
    assert result["contractVersion"] == CONTRACT_VERSION
    assert result["provenance"] == PROVENANCE
    for key in ("area", "ownership", "productionTakeover", "migrationDenominator", "reason", "evidence"):
        assert key in result


def test_job_store_is_node_retained_no_takeover():
    result = decide_blueprint_job_store_scope_decision(_payload(area="jobStore"))
    assert result["area"] == "jobStore"
    assert result["ownership"] == "node-retained"
    assert result["productionTakeover"] is False


def test_event_bus_is_node_retained_no_takeover():
    result = decide_blueprint_job_store_scope_decision(_payload(area="eventBus"))
    assert result["ownership"] == "node-retained"
    assert result["productionTakeover"] is False


def test_ledger_replan_prompt_preview_all_node_retained():
    for area in ("ledger", "replan", "promptPackage", "previewState"):
        result = decide_blueprint_job_store_scope_decision(_payload(area=area))
        assert result["ownership"] == "node-retained"
        assert result["productionTakeover"] is False


def test_job_state_slice_python_owned_but_no_production_takeover():
    result = decide_blueprint_job_store_scope_decision(_payload(area="jobStateSlice"))
    assert result["area"] == "jobStateSlice"
    assert result["ownership"] == "python-owned"
    # Guard: even python slice for state does not claim production takeover of job store
    assert result["productionTakeover"] is False
    assert "thin" in result["reason"] or "python" in result["reason"].lower()


def test_migration_denominator_counts():
    result = decide_blueprint_job_store_scope_decision(_payload(area="all"))
    denom = result["migrationDenominator"]
    assert denom["total"] == 7
    assert denom["pythonOwned"] == 1  # only the jobStateSlice
    assert denom["nodeRetained"] >= 6
    assert "areas" in result


def test_simulate_all_retained_forces_node():
    result = decide_blueprint_job_store_scope_decision(_payload(area="jobStateSlice", simulate={"forceNodeRetained": True}))
    assert result["ownership"] == "node-retained"
    assert result["productionTakeover"] is False


def test_node_bridge_consumption_assertion_shape():
    # Simulates what node bridge test will assert
    for area in AREAS:
        result = decide_blueprint_job_store_scope_decision({"area": area})
        if result["ownership"] in ("node-retained", "out-of-scope"):
            assert result["productionTakeover"] is not True
        # never allow retained to be reported as takeover
        if result.get("productionTakeover") is True:
            assert result["ownership"] == "python-owned"
