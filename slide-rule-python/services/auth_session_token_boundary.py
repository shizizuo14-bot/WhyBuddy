"""Auth session token boundary 103.

Python-owned decision surface for session/token boundary classification.
- Reports explicit ownership for sessionRepository, tokenIssuance, passwordPolicy, mailer, userRepository.
- Provides at least one python-owned path: sessionTokenDecision (thin contract decision only).
- Does NOT implement or take over production session store, real token issuance, password hashing, or email sending.
- Node retains all production paths; python only supplies advisory decision + contract validation evidence.
- Compatible with existing auth_session_persistence (for test boundary) and auth_identity_runtime (bounded, non-prod).

Statuses / owners: node-retained | python-owned | out-of-scope | skipped-live
"""
from __future__ import annotations

from typing import Any, Dict, Literal, Optional

CONTRACT_VERSION = "auth-session-token-boundary.v1"
PROVENANCE = "python-auth-session-token-boundary-103"

BOUNDARY_STATUSES: tuple[str, ...] = ("ready", "node-retained", "python-owned", "out-of-scope", "skipped-live", "blocked")

AuthSessionTokenBoundaryStatus = Literal["ready", "node-retained", "python-owned", "out-of-scope", "skipped-live", "blocked"]


def _error_envelope(status: str, code: str, message: str) -> Dict[str, Any]:
    return {
        "status": status,
        "contractVersion": CONTRACT_VERSION,
        "provenance": PROVENANCE,
        "ok": False,
        "error": {"code": code, "message": message},
        "runtime": {"owner": "python", "mode": "session_token_boundary"},
    }


def _success_envelope(
    status: str,
    ownership: Dict[str, str],
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return {
        "status": status,
        "contractVersion": CONTRACT_VERSION,
        "provenance": PROVENANCE,
        "ok": status in ("ready", "python-owned"),
        "runtime": {"owner": "python", "mode": "session_token_boundary"},
        "ownership": ownership,
        "metadata": metadata or {},
    }


def execute_auth_session_token_boundary(payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """Return session/token boundary ownership decision.

    simulate:
      - {"block": true} -> blocked
      - {"area": "tokenIssuance"} etc for targeted
    Default: reports node-retained for stores/issuance/policy/mailer, python-owned for decision path.
    """
    if payload is None or not isinstance(payload, dict):
        return _error_envelope("blocked", "invalid_payload", "payload must be object")

    simulate = payload.get("simulate") if isinstance(payload.get("simulate"), dict) else {}
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}

    if simulate.get("forceFailed"):
        return _error_envelope("blocked", "forced_failure", "boundary forced into blocked")

    if simulate.get("block") or simulate.get("blocked"):
        ownership = {
            "sessionRepository": "blocked",
            "tokenIssuance": "blocked",
            "passwordPolicy": "blocked",
            "emailCodeMailer": "blocked",
            "userRepository": "blocked",
            "sessionTokenDecision": "blocked",
        }
        return _success_envelope("blocked", ownership, metadata)

    # core decision: retained for production auth components
    ownership: Dict[str, str] = {
        "sessionRepository": "node-retained",
        "tokenIssuance": "node-retained",
        "passwordPolicy": "node-retained",
        "emailCodeMailer": "node-retained",
        "userRepository": "node-retained",
        "sessionTokenDecision": "python-owned",  # thin decision / contract evidence path
    }

    if simulate.get("area"):
        area = simulate["area"]
        if area in ownership:
            # keep explicit, decision can stay python for boundary query
            pass

    # overall status reflects presence of python decision
    overall = "ready"
    if any(v == "blocked" for v in ownership.values()):
        overall = "blocked"
    elif "python-owned" in ownership.values():
        overall = "python-owned"

    return _success_envelope(overall, ownership, metadata)


# alias
get_auth_session_token_boundary = execute_auth_session_token_boundary
