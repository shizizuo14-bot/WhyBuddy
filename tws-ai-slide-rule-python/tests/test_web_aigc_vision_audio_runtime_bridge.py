"""Runtime bridge tests for web AIGC vision/audio adapter shapes.

The bridge is fake-runtime backed so production wiring smoke can prove safe
failure and provenance without image, audio, STT, TTS, or multimodal calls.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.web_aigc_vision_audio_adapter import execute_media_runtime_bridge  # noqa: E402


@pytest.mark.parametrize(
    ("kind", "expected_source"),
    [
        ("ocr_recognition", "python-ocr-recognition-runtime"),
        ("audio_recognition", "python-audio-recognition-runtime"),
        ("vision_analysis", "python-vision-analysis-runtime"),
        ("voice_synthesis", "python-voice-synthesis-runtime"),
    ],
)
def test_runtime_bridge_projects_all_media_shapes_without_external_calls(
    kind: str,
    expected_source: str,
):
    response = execute_media_runtime_bridge(
        {
            "kind": kind,
            "inputName": "runtime.bin",
            "mimeType": "application/octet-stream",
            "content": "runtime bridge media",
            "permission": {"allowed": True, "auditId": "audit-media-runtime-1"},
        }
    ).model_dump(exclude_none=True)

    assert response["ok"] is True
    assert response["kind"] == kind
    assert response["status"] == "success"
    assert response["runtime"] == {
        "backend": "python",
        "provider": "fake",
        "source": expected_source,
        "externalCalls": False,
    }
    assert response["provenance"]["provider"] == "fake"
    assert response["provenance"]["runtime"] == "python-contract"
    assert response["provenance"]["permission"] == {
        "allowed": True,
        "auditId": "audit-media-runtime-1",
    }


def test_runtime_bridge_error_is_not_success_and_keeps_error_envelope():
    response = execute_media_runtime_bridge(
        {
            "kind": "vision_analysis",
            "scenario": "error",
            "inputName": "failed.png",
            "mimeType": "image/png",
        }
    ).model_dump(exclude_none=True)

    assert response["ok"] is False
    assert response["status"] == "error"
    assert response["status"] != "success"
    assert response["errorCode"] == "fake_vision_error"
    assert response["error"]["code"] == "fake_vision_error"
    assert response["runtime"] == {
        "backend": "python",
        "provider": "fake",
        "source": "python-vision-analysis-runtime",
        "externalCalls": False,
    }


def test_runtime_bridge_permission_denied_preserves_audit_fields():
    response = execute_media_runtime_bridge(
        {
            "kind": "audio_recognition",
            "inputName": "blocked.webm",
            "mimeType": "audio/webm",
            "permission": {
                "allowed": False,
                "reason": "policy_denied",
                "auditId": "audit-media-runtime-denied",
            },
        }
    ).model_dump(exclude_none=True)

    assert response["ok"] is False
    assert response["status"] == "permission_denied"
    assert response["status"] != "success"
    assert response["errorCode"] == "permission_denied"
    assert response["runtime"] == {
        "backend": "python",
        "provider": "fake",
        "source": "python-audio-recognition-runtime",
        "externalCalls": False,
    }
    assert response["provenance"]["permission"] == {
        "allowed": False,
        "reason": "policy_denied",
        "auditId": "audit-media-runtime-denied",
    }
