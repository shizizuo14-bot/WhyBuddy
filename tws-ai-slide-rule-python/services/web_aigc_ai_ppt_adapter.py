"""Bounded fake provider runtime bridge for Web AIGC AI PPT outline/slide plan/export intent.

This module defines success/degraded/provider_missing/error envelopes only.
No real LLM, PPT SDK, file generation, storage or external provider calls are performed.
Node adapters map these results while preserving permission/audit/provenance.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator


AI_PPT_CONTRACT_VERSION = "web_aigc.ai_ppt_runtime.v1"

AiPptIntent = Literal["outline", "slide_plan", "export_intent"]
AiPptStatus = Literal["success", "degraded", "provider_missing", "error"]


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


class AiPptRuntimeMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    backend: Literal["python"] = "python"
    provider: Literal["fake"] = "fake"
    source: str
    externalCalls: Literal[False] = False


class AiPptError(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str

    @field_validator("code", "message")
    @classmethod
    def _validate_non_empty(cls, value: str) -> str:
        return _non_empty(value)


class AiPptSlide(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slideNumber: int
    title: str
    bullets: List[str] = Field(default_factory=list)
    speakerNotes: Optional[str] = None

    @field_validator("title")
    @classmethod
    def _validate_title(cls, value: str) -> str:
        return _non_empty(value)


class AiPptDeckPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    summary: str
    slides: List[AiPptSlide] = Field(default_factory=list)


class AiPptRuntimeBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contractVersion: Literal[AI_PPT_CONTRACT_VERSION] = AI_PPT_CONTRACT_VERSION
    intent: AiPptIntent
    runtime: AiPptRuntimeMetadata
    provenance: Optional[Dict[str, Any]] = None
    permission: Optional[Dict[str, Any]] = None
    audit: Optional[Dict[str, Any]] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AiPptSuccess(AiPptRuntimeBase):
    ok: Literal[True] = True
    status: Literal["success"] = "success"
    plan: AiPptDeckPlan
    warnings: List[str] = Field(default_factory=list)


class AiPptNonSuccess(AiPptRuntimeBase):
    ok: Literal[False] = False
    status: Literal["degraded", "provider_missing", "error"]
    error: AiPptError
    warnings: List[str] = Field(default_factory=list)


AiPptRuntimeResponse = Union[AiPptSuccess, AiPptNonSuccess]


def execute_ai_ppt_runtime_bridge(payload: Dict[str, Any]) -> AiPptRuntimeResponse:
    """Return bounded fake AI PPT outline/slide-plan/export-intent envelope. Never calls real providers."""
    if not isinstance(payload, dict):
        return _make_error("outline", "invalid_payload", "payload must be an object")

    intent = _read_intent(payload.get("intent") or payload.get("kind"))
    scenario = _read_scenario(payload.get("scenario"))
    meta = _read_metadata(payload.get("metadata"))
    prov = payload.get("provenance")
    permission = payload.get("permission")
    audit = payload.get("audit")

    runtime_source = {
        "outline": "python-ai-ppt-outline-runtime",
        "slide_plan": "python-ai-ppt-slide-plan-runtime",
        "export_intent": "python-ai-ppt-export-intent-runtime",
    }[intent]

    runtime = AiPptRuntimeMetadata(source=runtime_source)

    if scenario == "degraded":
        return _make_non_success(
            intent,
            "degraded",
            "provider_degraded",
            "AI PPT provider is degraded.",
            warnings=["Provider operating in degraded mode."],
            runtime=runtime,
            metadata=meta,
            provenance=prov,
            permission=permission,
            audit=audit,
        )

    if scenario == "provider_missing":
        return _make_non_success(
            intent,
            "provider_missing",
            "provider_missing",
            "AI PPT provider is not configured.",
            runtime=runtime,
            metadata=meta,
            provenance=prov,
            permission=permission,
            audit=audit,
        )

    if scenario == "error":
        return _make_non_success(
            intent,
            "error",
            "runtime_error",
            "AI PPT runtime failed.",
            runtime=runtime,
            metadata=meta,
            provenance=prov,
            permission=permission,
            audit=audit,
        )

    # success path: provide a deterministic fake plan
    topic = _read_string(payload.get("topic"), "AI PPT 主题", "topic")
    slide_count = _normalize_slide_count(payload.get("slideCount"))

    slides: List[AiPptSlide] = []
    for i in range(slide_count):
        slide_num = i + 1
        if i == 0:
            title = f"{topic} 概览"
            bullets = [f"主题：{topic}", "核心要点概述"]
        elif i == slide_count - 1:
            title = f"{topic} 总结与行动"
            bullets = ["关键结论", "后续步骤建议"]
        else:
            title = f"{topic} 第 {slide_num} 页"
            bullets = [f"要点 {slide_num}", "补充信息"]

        slides.append(
            AiPptSlide(
                slideNumber=slide_num,
                title=title,
                bullets=bullets,
                speakerNotes=f"面向受众讲解第 {slide_num} 页内容。",
            )
        )

    plan = AiPptDeckPlan(
        title=topic,
        summary=payload.get("brief") or payload.get("sourceText") or f"围绕 {topic} 的演示文稿大纲。",
        slides=slides,
    )

    return AiPptSuccess(
        intent=intent,
        runtime=runtime,
        plan=plan,
        metadata=meta,
        provenance=prov,
        permission=permission,
        audit=audit,
    )


def _read_intent(value: Any) -> AiPptIntent:
    if value in {"outline", "slide_plan", "export_intent"}:
        return value
    return "outline"


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


def _normalize_slide_count(value: Any) -> int:
    if isinstance(value, (int, float)) and value > 0:
        return max(3, min(12, int(value)))
    return 5


def _make_non_success(
    intent: AiPptIntent,
    status: Literal["degraded", "provider_missing", "error"],
    code: str,
    message: str,
    *,
    warnings: Optional[List[str]] = None,
    runtime: AiPptRuntimeMetadata,
    metadata: Dict[str, Any],
    provenance: Any = None,
    permission: Any = None,
    audit: Any = None,
) -> AiPptNonSuccess:
    err = AiPptError(code=code, message=message)
    base: Dict[str, Any] = {
        "intent": intent,
        "runtime": runtime,
        "error": err,
        "warnings": warnings or [],
        "metadata": metadata,
    }
    if provenance is not None:
        base["provenance"] = provenance
    if permission is not None:
        base["permission"] = permission
    if audit is not None:
        base["audit"] = audit
    return AiPptNonSuccess(status=status, **base)  # type: ignore[arg-type]


def _make_error(intent: AiPptIntent, code: str, message: str) -> AiPptNonSuccess:
    return AiPptNonSuccess(
        intent=intent,
        status="error",
        error=AiPptError(code=code, message=message),
        runtime=AiPptRuntimeMetadata(source="python-ai-ppt-outline-runtime"),
    )
