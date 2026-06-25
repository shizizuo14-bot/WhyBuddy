"""Task lifecycle durable ownership closure (102/103 boundary).

Python provides explicit ownership classification for task lifecycle areas.
Durable mission store, project auth, scheduler, real event store, cancel core semantics are node-retained.
Python owns only narrow runtime slices (state projection, replay advisory) proven in prior boundaries.
Never treats projection or replay envelope as durable store takeover.
"""

from __future__ import annotations

from typing import Any, Dict

CONTRACT_VERSION = "task-lifecycle-durable-ownership-closure.v1"
PROVENANCE = "python-task-lifecycle-durable-ownership-closure-102"

NODE_RETAINED = {
    "missionStore": "node-retained",
    "durableStore": "node-retained",
    "projectResourceAuth": "node-retained",
    "scheduler": "node-retained",
    "cancelCore": "node-retained",
    "errorState": "node-retained",
    "eventStore": "node-retained",
}


def decide_task_lifecycle_durable_ownership_closure(payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        payload = {}
    simulate = payload.get("simulate") if isinstance(payload.get("simulate"), dict) else {}
    area = str(payload.get("area") or "all").strip() or "all"

    if simulate.get("forceFailed"):
        status = "failed"
        production_takeover = False
    elif simulate.get("degraded"):
        status = "degraded"
        production_takeover = False
    else:
        status = "success"
        production_takeover = False

    # Python owned slices are only the advisory runtime/projection ones, durable stays node.
    ownership = {
        "missionStore": "node-retained",
        "durableStore": "node-retained",
        "projectResourceAuth": "node-retained",
        "scheduler": "node-retained",
        "cancelCore": "node-retained",
        "runtimeStateSlice": "python-owned",
        "replayProjectionSlice": "python-owned",
        "cancelStateDecision": "python-owned",
    }

    result = {
        "status": status,
        "contractVersion": CONTRACT_VERSION,
        "provenance": PROVENANCE,
        "productionTakeover": production_takeover,
        "ownership": ownership,
        "nodeBoundaries": dict(NODE_RETAINED),
        "ok": status == "success",
    }
    if area != "all":
        result["area"] = area
    if simulate:
        result["simulate"] = simulate
    # Explicit retained decision for 103 scope
    result["retainedDecision"] = {
        "durableMissionStore": "node-retained",
        "note": "mission store runtime slice may own bounded projection/cancel-state only",
    }
    return result


get_task_lifecycle_durable_ownership_closure = decide_task_lifecycle_durable_ownership_closure

__all__ = [
    "CONTRACT_VERSION",
    "PROVENANCE",
    "NODE_RETAINED",
    "decide_task_lifecycle_durable_ownership_closure",
    "get_task_lifecycle_durable_ownership_closure",
]
