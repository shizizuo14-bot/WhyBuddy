"""Fake-runtime contract for web AIGC vision and audio adapters.

The real OCR, audio recognition, vision, and voice providers remain Node-owned
for this migration slice. Python only defines stable result shapes and a
side-effect-free fake runtime.
"""

from __future__ import annotations

import base64
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


MEDIA_ADAPTER_CONTRACT_VERSION = "web_aigc.media_adapter.v1"

MediaAdapterKind = Literal[
    "ocr_recognition",
    "audio_recognition",
    "vision_analysis",
    "voice_synthesis",
]
MediaAdapterScenario = Literal["success", "error"]
MediaAdapterStatus = Literal["success", "error", "permission_denied"]

_DEFAULT_MIME_BY_KIND: Dict[MediaAdapterKind, str] = {
    "ocr_recognition": "image/png",
    "audio_recognition": "audio/webm",
    "vision_analysis": "image/png",
    "voice_synthesis": "audio/mpeg",
}
_ERROR_CODE_BY_KIND: Dict[MediaAdapterKind, str] = {
    "ocr_recognition": "fake_ocr_error",
    "audio_recognition": "fake_audio_recognition_error",
    "vision_analysis": "fake_vision_error",
    "voice_synthesis": "fake_voice_error",
}


def _non_empty(value: str) -> str:
    if not value.strip():
        raise ValueError("must be a non-empty string")
    return value


def _read_string(value: Any, fallback: str, field: str) -> str:
    if value is None:
        return fallback
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string")
    return _non_empty(value)


def _read_duration(value: Any) -> Optional[int]:
    if value is None:
        return None
    if not isinstance(value, int) or value < 0:
        raise ValueError("durationMs must be a non-negative integer")
    return value


def _read_confidence(value: Any, fallback: Optional[float]) -> Optional[float]:
    if value is None:
        return fallback
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise ValueError("confidence must be a number between 0 and 1")
    normalized = float(value)
    if normalized < 0 or normalized > 1:
        raise ValueError("confidence must be between 0 and 1")
    return normalized


def _read_metadata(value: Any) -> Dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValueError("metadata must be an object")
    return dict(value)


def _split_elements(description: str) -> List[str]:
    lowered = description.lower()
    elements: List[str] = []
    for keyword in ["dashboard", "chart", "status cards", "text", "image"]:
        if keyword in lowered:
            elements.append(keyword)
    return elements or ["fake media subject"]


class MediaPermission(BaseModel):
    model_config = ConfigDict(extra="allow")

    allowed: bool = True
    reason: Optional[str] = None
    auditId: Optional[str] = None
    specified: bool = False

    @field_validator("reason", "auditId")
    @classmethod
    def _validate_optional_non_empty(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        return _non_empty(value)


class MediaPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    mimeType: str
    durationMs: Optional[int] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("name", "mimeType")
    @classmethod
    def _validate_non_empty(cls, value: str) -> str:
        return _non_empty(value)


class MediaAdapterProvenance(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: Literal["fake"] = "fake"
    runtime: Literal["python-contract"] = "python-contract"
    kind: MediaAdapterKind
    permission: Optional[Dict[str, Any]] = None


class MediaAdapterError(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str

    @field_validator("code", "message")
    @classmethod
    def _validate_non_empty(cls, value: str) -> str:
        return _non_empty(value)


class OcrFragment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    page: int
    confidence: Optional[float] = None

    @field_validator("text")
    @classmethod
    def _validate_text(cls, value: str) -> str:
        return _non_empty(value)


class OcrPage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    page: int
    text: str


class AudioSegment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    index: int
    text: str
    confidence: Optional[float] = None
    startMs: int = 0
    endMs: Optional[int] = None

    @field_validator("text")
    @classmethod
    def _validate_text(cls, value: str) -> str:
        return _non_empty(value)


class VoiceAudioPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mimeType: str
    durationMs: Optional[int] = None
    byteLength: int
    dataBase64: str

    @field_validator("mimeType", "dataBase64")
    @classmethod
    def _validate_non_empty(cls, value: str) -> str:
        return _non_empty(value)


class MediaAdapterBaseResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contractVersion: Literal[MEDIA_ADAPTER_CONTRACT_VERSION] = MEDIA_ADAPTER_CONTRACT_VERSION
    kind: MediaAdapterKind
    media: MediaPayload
    provenance: MediaAdapterProvenance

    @model_validator(mode="after")
    def _validate_provenance_kind(self) -> "MediaAdapterBaseResponse":
        if self.provenance.kind != self.kind:
            raise ValueError("provenance kind must match adapter kind")
        return self


class OcrRecognitionSuccessResponse(MediaAdapterBaseResponse):
    ok: Literal[True] = True
    kind: Literal["ocr_recognition"]
    status: Literal["success"] = "success"
    text: str
    confidence: Optional[float] = None
    fragments: List[OcrFragment]
    pages: List[OcrPage]
    rawResponse: str

    @model_validator(mode="after")
    def _validate_ocr_payload(self) -> "OcrRecognitionSuccessResponse":
        if not self.fragments:
            raise ValueError("ocr success requires at least one fragment")
        if not self.pages:
            raise ValueError("ocr success requires at least one page")
        return self


class AudioRecognitionSuccessResponse(MediaAdapterBaseResponse):
    ok: Literal[True] = True
    kind: Literal["audio_recognition"]
    status: Literal["success"] = "success"
    transcript: str
    confidence: Optional[float] = None
    language: Optional[str] = None
    segments: List[AudioSegment]

    @field_validator("transcript")
    @classmethod
    def _validate_transcript(cls, value: str) -> str:
        return _non_empty(value)

    @model_validator(mode="after")
    def _validate_audio_payload(self) -> "AudioRecognitionSuccessResponse":
        if not self.segments:
            raise ValueError("audio recognition success requires at least one segment")
        return self


class VisionAnalysisSuccessResponse(MediaAdapterBaseResponse):
    ok: Literal[True] = True
    kind: Literal["vision_analysis"]
    status: Literal["success"] = "success"
    description: str
    elements: List[str] = Field(default_factory=list)
    textContent: str = ""
    confidence: Optional[float] = None
    rawResponse: str

    @field_validator("description", "rawResponse")
    @classmethod
    def _validate_non_empty(cls, value: str) -> str:
        return _non_empty(value)


class VoiceSynthesisSuccessResponse(MediaAdapterBaseResponse):
    ok: Literal[True] = True
    kind: Literal["voice_synthesis"]
    status: Literal["success"] = "success"
    text: str
    voice: str
    confidence: Optional[float] = None
    audio: VoiceAudioPayload

    @field_validator("text", "voice")
    @classmethod
    def _validate_non_empty(cls, value: str) -> str:
        return _non_empty(value)


class MediaAdapterErrorResponse(MediaAdapterBaseResponse):
    ok: Literal[False] = False
    status: Literal["error", "permission_denied"]
    errorCode: str
    error: MediaAdapterError

    @field_validator("errorCode")
    @classmethod
    def _validate_error_code(cls, value: str) -> str:
        return _non_empty(value)

    @model_validator(mode="after")
    def _validate_error_code_matches_error(self) -> "MediaAdapterErrorResponse":
        if self.errorCode != self.error.code:
            raise ValueError("errorCode must match error.code")
        return self


MediaAdapterResponse = Union[
    OcrRecognitionSuccessResponse,
    AudioRecognitionSuccessResponse,
    VisionAnalysisSuccessResponse,
    VoiceSynthesisSuccessResponse,
    MediaAdapterErrorResponse,
]


def execute_fake_media_adapter(payload: Dict[str, Any]) -> MediaAdapterResponse:
    """Return a fake media adapter response without external media calls."""

    if not isinstance(payload, dict):
        raise ValueError("payload must be an object")

    kind = _read_kind(payload.get("kind"))
    scenario = _read_scenario(payload.get("scenario"))
    permission = _read_permission(payload.get("permission"))
    media = _build_media(kind, payload)
    provenance = _build_provenance(kind, permission)

    if not permission.allowed:
        return MediaAdapterErrorResponse(
            kind=kind,
            status="permission_denied",
            errorCode="permission_denied",
            error=MediaAdapterError(
                code="permission_denied",
                message="Media adapter execution denied by permission policy.",
            ),
            media=media,
            provenance=provenance,
        )

    if scenario == "error":
        error_code = _ERROR_CODE_BY_KIND[kind]
        return MediaAdapterErrorResponse(
            kind=kind,
            status="error",
            errorCode=error_code,
            error=MediaAdapterError(
                code=error_code,
                message="Fake media adapter runtime failed.",
            ),
            media=media,
            provenance=provenance,
        )

    content = _read_string(payload.get("content"), _default_content(kind), "content")
    confidence = _read_confidence(payload.get("confidence"), _default_confidence(kind))

    if kind == "ocr_recognition":
        fragment = OcrFragment(text=content, page=1, confidence=confidence)
        return OcrRecognitionSuccessResponse(
            kind=kind,
            media=media,
            provenance=provenance,
            text=content,
            confidence=confidence,
            fragments=[fragment],
            pages=[OcrPage(page=1, text=content)],
            rawResponse=f'{{"text":"{content}"}}',
        )

    if kind == "audio_recognition":
        return AudioRecognitionSuccessResponse(
            kind=kind,
            media=media,
            provenance=provenance,
            transcript=content,
            confidence=confidence,
            language=_read_optional_string(payload.get("language"), "language"),
            segments=[
                AudioSegment(
                    index=0,
                    text=content,
                    confidence=confidence,
                    startMs=0,
                    endMs=media.durationMs,
                )
            ],
        )

    if kind == "vision_analysis":
        return VisionAnalysisSuccessResponse(
            kind=kind,
            media=media,
            provenance=provenance,
            description=content,
            elements=_split_elements(content),
            textContent=_read_string(payload.get("textContent"), "", "textContent")
            if payload.get("textContent") is not None
            else "",
            confidence=confidence,
            rawResponse=content,
        )

    audio_bytes = f"fake voice audio:{content}".encode("utf-8")
    media.metadata["generated"] = True
    return VoiceSynthesisSuccessResponse(
        kind=kind,
        media=media,
        provenance=provenance,
        text=content,
        voice=_read_string(payload.get("voice"), "alloy", "voice"),
        confidence=confidence,
        audio=VoiceAudioPayload(
            mimeType=media.mimeType,
            durationMs=media.durationMs,
            byteLength=len(audio_bytes),
            dataBase64=base64.b64encode(audio_bytes).decode("ascii"),
        ),
    )


def _read_kind(value: Any) -> MediaAdapterKind:
    if value in _DEFAULT_MIME_BY_KIND:
        return value
    raise ValueError("kind must be ocr_recognition, audio_recognition, vision_analysis, or voice_synthesis")


def _read_scenario(value: Any) -> MediaAdapterScenario:
    if value in {"success", "error"}:
        return value
    if value is None:
        return "success"
    raise ValueError("scenario must be success or error")


def _read_permission(value: Any) -> MediaPermission:
    if value is None:
        return MediaPermission()
    if not isinstance(value, dict):
        raise ValueError("permission must be an object")
    return MediaPermission(**value, specified=True)


def _read_optional_string(value: Any, field: str) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string")
    return _non_empty(value)


def _build_media(kind: MediaAdapterKind, payload: Dict[str, Any]) -> MediaPayload:
    metadata = _read_metadata(payload.get("metadata"))
    return MediaPayload(
        name=_read_string(payload.get("inputName"), _default_name(kind), "inputName"),
        mimeType=_read_string(payload.get("mimeType"), _DEFAULT_MIME_BY_KIND[kind], "mimeType"),
        durationMs=_read_duration(payload.get("durationMs")),
        metadata=metadata,
    )


def _build_provenance(kind: MediaAdapterKind, permission: MediaPermission) -> MediaAdapterProvenance:
    permission_payload = permission.model_dump(exclude_none=True, exclude={"specified"})
    return MediaAdapterProvenance(
        provider="fake",
        runtime="python-contract",
        kind=kind,
        permission=permission_payload if permission.specified else None,
    )


def _default_name(kind: MediaAdapterKind) -> str:
    return {
        "ocr_recognition": "fake-ocr.png",
        "audio_recognition": "fake-audio.webm",
        "vision_analysis": "fake-vision.png",
        "voice_synthesis": "fake-voice.mp3",
    }[kind]


def _default_content(kind: MediaAdapterKind) -> str:
    return {
        "ocr_recognition": "Fake OCR text.",
        "audio_recognition": "Fake audio transcript.",
        "vision_analysis": "Fake vision description.",
        "voice_synthesis": "Fake voice synthesis text.",
    }[kind]


def _default_confidence(kind: MediaAdapterKind) -> Optional[float]:
    return {
        "ocr_recognition": 0.9,
        "audio_recognition": 0.85,
        "vision_analysis": 0.8,
        "voice_synthesis": 1.0,
    }[kind]
