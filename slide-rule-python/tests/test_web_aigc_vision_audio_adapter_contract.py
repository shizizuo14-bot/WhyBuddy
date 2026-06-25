"""Contract tests for web AIGC vision/audio adapter result shapes.

This slice deliberately uses a fake runtime. It proves that Python can
describe OCR, audio recognition, vision analysis, and voice synthesis outcomes
without sending real image, audio, STT, TTS, or multimodal provider requests.
"""

import os
import sys

import pytest
from pydantic import ValidationError

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.web_aigc_media_adapter import (  # noqa: E402
    MEDIA_ADAPTER_CONTRACT_VERSION,
    MediaAdapterErrorResponse,
    OcrRecognitionSuccessResponse,
    execute_fake_media_adapter,
)


def test_ocr_success_returns_media_metadata_confidence_and_fragments():
    response = execute_fake_media_adapter(
        {
            "kind": "ocr_recognition",
            "inputName": "receipt.png",
            "mimeType": "image/png",
            "content": "Total: 12.00",
            "confidence": 0.91,
            "metadata": {"width": 800, "height": 600},
        }
    ).model_dump(exclude_none=True)

    assert response["ok"] is True
    assert response["contractVersion"] == MEDIA_ADAPTER_CONTRACT_VERSION
    assert response["kind"] == "ocr_recognition"
    assert response["status"] == "success"
    assert response["media"] == {
        "name": "receipt.png",
        "mimeType": "image/png",
        "metadata": {"width": 800, "height": 600},
    }
    assert response["media"].get("durationMs") is None
    assert response["text"] == "Total: 12.00"
    assert response["confidence"] == 0.91
    assert response["fragments"][0] == {
        "text": "Total: 12.00",
        "page": 1,
        "confidence": 0.91,
    }
    assert response["pages"] == [{"page": 1, "text": "Total: 12.00"}]
    assert response["provenance"] == {
        "provider": "fake",
        "runtime": "python-contract",
        "kind": "ocr_recognition",
    }


def test_audio_recognition_success_returns_duration_mime_and_segment_confidence():
    response = execute_fake_media_adapter(
        {
            "kind": "audio_recognition",
            "inputName": "meeting.webm",
            "mimeType": "audio/webm",
            "durationMs": 4200,
            "content": "Please summarize the meeting.",
            "confidence": 0.87,
            "language": "en-US",
        }
    ).model_dump(exclude_none=True)

    assert response["ok"] is True
    assert response["kind"] == "audio_recognition"
    assert response["status"] == "success"
    assert response["transcript"] == "Please summarize the meeting."
    assert response["confidence"] == 0.87
    assert response["language"] == "en-US"
    assert response["media"]["mimeType"] == "audio/webm"
    assert response["media"]["durationMs"] == 4200
    assert response["segments"] == [
        {
            "index": 0,
            "text": "Please summarize the meeting.",
            "confidence": 0.87,
            "startMs": 0,
            "endMs": 4200,
        }
    ]


def test_vision_success_returns_description_elements_text_and_confidence():
    response = execute_fake_media_adapter(
        {
            "kind": "vision_analysis",
            "inputName": "dashboard.png",
            "mimeType": "image/png",
            "content": "Dashboard with chart and status cards",
            "confidence": 0.83,
        }
    ).model_dump(exclude_none=True)

    assert response["ok"] is True
    assert response["kind"] == "vision_analysis"
    assert response["status"] == "success"
    assert response["description"] == "Dashboard with chart and status cards"
    assert response["elements"] == ["dashboard", "chart", "status cards"]
    assert response["textContent"] == ""
    assert response["confidence"] == 0.83
    assert response["media"]["mimeType"] == "image/png"


def test_voice_success_returns_fake_audio_payload_metadata_and_confidence():
    response = execute_fake_media_adapter(
        {
            "kind": "voice_synthesis",
            "inputName": "reply.mp3",
            "mimeType": "audio/mpeg",
            "durationMs": 1800,
            "content": "Hello from the fake voice runtime.",
            "confidence": 1,
            "voice": "alloy",
        }
    ).model_dump(exclude_none=True)

    assert response["ok"] is True
    assert response["kind"] == "voice_synthesis"
    assert response["status"] == "success"
    assert response["audio"]["mimeType"] == "audio/mpeg"
    assert response["audio"]["durationMs"] == 1800
    assert response["audio"]["byteLength"] > 0
    assert response["voice"] == "alloy"
    assert response["confidence"] == 1
    assert response["media"]["metadata"]["generated"] is True


@pytest.mark.parametrize(
    "kind,error_code",
    [
        ("ocr_recognition", "fake_ocr_error"),
        ("audio_recognition", "fake_audio_recognition_error"),
        ("vision_analysis", "fake_vision_error"),
        ("voice_synthesis", "fake_voice_error"),
    ],
)
def test_error_result_preserves_stable_error_code_and_media_fields(kind: str, error_code: str):
    response = execute_fake_media_adapter(
        {
            "kind": kind,
            "scenario": "error",
            "inputName": "failed-media.bin",
            "mimeType": "application/octet-stream",
            "durationMs": 1,
        }
    ).model_dump(exclude_none=True)

    assert response["ok"] is False
    assert response["kind"] == kind
    assert response["status"] == "error"
    assert response["errorCode"] == error_code
    assert response["error"] == {
        "code": error_code,
        "message": "Fake media adapter runtime failed.",
    }
    assert response["media"]["name"] == "failed-media.bin"
    assert response["media"]["mimeType"] == "application/octet-stream"
    assert response["media"]["durationMs"] == 1


def test_permission_denied_preserves_permission_metadata_without_external_calls():
    response = execute_fake_media_adapter(
        {
            "kind": "audio_recognition",
            "inputName": "blocked.webm",
            "mimeType": "audio/webm",
            "permission": {
                "allowed": False,
                "reason": "policy_denied",
                "auditId": "audit-media-denied",
            },
        }
    ).model_dump(exclude_none=True)

    assert response["ok"] is False
    assert response["status"] == "permission_denied"
    assert response["errorCode"] == "permission_denied"
    assert response["provenance"]["permission"] == {
        "allowed": False,
        "reason": "policy_denied",
        "auditId": "audit-media-denied",
    }


def test_contract_rejects_ocr_success_without_fragments():
    with pytest.raises(ValidationError):
        OcrRecognitionSuccessResponse(
            kind="ocr_recognition",
            media={"name": "missing.png", "mimeType": "image/png"},
            text="Missing fragments",
            confidence=0.5,
            fragments=[],
            pages=[{"page": 1, "text": "Missing fragments"}],
            provenance={
                "provider": "fake",
                "runtime": "python-contract",
                "kind": "ocr_recognition",
            },
        )


def test_error_contract_rejects_success_status():
    with pytest.raises(ValidationError):
        MediaAdapterErrorResponse(
            kind="vision_analysis",
            status="success",
            errorCode="fake_vision_error",
            error={
                "code": "fake_vision_error",
                "message": "Fake media adapter runtime failed.",
            },
            media={"name": "bad.png", "mimeType": "image/png"},
            provenance={
                "provider": "fake",
                "runtime": "python-contract",
                "kind": "vision_analysis",
            },
        )
