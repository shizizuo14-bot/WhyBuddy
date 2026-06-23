"""Test for Blueprint production ownership closure 102 (gate companion).

Ensures productionTakeover never true for retained areas.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.blueprint_production_ownership_closure import decide_blueprint_production_ownership_closure


def _base_payload(**ov):
    p = {"area": "all"}
    p.update(ov)
    return p


def test_production_ownership_defaults_no_takeover():
    res = decide_blueprint_production_ownership_closure(_base_payload())
    assert res.get("productionTakeover") is False
    assert res["ok"] is True or res.get("status") == "success"


def test_ownership_for_job_store_node_retained():
    res = decide_blueprint_production_ownership_closure(_base_payload(area="jobStore"))
    assert res.get("productionTakeover") is False


def test_area_scopes():
    for a in ["jobStore", "eventBus", "ledger"]:
        res = decide_blueprint_production_ownership_closure({"area": a})
        assert res.get("productionTakeover") is not True
