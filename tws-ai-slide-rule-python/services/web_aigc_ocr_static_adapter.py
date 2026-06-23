"""Bounded fake provider runtime bridge for Web AIGC OCR and static webpage read.

This module defines success/degraded/provider_missing/error envelopes only.
No real OCR, browser, crawler, fetch or external provider calls are performed.
Node adapters map these results while preserving permission/audit/provenance.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


OCR_STATIC_CONTRACT_VERSION = "web_aigc.ocr_static_runtime.v1"

OcrStaticKind = Literal["ocr_recognition", "static_webpage_read"]
OcrStaticStatus = Literal["success", "degraded", "provider_missing", "error"]


def _non_empty(value: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("must be a non-empty string")
    return value.strip()


def _read_optional_str(value: Any) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("must be string or null")
    s = value.strip()
    return s if s else None


class OcrStaticRuntimeMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    backend: Literal["python"] = "python"
    provider: Literal["fake"] = "fake"
    source: str
    externalCalls: Literal[False] = False


class OcrStaticError(BaseModel):
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
    region: Optional[str] = None
    confidence: Optional[float] = None

    @field_validator("text")
    @classmethod
    def _validate_text(cls, value: str) -> str:
        return _non_empty(value)


class OcrPage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    page: int
    text: str


class OcrStaticBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contractVersion: Literal[OCR_STATIC_CONTRACT_VERSION] = OCR_STATIC_CONTRACT_VERSION
    kind: OcrStaticKind
    runtime: OcrStaticRuntimeMetadata
    provenance: Optional[Dict[str, Any]] = None
    permission: Optional[Dict[str, Any]] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class OcrRecognitionSuccess(OcrStaticBase):
    ok: Literal[True] = True
    status: Literal["success"] = "success"
    text: str
    confidence: Optional[float] = None
    fragments: List[OcrFragment] = Field(default_factory=list)
    pages: List[OcrPage] = Field(default_factory=list)
    rawResponse: str = ""


class OcrRecognitionNonSuccess(OcrStaticBase):
    ok: Literal[False] = False
    status: Literal["degraded", "provider_missing", "error"]
    error: OcrStaticError
    warnings: List[str] = Field(default_factory=list)


class StaticPagePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    url: Optional[str] = None
    content: str
    snippet: str
    links: List[Dict[str, str]] = Field(default_factory=list)
    contentSource: Literal["fake_static_page"] = "fake_static_page"
    fetched: Literal[False] = False


class StaticWebpageSuccess(OcrStaticBase):
    ok: Literal[True] = True
    status: Literal["success"] = "success"
    page: StaticPagePayload
    warnings: List[str] = Field(default_factory=list)


class StaticWebpageNonSuccess(OcrStaticBase):
    ok: Literal[False] = False
    status: Literal["degraded", "provider_missing", "error"]
    error: OcrStaticError
    warnings: List[str] = Field(default_factory=list)


OcrStaticResponse = Union[
    OcrRecognitionSuccess,
    OcrRecognitionNonSuccess,
    StaticWebpageSuccess,
    StaticWebpageNonSuccess,
]


def execute_ocr_static_runtime_bridge(payload: Dict[str, Any]) -> OcrStaticResponse:
    """Return bounded fake OCR/static envelope. Never calls real providers."""
    if not isinstance(payload, dict):
        return _make_error("ocr_recognition", "invalid_payload", "payload must be an object")

    kind = _read_kind(payload.get("kind"))
    scenario = _read_scenario(payload.get("scenario"))
    meta = _read_metadata(payload.get("metadata"))
    prov = payload.get("provenance") or payload.get("permission")
    permission = payload.get("permission")

    runtime_source = {
        "ocr_recognition": "python-ocr-recognition-runtime",
        "static_webpage_read": "python-static-webpage-read-runtime",
    }[kind]

    runtime = OcrStaticRuntimeMetadata(source=runtime_source)

    if scenario == "degraded":
        return _make_non_success(
            kind, "degraded", "provider_degraded",
            "OCR/static provider is degraded.",
            warnings=["Provider operating in degraded mode."],
            runtime=runtime,
            metadata=meta,
            provenance=prov,
            permission=permission,
        )

    if scenario == "provider_missing":
        return _make_non_success(
            kind, "provider_missing", "provider_missing",
            "OCR/static provider is not configured.",
            runtime=runtime,
            metadata=meta,
            provenance=prov,
            permission=permission,
        )

    if scenario == "error":
        return _make_non_success(
            kind, "error", "runtime_error",
            "OCR/static runtime failed.",
            runtime=runtime,
            metadata=meta,
            provenance=prov,
            permission=permission,
        )

    # success path
    if kind == "ocr_recognition":
        text = _read_string(payload.get("content"), "Fake OCR extracted text from python runtime.", "content")
        return OcrRecognitionSuccess(
            kind=kind,
            runtime=runtime,
            text=text,
            confidence=0.91,
            fragments=[OcrFragment(text=text, page=1)],
            pages=[OcrPage(page=1, text=text)],
            rawResponse=f'{{"text":"{text}"}}',
            metadata=meta,
            provenance=prov,
            permission=permission,
        )

    # static success
    q = _read_string(payload.get("query"), "https://example.test/static", "query")
    content = _read_string(payload.get("content"), "Fake static webpage content extracted by python runtime.", "content")
    page = StaticPagePayload(
        title=f"Fake static page: {q}",
        url=q if q.startswith("http") else None,
        content=content,
        snippet=content[:120],
    )
    return StaticWebpageSuccess(
        kind=kind,
        runtime=runtime,
        page=page,
        metadata=meta,
        provenance=prov,
        permission=permission,
    )


def _read_kind(value: Any) -> OcrStaticKind:
    if value in {"ocr_recognition", "static_webpage_read"}:
        return value
    return "ocr_recognition"


def _read_scenario(value: Any) -> str:
    if value in {"success", "degraded", "provider_missing", "error"}:
        return value
    return "success"


def _read_string(value: Any, default: str, field: str) -> str:
    if value is None:
        return default
    if isinstance(value, str):
        s = value.strip()
        return s if s else default
    return default


def _read_metadata(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    return {}


def _make_non_success(
    kind: OcrStaticKind,
    status: Literal["degraded", "provider_missing", "error"],
    code: str,
    message: str,
    *,
    warnings: Optional[List[str]] = None,
    runtime: OcrStaticRuntimeMetadata,
    metadata: Dict[str, Any],
    provenance: Any = None,
    permission: Any = None,
) -> Union[OcrRecognitionNonSuccess, StaticWebpageNonSuccess]:
    err = OcrStaticError(code=code, message=message)
    base = {
        "kind": kind,
        "runtime": runtime,
        "error": err,
        "warnings": warnings or [],
        "metadata": metadata,
    }
    if provenance is not None:
        base["provenance"] = provenance
    if permission is not None:
        base["permission"] = permission
    if kind == "ocr_recognition":
        return OcrRecognitionNonSuccess(status=status, **base)  # type: ignore[arg-type]
    return StaticWebpageNonSuccess(status=status, **base)  # type: ignore[arg-type]


def _make_error(kind: OcrStaticKind, code: str, message: str) -> OcrRecognitionNonSuccess:
    return OcrRecognitionNonSuccess(
        kind=kind,
        status="error",
        error=OcrStaticError(code=code, message=message),
        runtime=OcrStaticRuntimeMetadata(source="python-ocr-recognition-runtime"),
    )
