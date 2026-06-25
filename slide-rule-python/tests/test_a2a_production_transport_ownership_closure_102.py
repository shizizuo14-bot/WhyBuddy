"""Test for A2A production transport ownership closure 102 (gate companion for 103).

Ensures productionTakeover never true for A2A transport areas.
Explicit node-retained / external-agent-required for real stream, registry, invoke, chat.
Python slice decision separate (python-owned).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.a2a_production_transport_ownership_closure import (
    decide_a2a_production_transport_ownership_closure,
)


def _base_payload(**ov):
    p = {"area": "all"}
    p.update(ov)
    return p


def test_a2a_production_transport_defaults_no_takeover():
    res = decide_a2a_production_transport_ownership_closure(_base_payload())
    assert res.get("productionTakeover") is False
    assert res["ok"] is True
    assert res["contractVersion"].startswith("a2a.production-transport-ownership-closure")


def test_a2a_ownership_for_real_transport_node_retained_or_external():
    res = decide_a2a_production_transport_ownership_closure(_base_payload(area="stream"))
    assert res.get("productionTakeover") is False
    own = res.get("ownership", {})
    assert own.get("realStreamTransport") == "node-retained"
    assert own.get("externalAgentInvoke") == "external-agent-required"

    res2 = decide_a2a_production_transport_ownership_closure({"area": "registryMutation"})
    assert res2.get("productionTakeover") is not True
    assert res2["ownership"].get("registryMutation") == "node-retained"


def test_a2a_ownership_slice_decision_python_owned():
    res = decide_a2a_production_transport_ownership_closure(_base_payload())
    own = res.get("ownership", {})
    assert own.get("sessionStreamSliceDecision") == "python-owned"
    assert "node" in str(res.get("nodeBoundaries", {})) or len(res.get("nodeBoundaries", {})) > 0
