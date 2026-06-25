"""Test for Blueprint shell state cutover 101 (gate companion)."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.blueprint_shell_state_cutover import decide_blueprint_shell_state_cutover


def test_shell_cutover_ready_no_takeover():
    res = decide_blueprint_shell_state_cutover({"area": "shell"})
    assert res["status"] in ("ready", "blocked", "degraded")
    assert res.get("productionTakeover") is False
    assert res.get("ownership") == "node-retained"


def test_shell_simulate_block():
    res = decide_blueprint_shell_state_cutover({"simulate": {"block": True}})
    assert res["status"] == "blocked"
    assert res.get("productionTakeover") is False
