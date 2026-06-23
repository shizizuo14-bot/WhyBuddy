"""Test for Task lifecycle durable ownership closure 102 (gate companion for 103 slice).

Verifies that durable mission store etc remain node-retained, and python only claims bounded slices.
"""

import os
import sys
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.task_lifecycle_durable_ownership_closure import (
    decide_task_lifecycle_durable_ownership_closure,
)


def _base_payload(**ov: Any) -> dict:
    p: dict[str, Any] = {"area": "all"}
    p.update(ov)
    return p


def test_durable_ownership_defaults_no_takeover():
    res = decide_task_lifecycle_durable_ownership_closure(_base_payload())
    assert res.get("productionTakeover") is False
    assert res["ok"] is True or res.get("status") == "success"
    assert res["ownership"]["missionStore"] == "node-retained"
    assert res["ownership"]["durableStore"] == "node-retained"
    assert res["ownership"]["runtimeStateSlice"] == "python-owned"
    assert res.get("retainedDecision", {}).get("durableMissionStore") == "node-retained"


def test_mission_store_explicit_node_retained():
    res = decide_task_lifecycle_durable_ownership_closure(_base_payload(area="missionStore"))
    assert res.get("productionTakeover") is False
    assert res["ownership"]["missionStore"] == "node-retained"


def test_areas_cover_python_slice_but_not_durable():
    for a in ["runtimeStateSlice", "cancelStateDecision", "replayProjectionSlice"]:
        res = decide_task_lifecycle_durable_ownership_closure({"area": a})
        assert res.get("productionTakeover") is not True
        assert res["ownership"].get(a) == "python-owned" or "python" in str(res["ownership"].get(a, ""))


def test_retained_decision_present():
    res = decide_task_lifecycle_durable_ownership_closure()
    assert "retainedDecision" in res
    assert res["retainedDecision"]["durableMissionStore"] == "node-retained"
