"""Python tests for permission audit production ownership closure 102.

Verifies explicit classification of durable stores vs decision slice.
Does not misrepresent hooks or retention/export as durable store migration.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.permission_audit_production_ownership_closure import (  # noqa: E402
    CONTRACT_VERSION,
    PROVENANCE,
    decide_permission_audit_production_ownership_closure,
)


def _payload(**overrides):
    p = {"metadata": {"traceId": "perm-audit-own-102"}}
    p.update(overrides)
    return p


def test_ownership_default_reports_node_retained_and_python_slice():
    result = decide_permission_audit_production_ownership_closure(_payload())
    assert result["status"] == "success"
    assert result["contractVersion"] == CONTRACT_VERSION
    assert result["provenance"] == PROVENANCE
    assert result["ok"] is True
    assert result["productionTakeover"] is False

    own = result["ownership"]
    assert own["policyStore"] == "node-retained"
    assert own["auditDurableStore"] == "node-retained"
    assert own["externalAuditPlatform"] == "external-owned"
    assert own["retention"] == "node-retained"
    assert own["durableDecision"] == "python-owned"


def test_ownership_blocked_and_degraded():
    blocked = decide_permission_audit_production_ownership_closure(_payload(simulate={"forceFailed": True}))
    assert blocked["status"] in ("failed", "blocked")
    assert blocked["productionTakeover"] is False

    deg = decide_permission_audit_production_ownership_closure(_payload(simulate={"degraded": True}))
    assert deg["status"] == "degraded"
    assert deg["productionTakeover"] is False


def test_ownership_area_scoped_and_boundaries():
    res = decide_permission_audit_production_ownership_closure(_payload(area="auditDurableStore"))
    assert res.get("area") == "auditDurableStore"
    assert res["ownership"]["auditDurableStore"] == "node-retained"
    assert "node" in str(res.get("nodeBoundaries", {}))
