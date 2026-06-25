"""Python runtime bridge tests for Web AIGC AI PPT outline/slide-plan/export-intent.

Covers success/degraded/provider_missing/error for outline, slide_plan, export_intent
without real LLM, PPT generation, file IO or external services.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.web_aigc_ai_ppt_adapter import execute_ai_ppt_runtime_bridge  # noqa: E402


def test_runtime_bridge_outline_success_envelope():
    resp = execute_ai_ppt_runtime_bridge(
        {
            "intent": "outline",
            "topic": "季度复盘",
            "slideCount": 4,
            "metadata": {"requestId": "ai-ppt-py-1"},
            "permission": {"allowed": True, "auditId": "audit-ppt-1"},
            "provenance": {"source": "test"},
        }
    ).model_dump(exclude_none=True)

    assert resp["ok"] is True
    assert resp["status"] == "success"
    assert resp["status"] != "degraded"
    assert resp["intent"] == "outline"
    assert resp["plan"]["title"] == "季度复盘"
    assert len(resp["plan"]["slides"]) == 4
    assert resp["runtime"] == {
        "backend": "python",
        "provider": "fake",
        "source": "python-ai-ppt-outline-runtime",
        "externalCalls": False,
    }
    assert resp["metadata"]["requestId"] == "ai-ppt-py-1"
    assert resp["provenance"]["source"] == "test"


def test_runtime_bridge_slide_plan_success_envelope():
    resp = execute_ai_ppt_runtime_bridge(
        {
            "intent": "slide_plan",
            "topic": "产品发布",
            "brief": "新版本特性介绍",
            "slideCount": 5,
        }
    ).model_dump(exclude_none=True)

    assert resp["ok"] is True
    assert resp["status"] == "success"
    assert resp["intent"] == "slide_plan"
    assert resp["plan"]["title"] == "产品发布"
    assert len(resp["plan"]["slides"]) >= 3
    assert resp["runtime"]["source"] == "python-ai-ppt-slide-plan-runtime"


def test_runtime_bridge_export_intent_success_envelope():
    resp = execute_ai_ppt_runtime_bridge(
        {
            "intent": "export_intent",
            "topic": "销售方案",
            "metadata": {"mode": "export"},
        }
    ).model_dump(exclude_none=True)

    assert resp["ok"] is True
    assert resp["status"] == "success"
    assert resp["intent"] == "export_intent"
    assert "title" in resp["plan"]
    assert resp["runtime"]["source"] == "python-ai-ppt-export-intent-runtime"


@pytest.mark.parametrize(
    "intent,scenario,expected_status,expected_code",
    [
        ("outline", "degraded", "degraded", "provider_degraded"),
        ("slide_plan", "provider_missing", "provider_missing", "provider_missing"),
        ("export_intent", "error", "error", "runtime_error"),
        ("outline", "degraded", "degraded", "provider_degraded"),
    ],
)
def test_runtime_bridge_non_success_envelopes(intent, scenario, expected_status, expected_code):
    resp = execute_ai_ppt_runtime_bridge(
        {
            "intent": intent,
            "topic": "测试主题",
            "scenario": scenario,
        }
    ).model_dump(exclude_none=True)

    assert resp["ok"] is False
    assert resp["status"] == expected_status
    assert resp["status"] != "success"
    assert resp["error"]["code"] == expected_code
    assert resp["intent"] == intent
    assert resp["runtime"]["backend"] == "python"
    assert resp["runtime"]["externalCalls"] is False


def test_runtime_bridge_degraded_is_not_generated():
    resp = execute_ai_ppt_runtime_bridge(
        {
            "kind": "outline",
            "scenario": "degraded",
        }
    ).model_dump(exclude_none=True)

    assert resp["ok"] is False
    assert resp["status"] == "degraded"
    assert "plan" not in resp
    assert resp["error"]["code"] == "provider_degraded"


def test_runtime_bridge_provider_missing_and_error_do_not_masquerade():
    for scenario, code in [("provider_missing", "provider_missing"), ("error", "runtime_error")]:
        resp = execute_ai_ppt_runtime_bridge(
            {"intent": "slide_plan", "scenario": scenario}
        ).model_dump(exclude_none=True)
        assert resp["ok"] is False
        assert resp["status"] != "success"
        assert resp["error"]["code"] == code
