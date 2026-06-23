"""Tests for Python permission audit hooks runtime boundary.

Covers allowed / denied / approval_required / error envelopes.
Ensures denied/error/approval_required never become allowed.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.permission_audit_hooks import (
    PERMISSION_AUDIT_HOOK_CONTRACT_VERSION,
    record_permission_audit_hook,
)


def _base_check(allowed=True, decision="allow", reason=None, gov=None, err=None, **extra):
    req = {
        "allowed": allowed,
        "decision": decision,
        "reason": reason,
        "resourceType": "filesystem",
        "action": "read",
        "resource": "/sandbox/a/b.txt",
        "agentId": "agent-audit",
        "context": {"agentId": "agent-audit"},
    }
    if gov:
        req["governance"] = gov
    if err:
        req["error"] = err
    req.update(extra)
    return req


def test_permission_audit_hooks_runtime_allowed_envelope():
    result = record_permission_audit_hook(
        _base_check(allowed=True, decision="allow", reason="Allowed by explicit allow rule for filesystem:read")
    )

    assert result["contractVersion"] == PERMISSION_AUDIT_HOOK_CONTRACT_VERSION
    assert result["source"] == "python_runtime"
    assert result["result"] == "allowed"
    assert result["actor"] == "agent-audit"
    assert result["resourceType"] == "filesystem"
    assert result["action"] == "read"
    assert result["reason"] == "Allowed by explicit allow rule for filesystem:read"
    assert "error" not in result or result.get("error") is None


def test_permission_audit_hooks_runtime_denied_envelope():
    result = record_permission_audit_hook(
        _base_check(allowed=False, decision="deny", reason="Denied by explicit deny rule for filesystem:write")
    )

    assert result["source"] == "python_runtime"
    assert result["result"] == "denied"
    assert result["reason"] == "Denied by explicit deny rule for filesystem:write"
    assert result.get("error", {}).get("code") in (None, "explicit_deny") or "error" not in result


def test_permission_audit_hooks_runtime_approval_required_envelope():
    gov = {
        "outcome": "approval_required",
        "riskLevel": "high",
        "policyId": "pol-approval",
        "rationale": "High risk MCP tool call",
        "requiresAudit": True,
    }
    result = record_permission_audit_hook(
        _base_check(allowed=False, decision="deny", gov=gov, reason="Governance requires approval")
    )

    assert result["result"] == "approval_required"
    assert result["governance"]["outcome"] == "approval_required"
    assert result["risk"] == "high"
    assert result["actor"] == "agent-audit"


def test_permission_audit_hooks_runtime_error_envelope():
    result = record_permission_audit_hook(
        _base_check(allowed=False, err={"code": "invalid_policy", "message": "Invalid permission policy"}, reason=None)
    )

    assert result["result"] == "error"
    assert result["error"]["code"] == "invalid_policy"


def test_permission_audit_hooks_runtime_denied_and_error_never_allowed():
    deny = record_permission_audit_hook(_base_check(allowed=False, decision="deny"))
    assert deny["result"] != "allowed"

    err = record_permission_audit_hook(_base_check(allowed=True, err={"code": "boom"}))
    assert err["result"] == "error"
    assert err["result"] != "allowed"

    bad = record_permission_audit_hook(None)
    assert bad["result"] == "error"
    assert bad["result"] != "allowed"

    gov_approval = record_permission_audit_hook(
        _base_check(allowed=True, decision="allow", gov={"outcome": "approval_required"})
    )
    assert gov_approval["result"] == "approval_required"
    assert gov_approval["result"] != "allowed"
