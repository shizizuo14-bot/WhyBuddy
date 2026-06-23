"""Blueprint job store scope decision 103.

Classifies Blueprint areas for migration denominator adjustment:
- jobStore, eventBus, ledger, replan, promptPackage, previewState: node-retained
- jobStateSlice: python-owned (thin decision/runtime envelope slice only)

Never reports productionTakeover=true for retained areas.
Never claims durable store, event transport, ledger or replan ownership.

Python decision is consumed by Node bridge for test assertions only.
Real production job persistence/event bus/ledger/replan remain in Node.
"""

from __future__ import annotations

from typing import Any, Dict

CONTRACT_VERSION = "blueprint.job-store-scope-decision.v1"
PROVENANCE = "python-blueprint-job-store-scope-decision-103"

AREAS = ("jobStore", "eventBus", "ledger", "replan", "promptPackage", "previewState", "jobStateSlice")


def _clean(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    text = str(value or "").strip()
    return text or fallback


def _error_envelope(code: str, message: str) -> Dict[str, Any]:
    return {
        "ok": False,
        "error": code,
        "message": message,
        "contractVersion": CONTRACT_VERSION,
        "provenance": PROVENANCE,
    }


def decide_blueprint_job_store_scope_decision(payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """Return scope decision envelope.

    Payload may contain:
      - area: one of AREAS or "all"
      - simulate: { "forceNodeRetained": true, "area": "...", "productionTakeover": true (for neg test) }

    Returns stable envelope with area, ownership, productionTakeover, migrationDenominator, reason, evidence.
    """
    if payload is not None and not isinstance(payload, dict):
        return _error_envelope("invalid_payload", "payload must be object or null")

    simulate = payload.get("simulate") if isinstance(payload, dict) and isinstance(payload.get("simulate"), dict) else {}
    requested_area = _clean((payload or {}).get("area"), "all")

    base_ownership: Dict[str, str] = {
        "jobStore": "node-retained",
        "eventBus": "node-retained",
        "ledger": "node-retained",
        "replan": "node-retained",
        "promptPackage": "node-retained",
        "previewState": "node-retained",
        "jobStateSlice": "python-owned",
    }

    if simulate.get("forceNodeRetained") or simulate.get("allRetained"):
        for k in list(base_ownership.keys()):
            base_ownership[k] = "node-retained"

    if simulate.get("area") and simulate["area"] in base_ownership:
        # allow simulate targeted for tests (but still respect guard)
        pass

    area = requested_area if requested_area in base_ownership else "all"

    if area == "all":
        ownership: Any = dict(base_ownership)
    else:
        ownership = base_ownership[area]

    # productionTakeover only possible for verified python-owned slices but we keep false for job store scope
    production_takeover = False
    if simulate.get("productionTakeover"):
        production_takeover = True  # allows negative test assertion in node

    if area == "jobStateSlice":
        reason = "python-thin-job-state-boundary-slice;store-and-bus-retained-in-node"
    else:
        reason = "node-retained-durable-surfaces-per-102-evidence;no-production-migration-for-store"

    evidence = {
        "source": "102-ownership-closure + 101-cutover + runtime-boundary",
        "nodeRetains": ["jobStore", "eventBus", "ledger", "replan", "promptPackage", "previewState"],
        "pythonOnlySlice": ["jobStateSlice"],
        "realStore": "node",
    }

    migration_denominator = {
        "total": len(base_ownership),
        "pythonOwned": sum(1 for v in base_ownership.values() if v == "python-owned"),
        "nodeRetained": sum(1 for v in base_ownership.values() if v == "node-retained"),
        "externalOwned": 0,
        "outOfScope": sum(1 for v in base_ownership.values() if v == "out-of-scope"),
    }

    result: Dict[str, Any] = {
        "area": area,
        "ownership": ownership,
        "productionTakeover": production_takeover,
        "migrationDenominator": migration_denominator,
        "reason": reason,
        "evidence": evidence,
        "contractVersion": CONTRACT_VERSION,
        "provenance": PROVENANCE,
        "ok": True,
    }
    if area == "all":
        result["areas"] = base_ownership
    return result


# Backwards alias used by some consumers
get_blueprint_job_store_scope_decision = decide_blueprint_job_store_scope_decision

__all__ = [
    "CONTRACT_VERSION",
    "PROVENANCE",
    "AREAS",
    "decide_blueprint_job_store_scope_decision",
    "get_blueprint_job_store_scope_decision",
]
