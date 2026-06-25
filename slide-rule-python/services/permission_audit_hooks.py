"""Python runtime boundary for permission audit hooks after permission check.

Exposes allowed/denied/approval_required/error audit hook envelope.
Retains actor, resource, action, policy, risk, governance provenance metadata.
denied / error / approval_required must never be reported as allowed.
Production audit sink / retention / external platforms remain Node owned.
"""

from typing import Any

PERMISSION_AUDIT_HOOK_CONTRACT_VERSION = "permission-audit-hook.v1"
PERMISSION_AUDIT_HOOK_SOURCE = "python_runtime"


def record_permission_audit_hook(
    check_result: dict[str, Any] | None,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return audit hook envelope for a permission check decision.

    Supports:
    - allowed (from clean allow)
    - denied (explicit deny, no_allow, etc)
    - approval_required (via governance.outcome)
    - error (invalid input or error present)
    """
    if not isinstance(check_result, dict):
        return _audit_error("invalid_check_result", "Invalid permission check result for audit hook")

    allowed = check_result.get("allowed") is True
    decision = check_result.get("decision")
    err = check_result.get("error") if isinstance(check_result.get("error"), dict) else None
    gov = check_result.get("governance") if isinstance(check_result.get("governance"), dict) else None
    gov_outcome = gov.get("outcome") if gov else None

    # Determine result, never let denied/error/approval masquerade as allowed
    if err is not None:
        result: str = "error"
    elif gov_outcome == "approval_required":
        result = "approval_required"
    elif decision == "deny" or allowed is False:
        result = "denied"
    elif allowed is True and decision == "allow":
        result = "allowed"
    else:
        result = "error"

    # Enforce no allowed if any deny signal
    if result == "allowed" and (decision == "deny" or gov_outcome in ("blocked", "approval_required")):
        result = "denied"

    actor = _extract_actor(check_result, context)
    resource_type = check_result.get("resourceType") or "unknown"
    action = check_result.get("action") or "unknown"
    resource = check_result.get("resource") or ""
    reason = check_result.get("reason")
    if not reason and err:
        reason = err.get("message")
    policy = check_result.get("matchedRule") or check_result.get("policy")
    risk = (gov or {}).get("riskLevel") or "low"

    envelope: dict[str, Any] = {
        "contractVersion": PERMISSION_AUDIT_HOOK_CONTRACT_VERSION,
        "source": PERMISSION_AUDIT_HOOK_SOURCE,
        "result": result,
        "actor": actor,
        "resourceType": resource_type,
        "action": action,
        "resource": resource,
        "reason": reason,
        "policy": policy,
        "risk": risk,
    }
    if gov:
        envelope["governance"] = gov
    if err:
        envelope["error"] = err

    return envelope


def _extract_actor(check_result: dict[str, Any], context: dict[str, Any] | None) -> str:
    ctx = context or check_result.get("context") or {}
    if isinstance(ctx, dict):
        aid = ctx.get("agentId") or check_result.get("agentId")
        if isinstance(aid, str) and aid:
            return aid
    aid = check_result.get("agentId")
    return aid if isinstance(aid, str) and aid else "unknown"


def _audit_error(code: str, message: str) -> dict[str, Any]:
    return {
        "contractVersion": PERMISSION_AUDIT_HOOK_CONTRACT_VERSION,
        "source": PERMISSION_AUDIT_HOOK_SOURCE,
        "result": "error",
        "error": {"code": code, "message": message},
        "actor": "unknown",
        "resourceType": "unknown",
        "action": "unknown",
        "resource": "",
        "reason": message,
        "policy": None,
        "risk": "low",
    }
