"""A2A production transport ownership closure 102 (for 103 slice).

Python provides ownership decision surface only.
Real production transport (registry mutation, external agent streaming, chat/report,
analytics) remains node-retained or external-agent-required.
This never claims production session/stream transport ownership for python.
Python slice may own bounded runtime decision/state projection only.
"""

from __future__ import annotations

from typing import Any, Dict

CONTRACT_VERSION = "a2a.production-transport-ownership-closure.v1"
PROVENANCE = "python-a2a-production-transport-ownership-closure-102"

NODE_RETAINED_TRANSPORTS = {
    "realStreamTransport": "node-retained",
    "registryMutation": "node-retained",
    "externalAgentInvoke": "external-agent-required",
    "chatReporting": "node-retained",
}


def decide_a2a_production_transport_ownership_closure(
    payload: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
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
        "realStreamTransport": "node-retained",
        "registryMutation": "node-retained",
        "externalAgentInvoke": "external-agent-required",
        "chatReporting": "node-retained",
        "analytics": "node-retained",
        "sessionStreamSliceDecision": "python-owned",
    }

    result: Dict[str, Any] = {
        "status": status,
        "contractVersion": CONTRACT_VERSION,
        "provenance": PROVENANCE,
        "productionTakeover": production_takeover,
        "ownership": ownership,
        "nodeBoundaries": NODE_RETAINED_TRANSPORTS,
        "ok": status == "success",
        "note": "production transport retained; python provides decision slice only",
    }
    if area != "all":
        result["area"] = area
    if simulate:
        result["simulate"] = simulate
    return result


# alias
get_a2a_production_transport_ownership_closure = decide_a2a_production_transport_ownership_closure

__all__ = [
    "CONTRACT_VERSION",
    "PROVENANCE",
    "decide_a2a_production_transport_ownership_closure",
    "get_a2a_production_transport_ownership_closure",
]
