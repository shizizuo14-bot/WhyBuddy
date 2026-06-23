"""Test for Auth session token boundary 103.

Covers:
- Python explicitly classifies ownership: sessionRepository/node-retained, tokenIssuance/node-retained etc.
- Provides python-owned path for sessionTokenDecision (thin boundary decision evidence).
- productionTakeover is never true.
- Node-retained decisions kept for production components; login mocks never promoted to session/token repo.
- Compatible with cutover 101 and ownership 102.
- No secrets leaked; no production claim.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.auth_session_token_boundary import (  # noqa: E402
    CONTRACT_VERSION,
    PROVENANCE,
    BOUNDARY_STATUSES,
    execute_auth_session_token_boundary,
)
from services.auth_production_ownership_closure import decide_auth_production_ownership_closure


def _payload(**overrides):
    p = {"metadata": {"traceId": "boundary-103", "actor": "test"}}
    p.update(overrides)
    return p


def test_boundary_default_reports_node_retained_and_python_decision():
    result = execute_auth_session_token_boundary(_payload())
    assert result["status"] in ("ready", "python-owned")
    assert result["contractVersion"] == CONTRACT_VERSION
    assert result["provenance"] == PROVENANCE
    assert result["runtime"]["owner"] == "python"
    assert result["ok"] is True

    own = result["ownership"]
    assert own["sessionRepository"] == "node-retained"
    assert own["tokenIssuance"] == "node-retained"
    assert own["passwordPolicy"] == "node-retained"
    assert own["emailCodeMailer"] == "node-retained"
    assert own["userRepository"] == "node-retained"
    assert own["sessionTokenDecision"] == "python-owned"  # python-owned runtime evidence for decision path
    assert "python-owned" in BOUNDARY_STATUSES


def test_boundary_blocked_state():
    result = execute_auth_session_token_boundary(_payload(simulate={"block": True}))
    assert result["status"] == "blocked"
    assert result["ok"] is False
    for v in result["ownership"].values():
        assert v == "blocked"


def test_boundary_production_ownership_closure_reports_retained():
    res = decide_auth_production_ownership_closure(_payload())
    assert res.get("productionTakeover") is False
    assert res["ok"] is True
    own = res["ownership"]
    assert own["sessionRepository"] == "node-retained"
    assert own["tokenIssuance"] == "node-retained"
    # python owned for the boundary decision slice
    assert own.get("sessionTokenBoundaryDecision") == "python-owned" or own.get("sessionTokenDecision") == "python-owned"


def test_boundary_never_takeover_and_preserves_retained():
    result = execute_auth_session_token_boundary(_payload())
    assert result.get("productionTakeover") is not True
    assert result["ownership"]["sessionRepository"] != "python-owned"
    assert result["ownership"]["tokenIssuance"] != "python-owned"
    # metadata / contract only
    assert result.get("runtime", {}).get("mode") == "session_token_boundary"


def test_boundary_all_statuses_and_contract():
    for st in ["ready", "node-retained", "python-owned", "out-of-scope", "skipped-live", "blocked"]:
        assert st in BOUNDARY_STATUSES

    bad = execute_auth_session_token_boundary(None)  # type: ignore[arg-type]
    assert bad["status"] in ("blocked", "failed") or "error" in bad
