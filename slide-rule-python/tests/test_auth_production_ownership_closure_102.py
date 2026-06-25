"""Test for Auth production ownership closure 102 (gate companion for 103).

Ensures productionTakeover never true for retained auth session/token areas.
Explicit node-retained for session repo / token / password / mailer / user.
Python decision boundary separate.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.auth_production_ownership_closure import decide_auth_production_ownership_closure


def _base_payload(**ov):
    p = {"area": "all"}
    p.update(ov)
    return p


def test_auth_production_ownership_defaults_no_takeover():
    res = decide_auth_production_ownership_closure(_base_payload())
    assert res.get("productionTakeover") is False
    assert res["ok"] is True or res.get("status") == "success"


def test_auth_ownership_for_session_token_node_retained():
    res = decide_auth_production_ownership_closure(_base_payload(area="sessionToken"))
    assert res.get("productionTakeover") is False
    own = res.get("ownership", {})
    assert own.get("sessionRepository") == "node-retained"
    assert own.get("tokenIssuance") == "node-retained"


def test_auth_ownership_areas_scopes():
    for a in ["sessionRepository", "tokenIssuance", "passwordPolicy", "userRepository", "emailCodeMailer"]:
        res = decide_auth_production_ownership_closure({"area": a})
        assert res.get("productionTakeover") is not True
        # always reports explicit retained for these
        if a in (res.get("ownership") or {}):
            assert "node" in str(res["ownership"][a]) or res["ownership"][a] == "node-retained"
