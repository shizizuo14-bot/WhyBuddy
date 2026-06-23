"""Web AIGC external provider ownership closure 102.

Captures the explicit ownership decision for Web AIGC real providers:
- which are python synthetic (internal)
- which remain external-owned or node-retained
- which are skipped-live for real external

This closes the 102 loop so that external-owned/skipped are not part of python migration numerator.
Python produces the ownership matrix; Node consumes for decisions.
No real external provider calls.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

CONTRACT_VERSION = "web_aigc.external_provider_ownership_closure.v1"
PROVENANCE = "python-web-aigc-external-provider-ownership"

OwnershipStatus = Literal["python-owned", "external-owned", "node-retained", "skipped-live"]
Ownership = Literal["python", "external", "node"]

OWNERSHIP_KINDS: List[str] = [
    "web_search", "graph_search", "image_search", "static_webpage_read",
    "vision_analysis", "audio_recognition", "ocr_recognition", "voice_synthesis",
    "file_generation", "file_slicing", "file_translation", "excel_read", "long_text_extraction",
    "ai_ppt_outline", "ai_ppt_slide_plan", "ai_ppt_export",
    "dynamic_chart", "transaction_flow",
]

_PYTHON_OWNED_SYNTHETIC: List[str] = [
    "file_generation", "file_slicing", "file_translation", "excel_read", "long_text_extraction",
    "ai_ppt_outline", "ai_ppt_slide_plan", "ai_ppt_export", "dynamic_chart", "transaction_flow",
]

_EXTERNAL_OWNED_REAL: List[str] = [
    "web_search", "graph_search", "image_search", "static_webpage_read",
    "vision_analysis", "audio_recognition", "ocr_recognition", "voice_synthesis",
]


class ExternalProviderOwnershipEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: str
    status: OwnershipStatus
    ownership: Ownership
    reason: str
    backend: Literal["python"] = "python"
    productionTakeover: bool = False
    requiredEnv: List[str] = Field(default_factory=list)
    externalCalls: Literal[False] = False


class ExternalProviderOwnershipClosure(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contractVersion: str = CONTRACT_VERSION
    provenance: str = PROVENANCE
    ok: bool
    total: int
    counts: Dict[str, int]
    providers: Dict[str, ExternalProviderOwnershipEntry]
    runtime: Dict[str, Any]


def _build_entry(kind: str, status: OwnershipStatus, ownership: Ownership, reason: str, required_env: List[str] = None) -> ExternalProviderOwnershipEntry:
    return ExternalProviderOwnershipEntry(
        kind=kind,
        status=status,
        ownership=ownership,
        reason=reason,
        requiredEnv=required_env or [],
        productionTakeover=False,  # external or synthetic never auto takeover for migration credit
    )


def execute_web_aigc_external_provider_ownership_closure(payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = payload or {}
    simulate = payload.get("simulate") or {}
    force_status = simulate.get("status")
    force_kinds: List[str] = simulate.get("kinds") or []

    providers: Dict[str, ExternalProviderOwnershipEntry] = {}

    for kind in OWNERSHIP_KINDS:
        if kind in _PYTHON_OWNED_SYNTHETIC:
            status: OwnershipStatus = "python-owned"
            ownership: Ownership = "python"
            reason = "synthetic python internal; python-owned"
            req = []
        elif kind in _EXTERNAL_OWNED_REAL:
            status = "external-owned"
            ownership = "external"
            reason = "real external provider; external-owned or node-retained; skipped-live for python migration"
            req = {
                "web_search": ["WEB_SEARCH_API_KEY"],
                "graph_search": ["GRAPH_SEARCH_API_KEY"],
                "image_search": ["IMAGE_SEARCH_API_KEY"],
                "static_webpage_read": ["PAGE_FETCH_API_KEY"],
                "vision_analysis": ["VISION_API_KEY"],
                "audio_recognition": ["AUDIO_STT_API_KEY"],
                "ocr_recognition": ["OCR_API_KEY"],
                "voice_synthesis": ["TTS_API_KEY"],
            }.get(kind, [])
        else:
            status = "skipped-live"
            ownership = "external"
            reason = "skipped for live; out of current scope"
            req = []

        if force_status and (not force_kinds or kind in force_kinds):
            if force_status in ("python-owned", "external-owned", "node-retained", "skipped-live"):
                status = force_status
                if status != "python-owned":
                    ownership = "external" if status != "node-retained" else "node"
                    reason = f"forced {status}"

        entry = _build_entry(kind, status, ownership, reason, req)
        providers[kind] = entry

    counts = {
        "pythonOwned": sum(1 for e in providers.values() if e.status == "python-owned"),
        "externalOwned": sum(1 for e in providers.values() if e.status == "external-owned"),
        "nodeRetained": sum(1 for e in providers.values() if e.status == "node-retained"),
        "skippedLive": sum(1 for e in providers.values() if e.status == "skipped-live"),
    }

    overall_ok = counts["skippedLive"] == 0 and counts["externalOwned"] == 0  # for this closure, truth is reported; ok if no external drag

    return ExternalProviderOwnershipClosure(
        ok=overall_ok,
        total=len(providers),
        counts=counts,
        providers=providers,
        runtime={"owner": "python", "mode": "external_provider_ownership_closure", "externalCalls": False},
    ).model_dump(exclude_none=True)


def get_web_aigc_external_provider_ownership_closure() -> Dict[str, Any]:
    return execute_web_aigc_external_provider_ownership_closure({})
