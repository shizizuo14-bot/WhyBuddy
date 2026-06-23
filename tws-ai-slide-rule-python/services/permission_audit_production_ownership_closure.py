"""Permission/Audit production ownership closure 102.

Advisory classification for Permission and Audit surfaces in context of durable store boundary 103.
All real durable audit store, policy store, retention, external platform are node-retained or external-owned.
Python supplies thin durableDecision slice (python-owned) for boundary evidence only.
Does not treat hooks, sinks or export readiness as durable store ownership.
"""

from __future__ import annotations

from typing import Any, Dict

CONTRACT_VERSION = "permission-audit.production-ownership-closure.v1"
PROVENANCE = "python-permission-audit-production-ownership-closure-102"


def decide_permission_audit_production_ownership_closure(payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
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

    ownership = {
        "policyStore": "node-retained",
        "auditDurableStore": "node-retained",
        "externalAuditPlatform": "external-owned",
        "retention": "node-retained",
        "enforcement": "node-retained",
        "durableDecision": "python-owned",
    }

    result: Dict[str, Any] = {
        "status": status,
        "contractVersion": CONTRACT_VERSION,
        "provenance": PROVENANCE,
        "productionTakeover": production_takeover,
        "ownership": ownership,
        "nodeBoundaries": {
            "auditDurableStore": "node",
            "policyStore": "node",
            "retention": "node",
        },
        "ok": status == "success",
    }
    if area != "all":
        result["area"] = area
    if simulate:
        result["simulate"] = simulate
    return result


# alias
get_permission_audit_production_ownership_closure = decide_permission_audit_production_ownership_closure

__all__ = [
    "CONTRACT_VERSION",
    "PROVENANCE",
    "decide_permission_audit_production_ownership_closure",
    "get_permission_audit_production_ownership_closure",
]
