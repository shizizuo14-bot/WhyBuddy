"""Runtime smoke tests for injectable fake skill registry wiring.

These tests prove skill.invoke can reach a skill registry through an injected
runtime entry point. Fakes stay outside production wiring; no marketplace,
permission system, or external tool is used.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.v5_state import V5SessionState  # noqa: E402
from services.capability_maps import execute_mapped_capability  # noqa: E402
from services.slide_rule_executor import (  # noqa: E402
    FAKE_SKILL_RUNTIME_PROVENANCE,
    SkillInvokeRequest,
    SkillInvokeResult,
    SkillInvalidArgumentsError,
    SkillNotFoundError,
    SkillRuntimeUnavailable,
    create_skill_runtime,
    execute_skill_invoke_with_runtime,
    set_skill_runtime,
)


class FakeSkillRegistry:
    """Test fake only: exercises runtime wiring without external skills."""

    def __init__(self, *, unavailable: bool = False, skills: dict | None = None):
        self._unavailable = unavailable
        self._skills = skills if skills is not None else {
            "fake.summarize": self._summarize,
        }
        self.calls: list[SkillInvokeRequest] = []

    def invoke(self, request: SkillInvokeRequest) -> SkillInvokeResult:
        self.calls.append(request)
        if self._unavailable:
            raise SkillRuntimeUnavailable("fake registry offline")
        handler = self._skills.get(request.skill_id)
        if handler is None:
            raise SkillNotFoundError(f"unknown skill: {request.skill_id}")
        return handler(request)

    def _summarize(self, request: SkillInvokeRequest) -> SkillInvokeResult:
        topic = request.arguments.get("topic")
        if not isinstance(topic, str) or not topic.strip():
            raise SkillInvalidArgumentsError("topic must be a non-empty string")
        return SkillInvokeResult(
            output=f"fake summary for {topic}",
            response={"summary": f"deterministic:{topic}", "skillId": request.skill_id},
        )


@pytest.fixture(autouse=True)
def _reset_skill_runtime():
    set_skill_runtime(None)
    yield
    set_skill_runtime(None)


def _state(**goal_overrides) -> V5SessionState:
    goal = {
        "text": "Invoke a fake skill for migration evidence",
        "skillId": "fake.summarize",
        "skillArguments": {"topic": "migration boundaries"},
    }
    goal.update(goal_overrides)
    return V5SessionState(
        sessionId="skill-runtime-smoke",
        goal=goal,
        artifacts=[],
    )


def test_runtime_smoke_fake_registry_returns_explicit_skill_result():
    registry = FakeSkillRegistry()
    set_skill_runtime(create_skill_runtime(registry=registry))

    result = execute_mapped_capability(
        "skill.invoke",
        _state(),
        ["goal-1"],
        "grounding",
        "turn-skill-runtime",
    )

    assert result["provenance"] == FAKE_SKILL_RUNTIME_PROVENANCE
    assert not result["provenance"].startswith("skill:")
    assert result["degraded"] is False
    assert result["skillId"] == "fake.summarize"
    assert result["arguments"] == {"topic": "migration boundaries"}
    assert result["skillResult"] == {
        "summary": "deterministic:migration boundaries",
        "skillId": "fake.summarize",
    }
    assert result["content"] == "fake summary for migration boundaries"
    assert result["sources"] == []
    assert registry.calls[0].skill_id == "fake.summarize"
    assert registry.calls[0].arguments == {"topic": "migration boundaries"}


def test_runtime_smoke_unknown_skill_has_stable_degraded_shape():
    registry = FakeSkillRegistry(skills={})
    runtime = create_skill_runtime(registry=registry)

    result = execute_skill_invoke_with_runtime(
        _state(skillId="missing.skill"),
        "grounding",
        "turn-skill-runtime",
        ["goal-1"],
        runtime=runtime,
    )

    assert result["provenance"] == FAKE_SKILL_RUNTIME_PROVENANCE
    assert not result["provenance"].startswith("skill:")
    assert result["degraded"] is True
    assert result["error"] == "skill_not_found"
    assert result["skillId"] == "missing.skill"
    assert result["arguments"] == {"topic": "migration boundaries"}
    assert "skillResult" not in result


def test_runtime_smoke_bad_arguments_have_stable_degraded_shape():
    registry = FakeSkillRegistry()
    runtime = create_skill_runtime(registry=registry)

    result = execute_skill_invoke_with_runtime(
        _state(skillArguments={"topic": ""}),
        "grounding",
        "turn-skill-runtime",
        ["goal-1"],
        runtime=runtime,
    )

    assert result["provenance"] == FAKE_SKILL_RUNTIME_PROVENANCE
    assert not result["provenance"].startswith("skill:")
    assert result["degraded"] is True
    assert result["error"] == "skill_invalid_arguments"
    assert result["skillId"] == "fake.summarize"
    assert result["arguments"] == {"topic": ""}
    assert "skillResult" not in result


def test_runtime_smoke_unavailable_registry_has_stable_degraded_shape():
    registry = FakeSkillRegistry(unavailable=True)
    runtime = create_skill_runtime(registry=registry)

    result = execute_skill_invoke_with_runtime(
        _state(),
        "grounding",
        "turn-skill-runtime",
        ["goal-1"],
        runtime=runtime,
    )

    assert result["provenance"] == FAKE_SKILL_RUNTIME_PROVENANCE
    assert not result["provenance"].startswith("skill:")
    assert result["degraded"] is True
    assert result["error"] == "skill_runtime_unavailable"
    assert result["skillId"] == "fake.summarize"
    assert "skillResult" not in result
