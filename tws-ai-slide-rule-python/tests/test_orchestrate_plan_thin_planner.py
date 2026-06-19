import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.v5_state import V5SessionState  # noqa: E402
from services.slide_rule_orchestrator import orchestrate_plan  # noqa: E402


def _fixed_state() -> V5SessionState:
    return V5SessionState(
        sessionId="orch-thin-planner",
        goal={
            "text": "Create a migration handoff plan with evidence and risks.",
            "status": "needs_refinement",
        },
        artifacts=[],
        capabilityRuns=[],
    )


def test_orchestrate_plan_thin_planner_returns_deterministic_plan_draft():
    payload = orchestrate_plan(
        _fixed_state(),
        "turn-thin-planner",
        "Create a migration handoff plan with evidence and risks.",
    ).model_dump()

    assert payload["source"] == "python-rag"
    assert payload["converged"] is False
    assert [item["capabilityId"] for item in payload["selected"]] == [
        "evidence.search",
        "risk.analyze",
        "mcp.call",
        "skill.invoke",
        "document.draft",
        "traceability.matrix",
        "task.write",
        "instruction.package",
    ]
    assert [item["roleId"] for item in payload["selected"]] == [
        "grounding",
        "safety",
        "engineering",
        "engineering",
        "engineering",
        "synthesis",
        "product",
        "engineering",
    ]
    assert payload["rationale"]


def test_orchestrate_plan_thin_planner_does_not_return_node_owned_state():
    payload = orchestrate_plan(
        _fixed_state(),
        "turn-thin-planner",
        "Create a migration handoff plan with evidence and risks.",
    ).model_dump()

    for node_owned_key in [
        "state",
        "artifacts",
        "capabilityRuns",
        "coverageGate",
        "coverageContract",
        "coverageGaps",
    ]:
        assert node_owned_key not in payload
