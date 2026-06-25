"""Runtime bridge tests for web AIGC search adapter shapes.

This bridge is still fake-provider backed. The important runtime contract is
that Python can project all four search node shapes without touching live
search, graph, image, or webpage services.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.web_aigc_search_adapter import execute_search_runtime_bridge  # noqa: E402


@pytest.mark.parametrize(
    ("kind", "expected_status", "expected_runtime_source"),
    [
        ("web_search", "success", "python-web-search-runtime"),
        ("graph_search", "success", "python-graph-search-runtime"),
        ("image_search", "success", "python-image-search-runtime"),
        ("static_webpage_read", "success", "python-static-webpage-read-runtime"),
    ],
)
def test_runtime_bridge_projects_all_search_shapes_without_external_calls(
    kind: str,
    expected_status: str,
    expected_runtime_source: str,
):
    response = execute_search_runtime_bridge(
        {
            "kind": kind,
            "query": "runtime bridge",
            "scenario": "success",
            "permission": {"allowed": True, "auditId": "audit-runtime-1"},
        }
    ).model_dump(exclude_none=True)

    assert response["ok"] is True
    assert response["kind"] == kind
    assert response["query"] == "runtime bridge"
    assert response["status"] == expected_status
    assert response["runtime"] == {
        "backend": "python",
        "provider": "fake",
        "source": expected_runtime_source,
        "externalCalls": False,
    }
    assert response["provenance"]["provider"] == "fake"
    assert response["provenance"]["query"] == "runtime bridge"
    assert response["provenance"]["auditId"] == "audit-runtime-1"
    assert response["provenance"]["permission"] == {
        "allowed": True,
        "auditId": "audit-runtime-1",
    }


@pytest.mark.parametrize(
    "scenario",
    ["empty", "error"],
)
def test_runtime_bridge_empty_and_error_are_not_success(scenario: str):
    response = execute_search_runtime_bridge(
        {
            "kind": "web_search",
            "query": f"{scenario} runtime",
            "scenario": scenario,
        }
    ).model_dump(exclude_none=True)

    assert response["status"] == scenario
    assert response["status"] != "success"
    assert response["runtime"]["backend"] == "python"
    assert response["runtime"]["externalCalls"] is False


def test_runtime_bridge_permission_denied_preserves_audit_fields():
    response = execute_search_runtime_bridge(
        {
            "kind": "image_search",
            "query": "blocked runtime",
            "scenario": "success",
            "permission": {
                "allowed": False,
                "reason": "policy_denied",
                "auditId": "audit-runtime-denied",
            },
        }
    ).model_dump(exclude_none=True)

    assert response["ok"] is False
    assert response["status"] == "permission_denied"
    assert response["status"] != "success"
    assert response["error"]["code"] == "permission_denied"
    assert response["runtime"] == {
        "backend": "python",
        "provider": "fake",
        "source": "python-image-search-runtime",
        "externalCalls": False,
    }
    assert response["provenance"]["auditId"] == "audit-runtime-denied"
    assert response["provenance"]["permission"] == {
        "allowed": False,
        "reason": "policy_denied",
        "auditId": "audit-runtime-denied",
    }
