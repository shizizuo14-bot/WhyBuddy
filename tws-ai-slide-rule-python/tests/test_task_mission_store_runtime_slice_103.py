"""Python tests for task mission store runtime slice 103.

Covers store classification, minimal state changes, cancel state, replay projection boundary.
Explicit node-retained for durable store; python-owned only for bounded runtime slice.
"""

import os
import sys
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.task_mission_store_runtime_slice import (  # noqa: E402
    CONTRACT_VERSION,
    PROVENANCE,
    NODE_RETAINED_AREAS,
    RUNTIME_SLICE_AREAS,
    decide_mission_store_runtime_slice,
)


def _base_payload(**overrides: Any) -> dict:
    base: dict[str, Any] = {
        "missionId": "mission-slice-103",
        "projectId": "project-slice-103",
        "resourceId": "resource-slice-103",
        "area": "all",
    }
    base.update(overrides)
    return base


def test_default_ready_python_owned_runtime_slice_and_node_retained_durable():
    result = decide_mission_store_runtime_slice(_base_payload())
    assert result["ok"] is True
    assert result["decision"] == "ready"
    assert result["contractVersion"] == CONTRACT_VERSION
    assert result["provenance"] == PROVENANCE
    assert result["missionId"] == "mission-slice-103"
    assert result["ownership"]["durableStore"] == "node-retained"
    assert result["ownership"]["runtimeState"] == "python-owned"
    assert result["ownership"]["cancelState"] == "python-owned"
    assert result["ownership"]["schedulerBoundary"] == "node-retained"
    assert result["runtime"]["owner"] == "python"
    assert result["runtime"]["durableStoreOwner"] == "node"
    assert result["runtime"]["missionStoreOwner"] == "node"
    assert result.get("blocked") is not True
    # never claim full takeover
    assert result.get("productionTakeover") is not True


def test_simulate_blocked_keeps_durable_node_retained():
    result = decide_mission_store_runtime_slice(
        _base_payload(simulate={"block": True}, missionId="m-blocked-103")
    )
    assert result["decision"] == "blocked"
    assert result["ok"] is False
    assert result["blocked"] is True
    assert result["ownership"]["durableStore"] == "node-retained"
    assert result["ownership"]["cancelState"] == "node"
    assert "node-retained" in result["nodeRetained"].values()


def test_simulate_degraded_allows_cancel_and_replay_advisory():
    result = decide_mission_store_runtime_slice(_base_payload(simulate={"degrade": True}))
    assert result["decision"] == "degraded"
    assert result["ownership"]["cancelState"] == "python-decision-advisory"
    assert result["ownership"]["replayProjection"] == "python-decision-advisory"
    assert result["canOwnSlice"]["cancelState"] is False  # advisory only


def test_area_cancel_state_is_python_owned():
    result = decide_mission_store_runtime_slice(_base_payload(area="cancelState"))
    assert result["ownership"]["cancelState"] == "python-owned"
    assert result["ownership"]["runtimeState"] == "node"
    assert result["ownership"]["durableStore"] == "node-retained"


def test_area_replay_projection_marks_python_slice_but_not_durable():
    result = decide_mission_store_runtime_slice(_base_payload(area="replayProjection", action="replay"))
    assert result["ownership"]["replayProjection"] == "python-owned"
    assert result.get("replay", {}).get("projectionOwner") == "python-owned"
    assert result["ownership"]["durableStore"] == "node-retained"


def test_cancel_action_surface():
    result = decide_mission_store_runtime_slice(_base_payload(action="cancel", area="cancelState"))
    assert result["action"] == "cancel"
    assert result["cancel"]["cancelRequested"] is True
    assert result["cancel"]["stateOwner"] == "python-owned"


def test_store_classification_area():
    result = decide_mission_store_runtime_slice(_base_payload(area="storeClassification"))
    assert result["decision"] == "ready"
    assert result["ownership"]["runtimeState"] == "python-owned"
    assert result["ownership"]["cancelState"] == "python-owned"
    assert result["diagnostics"]["reason"] == "store-classification-slice"


def test_unsupported_and_error_paths():
    result = decide_mission_store_runtime_slice(_base_payload(simulate={"forceUnsupported": True}))
    assert result["decision"] == "unsupported"
    assert result["ok"] is False
    assert result["ownership"]["durableStore"] == "node-retained"

    bad = decide_mission_store_runtime_slice("not-dict")  # type: ignore[arg-type]
    assert bad["decision"] == "unsupported" or bad.get("ok") is False


def test_node_retained_constants_cover_core_boundaries():
    for k in ["durableStore", "scheduler", "projectResourceAuth", "errorPath"]:
        assert k in NODE_RETAINED_AREAS
    assert NODE_RETAINED_AREAS["durableStore"] == "node-retained"
