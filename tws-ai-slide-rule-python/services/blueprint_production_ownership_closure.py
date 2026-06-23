"""Blueprint production ownership closure 102 (advisory decision surface).

Python provides ownership classification for Blueprint surfaces.
All durable stores, event bus, ledger, replan, prompt exec remain node-retained.
Python only returns decision envelope + bounded slices already proven (job runtime, event stream, state).

This is consumed to adjust 102/103 denominator. Never claims 100% production.
"""

from __future__ import annotations

from typing import Any, Dict

CONTRACT_VERSION = "blueprint.production-ownership-closure.v1"
PROVENANCE = "python-blueprint-production-ownership-closure-102"

NODE_RETAINED = {
    "jobStore": "node",
    "eventBus": "node",
    "ledger": "node",
    "replan": "node",
    "promptPackage": "node",
    "preview": "node",
    "diagnostics": "node",
}


def decide_blueprint_production_ownership_closure(payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
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

    result = {
        "status": status,
        "contractVersion": CONTRACT_VERSION,
        "provenance": PROVENANCE,
        "productionTakeover": production_takeover,
        "ownership": {
            "jobStore": "node-retained",
            "eventBus": "node-retained",
            "ledger": "node-retained",
            "replan": "node-retained",
            "promptPackage": "node-retained",
            "previewState": "node-retained",
            "jobStateSlice": "python-owned",
        },
        "nodeBoundaries": NODE_RETAINED,
        "ok": status == "success",
    }
    if area != "all":
        result["area"] = area
    if simulate:
        result["simulate"] = simulate
    return result


# alias for older references
get_blueprint_production_ownership_closure = decide_blueprint_production_ownership_closure

__all__ = ["CONTRACT_VERSION", "PROVENANCE", "decide_blueprint_production_ownership_closure", "get_blueprint_production_ownership_closure"]
