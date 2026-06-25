"""Runtime bridge tests for web AIGC file adapter shapes.

The bridge remains fake-runtime backed. These tests prove Python can project
file adapter runtime evidence without writing artifacts or reading user paths.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.web_aigc_file_adapter import execute_file_runtime_bridge  # noqa: E402


@pytest.mark.parametrize(
    ("kind", "operation", "expected_source"),
    [
        ("file_generation", "generated", "python-file-generation-runtime"),
        ("file_slicing", "sliced", "python-file-slicing-runtime"),
        ("file_translation", "translated", "python-file-translation-runtime"),
        ("excel_read", "read", "python-excel-read-runtime"),
        ("long_text_extraction", "extracted", "python-long-text-extraction-runtime"),
    ],
)
def test_runtime_bridge_projects_all_file_shapes_without_side_effects(
    kind: str,
    operation: str,
    expected_source: str,
):
    response = execute_file_runtime_bridge(
        {
            "kind": kind,
            "operation": operation,
            "filename": "runtime.txt",
            "content": "runtime bridge content",
            "permission": {"allowed": True, "auditId": "audit-file-runtime-1"},
        }
    ).model_dump(exclude_none=True)

    assert response["ok"] is True
    assert response["kind"] == kind
    assert response["operation"] == operation
    assert response["status"] == "success"
    assert response["runtime"] == {
        "backend": "python",
        "provider": "fake",
        "source": expected_source,
        "externalCalls": False,
        "persisted": False,
    }
    assert response["provenance"]["provider"] == "fake"
    assert response["provenance"]["runtime"] == "python-contract"
    assert response["provenance"]["permission"] == {
        "allowed": True,
        "auditId": "audit-file-runtime-1",
    }
    if "artifact" in response:
        assert response["artifact"]["persisted"] is False
        assert response["artifact"]["path"].startswith("memory://web-aigc-file-adapter/")


@pytest.mark.parametrize("scenario", ["error"])
def test_runtime_bridge_error_is_not_success_and_keeps_error_envelope(scenario: str):
    response = execute_file_runtime_bridge(
        {
            "kind": "file_generation",
            "operation": "generated",
            "filename": "runtime-error.txt",
            "content": "runtime error",
            "scenario": scenario,
        }
    ).model_dump(exclude_none=True)

    assert response["ok"] is False
    assert response["status"] == "error"
    assert response["status"] != "success"
    assert response["error"]["code"] == "fake_runtime_error"
    assert response["runtime"] == {
        "backend": "python",
        "provider": "fake",
        "source": "python-file-generation-runtime",
        "externalCalls": False,
        "persisted": False,
    }


def test_runtime_bridge_permission_denied_preserves_audit_fields():
    response = execute_file_runtime_bridge(
        {
            "kind": "file_translation",
            "operation": "translated",
            "filename": "blocked.txt",
            "content": "blocked",
            "permission": {
                "allowed": False,
                "reason": "policy_denied",
                "auditId": "audit-file-runtime-denied",
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
        "source": "python-file-translation-runtime",
        "externalCalls": False,
        "persisted": False,
    }
    assert response["provenance"]["permission"] == {
        "allowed": False,
        "reason": "policy_denied",
        "auditId": "audit-file-runtime-denied",
    }
