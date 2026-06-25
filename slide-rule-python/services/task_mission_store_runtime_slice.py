"""Task mission store runtime slice 103.

Python expresses a minimal runtime-owned slice for mission store decisions:
- runtime state classification and cancel projection advisory
- event replay boundary projection

Durable store, scheduler execution, project auth, real persistence, error paths remain node-retained.
This is a bounded runtime slice only; never replaces the Node mission store.
"""

from __future__ import annotations

from typing import Any

CONTRACT_VERSION = "task-mission-store-runtime-slice.v1"
PROVENANCE = "python-task-mission-store-runtime-slice-103"

RUNTIME_SLICE_AREAS = ("runtimeState", "cancelState", "replayProjection", "storeClassification")

NODE_RETAINED_AREAS = {
    "durableStore": "node-retained",
    "scheduler": "node-retained",
    "projectResourceAuth": "node-retained",
    "eventAppendPersistence": "node-retained",
    "errorPath": "node-retained",
    "route": "node-retained",
}


def decide_mission_store_runtime_slice(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    """Return mission store runtime slice classification and ownership.

    Produces python-owned for the bounded runtime slice (state/cancel projection advisory).
    Explicitly marks durable store and core boundaries as node-retained.
    Supports simulate for testing blocked/degraded paths.
    """
    if not isinstance(payload, dict):
        return {
            "ok": False,
            "decision": "unsupported",
            "contractVersion": CONTRACT_VERSION,
            "provenance": PROVENANCE,
            "error": "payload_not_object",
            "runtime": {"owner": "python", "mode": "mission_store_runtime_slice"},
        }

    simulate = payload.get("simulate") if isinstance(payload.get("simulate"), dict) else {}
    area = _clean(payload.get("area")) or "all"
    if area not in RUNTIME_SLICE_AREAS and area != "all":
        area = "all"

    mission_id = _extract_id(payload, "missionId", ["task", "id"]) or "unknown-mission"
    project_id = _extract_id(payload, "projectId", ["task", "projection", "projectId"])
    resource_id = _extract_id(payload, "resourceId", ["task", "projection", "resourceId"])

    diagnostic_only = bool(payload.get("diagnosticOnly") or simulate.get("diagnosticOnly"))

    if simulate.get("forceUnsupported") or simulate.get("unsupported"):
        decision = "unsupported"
        runtime_state = "unsupported"
        cancel_state = "node"
        replay = "node"
        reason = "unsupported-by-simulation"
    elif simulate.get("block") or simulate.get("blocked"):
        decision = "blocked"
        runtime_state = "blocked"
        cancel_state = "node"
        replay = "node"
        reason = "blocked-by-simulation"
    elif simulate.get("degrade") or simulate.get("degraded"):
        decision = "degraded"
        runtime_state = "degraded"
        cancel_state = "python-decision-advisory"
        replay = "python-decision-advisory"
        reason = "degraded-slice-advisory"
    else:
        if area == "runtimeState":
            decision = "ready"
            runtime_state = "python-owned"
            cancel_state = "node"
            replay = "node"
            reason = "runtime-state-slice-only"
        elif area == "cancelState":
            decision = "ready"
            runtime_state = "node"
            cancel_state = "python-owned"
            replay = "node"
            reason = "cancel-state-slice-only"
        elif area == "replayProjection":
            decision = "ready"
            runtime_state = "node"
            cancel_state = "node"
            replay = "python-owned"
            reason = "replay-projection-slice-only"
        elif area == "storeClassification":
            decision = "ready"
            runtime_state = "python-owned"
            cancel_state = "python-owned"
            replay = "python-decision-advisory"
            reason = "store-classification-slice"
        elif diagnostic_only:
            decision = "diagnostic-only"
            runtime_state = "unsupported"
            cancel_state = "node"
            replay = "node"
            reason = "diagnostic-only"
        else:
            decision = "ready"
            runtime_state = "python-owned"
            cancel_state = "python-owned"
            replay = "python-decision-advisory"
            reason = "python-runtime-slice-envelope"

    can_own_slice = {
        "runtimeState": runtime_state == "python-owned",
        "cancelState": cancel_state == "python-owned",
        "replayProjection": replay == "python-owned",
    }

    result: dict[str, Any] = {
        "ok": decision not in ("blocked", "unsupported"),
        "decision": decision,
        "contractVersion": CONTRACT_VERSION,
        "provenance": PROVENANCE,
        "missionId": mission_id,
        "projectId": project_id,
        "resourceId": resource_id,
        "area": area,
        "ownership": {
            "durableStore": "node-retained",
            "runtimeState": runtime_state,
            "cancelState": cancel_state,
            "replayProjection": replay,
            "schedulerBoundary": "node-retained",
        },
        "nodeRetained": dict(NODE_RETAINED_AREAS),
        "canOwnSlice": can_own_slice,
        "runtime": {
            "owner": "python",
            "mode": "mission_store_runtime_slice",
            "durableStoreOwner": "node",
            "missionStoreOwner": "node",
        },
        "diagnostics": {
            "reason": reason,
            "simulation": simulate or None,
        },
    }

    if decision == "blocked":
        result["blocked"] = True
    if decision == "unsupported":
        result["ok"] = False

    # For replay/cancel specific in payload
    action = _clean(payload.get("action"))
    if action in ("cancel", "replay"):
        result["action"] = action
        if action == "cancel":
            result["cancel"] = {
                "missionId": mission_id,
                "cancelRequested": decision != "unsupported",
                "stateOwner": cancel_state,
            }
        if action == "replay":
            result["replay"] = {
                "missionId": mission_id,
                "projectionOwner": replay,
            }

    return result


def _extract_id(payload: dict[str, Any], direct: str, nested: list[str]) -> str | None:
    if direct in payload and payload[direct]:
        return _clean(payload[direct])
    cur: Any = payload
    for k in nested:
        if isinstance(cur, dict):
            cur = cur.get(k)
        else:
            return None
    return _clean(cur) if cur is not None else None


def _clean(v: Any) -> str | None:
    if v is None:
        return None
    if isinstance(v, str):
        s = v.strip()
        return s or None
    return str(v)


__all__ = [
    "CONTRACT_VERSION",
    "PROVENANCE",
    "RUNTIME_SLICE_AREAS",
    "NODE_RETAINED_AREAS",
    "decide_mission_store_runtime_slice",
]
