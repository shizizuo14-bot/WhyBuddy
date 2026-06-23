"""Auth production ownership closure 102 (advisory for session token boundary 103).

Python provides ownership classification for Auth surfaces focused on session/token areas.
All durable session repository, token issuance, password policy, email mailer and user repo remain node-retained.
Python supplies thin decision boundary + bounded evidence only (no prod takeover of issuance/storage/policy).

Consumed by Node bridge for posture; explicit retained/out-of-scope decisions.
"""
from __future__ import annotations

from typing import Any, Dict

CONTRACT_VERSION = "auth.production-ownership-closure.v1"
PROVENANCE = "python-auth-production-ownership-closure-102"

NODE_RETAINED_AREAS = {
    "sessionRepository": "node",
    "tokenIssuance": "node",
    "passwordPolicy": "node",
    "emailCodeMailer": "node",
    "userRepository": "node",
}


def decide_auth_production_ownership_closure(payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
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
        "sessionRepository": "node-retained",
        "tokenIssuance": "node-retained",
        "passwordPolicy": "node-retained",
        "emailCodeMailer": "node-retained",
        "userRepository": "node-retained",
        "sessionTokenBoundaryDecision": "python-owned",
    }

    result: Dict[str, Any] = {
        "status": status,
        "contractVersion": CONTRACT_VERSION,
        "provenance": PROVENANCE,
        "productionTakeover": production_takeover,
        "ownership": ownership,
        "nodeBoundaries": NODE_RETAINED_AREAS,
        "ok": status == "success",
    }
    if area != "all":
        result["area"] = area
    if simulate:
        result["simulate"] = simulate
    return result


# alias
get_auth_production_ownership_closure = decide_auth_production_ownership_closure

__all__ = ["CONTRACT_VERSION", "PROVENANCE", "decide_auth_production_ownership_closure", "get_auth_production_ownership_closure"]
