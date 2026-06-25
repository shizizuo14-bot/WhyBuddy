import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.v5_state import V5SessionState  # noqa: E402
from services.slide_rule_orchestrator import orchestrate_plan  # noqa: E402


FIXTURE = Path(__file__).parent / "fixtures" / "orchestrate_plan_golden.json"


def test_orchestrate_plan_golden_smoke_matches_consumable_shape():
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    request = fixture["request"]
    expected = fixture["expected"]

    result = orchestrate_plan(
        V5SessionState(**request["state"]),
        request["turnId"],
        request["userText"],
    ).model_dump()

    assert result["source"] == expected["source"]
    capability_ids = [item["capabilityId"] for item in result["selected"]]
    for cap_id in expected["requiredCapabilityIds"]:
        assert cap_id in capability_ids
    assert result["rationale"]
    for key in expected["forbiddenTopLevelKeys"]:
        assert key not in result
