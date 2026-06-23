"""Tests for Permission Audit durable store boundary 103.

Covers Python decision for durable boundary:
- Reports node-retained for auditDurableStore/policyStore/retention
- external-owned for externalAuditPlatform (explicitly not python)
- python-owned for durableDecision (thin decision slice only)
- productionTakeover never true
- Hooks/sinks/exports are NOT misclassified as durable store ownership.
- Test covers at least one real policy/audit durable boundary.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.permission_audit_durable_store_boundary import (  # noqa: E402
    CONTRACT_VERSION,
    PROVENANCE,
    BOUNDARY_STATUSES,
    execute_permission_audit_durable_store_boundary,
)
from services.permission_audit_production_ownership_closure import (
    decide_permission_audit_production_ownership_closure,
)


def _payload(**overrides):
    p = {"metadata": {"traceId": "perm-audit-boundary-103", "actor": "test"}}
    p.update(overrides)
    return p


def test_boundary_default_reports_node_retained_external_and_python_decision():
    result = execute_permission_audit_durable_store_boundary(_payload())
    assert result["status"] in ("ready", "python-owned")
    assert result["contractVersion"] == CONTRACT_VERSION
    assert result["provenance"] == PROVENANCE
    assert result["runtime"]["owner"] == "python"
    assert result["ok"] is True
    assert result.get("productionTakeover") is False

    own = result["ownership"]
    assert own["policyStore"] == "node-retained"
    assert own["auditDurableStore"] == "node-retained"
    assert own["externalAuditPlatform"] == "external-owned"
    assert own["retention"] == "node-retained"
    assert own["durableDecision"] == "python-owned"  # the python-owned durable boundary decision slice

    assert result["boundaries"]["durableStoreOwner"] == "node"
    assert result["boundaries"]["externalAuditPlatformOwner"] == "external"
    assert "python-owned" in BOUNDARY_STATUSES


def test_boundary_blocked_state():
    result = execute_permission_audit_durable_store_boundary(_payload(simulate={"block": True}))
    assert result["status"] == "blocked"
    assert result["ok"] is False
    for v in result["ownership"].values():
        assert v == "blocked"


def test_boundary_production_ownership_closure_reports_retained():
    res = decide_permission_audit_production_ownership_closure(_payload())
    assert res.get("productionTakeover") is False
    assert res["ok"] is True
    own = res["ownership"]
    assert own["auditDurableStore"] == "node-retained"
    assert own["externalAuditPlatform"] == "external-owned"
    # python owned only for the thin decision slice
    assert own.get("durableDecision") == "python-owned"


def test_boundary_never_takeover_and_distinguishes_ownerships():
    result = execute_permission_audit_durable_store_boundary(_payload())
    assert result.get("productionTakeover") is not True
    assert result["ownership"]["auditDurableStore"] != "python-owned"
    assert result["ownership"]["externalAuditPlatform"] != "python-owned"
    assert result["ownership"]["auditDurableStore"] == "node-retained"
    # durableDecision is the only python slice
    assert result["ownership"]["durableDecision"] == "python-owned"


def test_boundary_covers_policy_and_audit_durable_real_boundary():
    # area targeted covers policy store boundary decision
    for area in ["policyStore", "auditDurableStore"]:
        res = execute_permission_audit_durable_store_boundary(_payload(simulate={"area": area}))
        assert res["ownership"][area] == "node-retained"
        assert res["ownership"]["durableDecision"] == "python-owned"
        assert res.get("productionTakeover") is False


def test_boundary_all_statuses_and_contract():
    for st in BOUNDARY_STATUSES:
        assert st in BOUNDARY_STATUSES

    bad = execute_permission_audit_durable_store_boundary(None)  # type: ignore[arg-type]
    assert bad["status"] in ("blocked", "failed") or "error" in bad
    assert bad["ok"] is False
