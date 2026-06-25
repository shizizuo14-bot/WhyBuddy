"""Python runtime bridge tests for Web AIGC OCR and static webpage read.

Covers success/degraded/provider_missing/error without real OCR/browser/crawler.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.web_aigc_ocr_static_adapter import execute_ocr_static_runtime_bridge  # noqa: E402


def test_runtime_bridge_ocr_success_envelope():
    resp = execute_ocr_static_runtime_bridge(
        {
            "kind": "ocr_recognition",
            "content": "Invoice total 42.00",
            "metadata": {"requestId": "ocr-py-1"},
            "permission": {"allowed": True, "auditId": "audit-ocr-1"},
        }
    ).model_dump(exclude_none=True)

    assert resp["ok"] is True
    assert resp["status"] == "success"
    assert resp["status"] != "degraded"
    assert resp["text"] == "Invoice total 42.00"
    assert resp["fragments"][0]["text"] == "Invoice total 42.00"
    assert resp["runtime"] == {
        "backend": "python",
        "provider": "fake",
        "source": "python-ocr-recognition-runtime",
        "externalCalls": False,
    }
    assert resp["metadata"]["requestId"] == "ocr-py-1"


def test_runtime_bridge_ocr_degraded_is_not_success():
    resp = execute_ocr_static_runtime_bridge(
        {
            "kind": "ocr_recognition",
            "scenario": "degraded",
        }
    ).model_dump(exclude_none=True)

    assert resp["ok"] is False
    assert resp["status"] == "degraded"
    assert resp["status"] != "success"
    assert resp["error"]["code"] == "provider_degraded"
    assert "degraded" in resp["warnings"][0].lower()
    assert resp["runtime"]["source"] == "python-ocr-recognition-runtime"


def test_runtime_bridge_ocr_provider_missing_is_not_success():
    resp = execute_ocr_static_runtime_bridge(
        {
            "kind": "ocr_recognition",
            "scenario": "provider_missing",
            "metadata": {"source": "config"},
        }
    ).model_dump(exclude_none=True)

    assert resp["ok"] is False
    assert resp["status"] == "provider_missing"
    assert resp["status"] != "success"
    assert resp["error"]["code"] == "provider_missing"
    assert resp["runtime"]["externalCalls"] is False


def test_runtime_bridge_ocr_error_is_not_success():
    resp = execute_ocr_static_runtime_bridge(
        {
            "kind": "ocr_recognition",
            "scenario": "error",
        }
    ).model_dump(exclude_none=True)

    assert resp["ok"] is False
    assert resp["status"] == "error"
    assert resp["status"] != "success"
    assert resp["error"]["code"] == "runtime_error"


def test_runtime_bridge_static_success_envelope():
    resp = execute_ocr_static_runtime_bridge(
        {
            "kind": "static_webpage_read",
            "query": "https://example.test/doc",
            "content": "Page body from static read.",
        }
    ).model_dump(exclude_none=True)

    assert resp["ok"] is True
    assert resp["status"] == "success"
    assert resp["kind"] == "static_webpage_read"
    assert resp["page"]["content"] == "Page body from static read."
    assert resp["runtime"]["source"] == "python-static-webpage-read-runtime"


@pytest.mark.parametrize(
    "scenario,expected_status,expected_code",
    [
        ("degraded", "degraded", "provider_degraded"),
        ("provider_missing", "provider_missing", "provider_missing"),
        ("error", "error", "runtime_error"),
    ],
)
def test_runtime_bridge_static_non_success_envelopes(scenario, expected_status, expected_code):
    resp = execute_ocr_static_runtime_bridge(
        {
            "kind": "static_webpage_read",
            "query": "https://example.test/fail",
            "scenario": scenario,
        }
    ).model_dump(exclude_none=True)

    assert resp["ok"] is False
    assert resp["status"] == expected_status
    assert resp["status"] != "success"
    assert resp["error"]["code"] == expected_code
    assert resp["runtime"]["backend"] == "python"
