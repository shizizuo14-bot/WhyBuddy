"""Permission Audit durable store boundary 103 (Python decision slice).

Python provides narrow ownership decision for Permission/Audit boundaries.
- durableDecision / policyDecision are python-owned (thin advisory decision contract).
- policyStore, auditDurableStore, retention remain node-retained.
- externalAuditPlatform is external-owned (never python).
- Never claims hooks/sink/export as durable store ownership.
- No real production audit store migration here.
"""

from __future__ import annotations

from typing import Any, Dict, Literal

CONTRACT_VERSION = "permission-audit-durable-store-boundary.v1"
PROVENANCE = "python-permission-audit-durable-store-boundary-103"

BOUNDARY_STATUSES = ("ready", "python-owned", "node-retained", "external-owned", "out-of-scope", "blocked", "skipped-live")

PermissionAuditBoundaryStatus = Literal["ready", "python-owned", "node-retained", "external-owned", "out-of-scope", "blocked", "skipped-live"]


def _error_envelope(status: str, code: str, message: str) -> Dict[str, Any]:
    return {
        "status": status,
        "contractVersion": CONTRACT_VERSION,
        "provenance": PROVENANCE,
        "ok": False,
        "error": {"code": code, "message": message},
        "runtime": {"owner": "python", "mode": "durable_store_boundary"},
        "ownership": {
            "policyStore": "node-retained",
            "auditDurableStore": "node-retained",
            "externalAuditPlatform": "external-owned",
            "retention": "node-retained",
            "durableDecision": "blocked",
        },
    }


def _success_envelope(
    status: str,
    ownership: Dict[str, str],
    metadata: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    return {
        "status": status,
        "contractVersion": CONTRACT_VERSION,
        "provenance": PROVENANCE,
        "ok": status in ("ready", "python-owned"),
        "runtime": {"owner": "python", "mode": "durable_store_boundary"},
        "ownership": ownership,
        "metadata": metadata or {},
    }


def execute_permission_audit_durable_store_boundary(payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """Return durable store boundary decision for permission/audit.

    Explicitly distinguishes:
      - node-retained: policyStore, auditDurableStore, retention
      - external-owned: externalAuditPlatform
      - python-owned: durableDecision (thin slice only)
    simulate supports block for testing.
    """
    if payload is None or not isinstance(payload, dict):
        return _error_envelope("blocked", "invalid_payload", "payload must be object")

    simulate = payload.get("simulate") if isinstance(payload.get("simulate"), dict) else {}
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}

    if simulate.get("forceFailed") or simulate.get("block"):
        ownership = {
            "policyStore": "blocked",
            "auditDurableStore": "blocked",
            "externalAuditPlatform": "blocked",
            "retention": "blocked",
            "durableDecision": "blocked",
        }
        return _success_envelope("blocked", ownership, metadata)

    # Core boundary: node/external retained, python only thin decision
    ownership: Dict[str, str] = {
        "policyStore": "node-retained",
        "auditDurableStore": "node-retained",
        "externalAuditPlatform": "external-owned",
        "retention": "node-retained",
        "durableDecision": "python-owned",  # python provides decision boundary slice only
    }

    if simulate.get("area"):
        area = simulate["area"]
        if area in ownership:
            # keep as-is for targeted area test; overall still reports python slice
            pass

    # overall status
    overall = "python-owned" if "python-owned" in ownership.values() else "ready"
    if any(v == "blocked" for v in ownership.values()):
        overall = "blocked"

    result = _success_envelope(overall, ownership, metadata)
    result["productionTakeover"] = False
    result["boundaries"] = {
        "durableStoreOwner": "node",
        "externalAuditPlatformOwner": "external",
        "policyDecisionOwner": "python",
    }
    return result


# alias for compatibility
get_permission_audit_durable_store_boundary = execute_permission_audit_durable_store_boundary

__all__ = [
    "CONTRACT_VERSION",
    "PROVENANCE",
    "BOUNDARY_STATUSES",
    "execute_permission_audit_durable_store_boundary",
    "get_permission_audit_durable_store_boundary",
]
