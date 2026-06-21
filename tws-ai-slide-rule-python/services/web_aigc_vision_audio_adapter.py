"""Runtime bridge for web AIGC vision and audio adapter evidence.

This module wraps the existing fake media adapter so production wiring smoke
can prove provenance and safe failure without calling image, audio, STT, TTS,
or multimodal providers.
"""

from __future__ import annotations

from typing import Any, Dict, Literal

from pydantic import BaseModel, ConfigDict, field_validator

from services.web_aigc_media_adapter import MediaAdapterKind, execute_fake_media_adapter


def _non_empty(value: str) -> str:
    if not value.strip():
        raise ValueError("must be a non-empty string")
    return value


class MediaRuntimeBridgeMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    backend: Literal["python"] = "python"
    provider: Literal["fake"] = "fake"
    source: str
    externalCalls: Literal[False] = False

    @field_validator("source")
    @classmethod
    def _validate_source(cls, value: str) -> str:
        return _non_empty(value)


class MediaRuntimeBridgeResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    runtime: MediaRuntimeBridgeMetadata


def execute_media_runtime_bridge(payload: Dict[str, Any]) -> MediaRuntimeBridgeResponse:
    """Project a Python media runtime bridge response without external calls."""

    response = execute_fake_media_adapter(payload)
    dumped = response.model_dump(exclude_none=True)
    dumped["runtime"] = MediaRuntimeBridgeMetadata(
        source=_runtime_source_for_kind(response.kind),
    ).model_dump()
    return MediaRuntimeBridgeResponse(**dumped)


def _runtime_source_for_kind(kind: MediaAdapterKind) -> str:
    return {
        "ocr_recognition": "python-ocr-recognition-runtime",
        "audio_recognition": "python-audio-recognition-runtime",
        "vision_analysis": "python-vision-analysis-runtime",
        "voice_synthesis": "python-voice-synthesis-runtime",
    }[kind]
