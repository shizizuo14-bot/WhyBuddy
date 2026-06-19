import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.v5_state import OrchestratePlanResult, V5SessionState  # noqa: E402
from services.slide_rule_orchestrator import orchestrate_plan  # noqa: E402


def _state() -> V5SessionState:
    return V5SessionState(
        sessionId="orch-contract",
        goal={"text": "Plan a migration boundary slice", "status": "needs_refinement"},
        artifacts=[],
        capabilityRuns=[],
    )


def test_orchestrate_plan_contract_returns_minimum_consumable_shape():
    result = orchestrate_plan(_state(), "turn-orch", "Pick the next migration capability")

    assert isinstance(result, OrchestratePlanResult)
    payload = result.model_dump()
    assert isinstance(payload["selected"], list)
    assert payload["selected"], "planner should return at least one next capability"
    assert isinstance(payload["rationale"], str)
    assert payload["rationale"]
    assert payload["source"] in ("python-rag", "heuristic_fallback", "llm")
    for item in payload["selected"]:
        assert isinstance(item["capabilityId"], str)
        assert isinstance(item["roleId"], str)


def test_orchestrate_plan_contract_keeps_node_owned_session_state_out_of_response():
    payload = orchestrate_plan(_state(), "turn-orch", "Pick the next migration capability").model_dump()

    assert "state" not in payload
    assert "artifacts" not in payload
    assert "capabilityRuns" not in payload
    assert "coverageGate" not in payload
