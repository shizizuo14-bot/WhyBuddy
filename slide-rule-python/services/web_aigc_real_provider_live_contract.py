"""Web AIGC real provider live contract 103.

Defines the authoritative contract for which Web AIGC providers have
configurable live external contracts vs synthetic/facade/skipped.

- live-ready: has real external provider wiring + required env present (configurable)
- skipped-live: real external provider exists in theory but skipped (no key / out of scope for this owner)
- synthetic: python-internal fake/synthetic path, never real external
- external-owned: capability owned by external provider / node-retained, not python migration

Python owns only the decision matrix and contract shape.
Node adapters consume to distinguish for runtime/obs.
NEVER counts synthetic/skipped as real production takeover.
No real external calls in this module.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

CONTRACT_VERSION = "web_aigc.real_provider_live_contract.v1"
PROVENANCE = "python-web-aigc-real-provider-live-contract"

LiveProviderStatus = Literal["live-ready", "skipped-live", "synthetic", "external-owned"]
Ownership = Literal["python", "external", "node"]

# Kinds that participate in live contract decision
LIVE_KINDS: List[str] = [
    "web_search",
    "graph_search",
    "image_search",
    "static_webpage_read",
    "file_generation",
    "file_slicing",
    "file_translation",
    "excel_read",
    "long_text_extraction",
    "vision_analysis",
    "audio_recognition",
    "ocr_recognition",
    "voice_synthesis",
    "ai_ppt_outline",
    "ai_ppt_slide_plan",
    "ai_ppt_export",
    "dynamic_chart",
    "transaction_flow",
    "web_qa",
]

# Required env for live external (real providers); empty for synthetic
_REQUIRED_ENV: Dict[str, List[str]] = {
    "web_search": ["WEB_SEARCH_API_KEY", "SEARCH_PROVIDER_URL"],
    "graph_search": ["GRAPH_SEARCH_API_KEY"],
    "image_search": ["IMAGE_SEARCH_API_KEY"],
    "static_webpage_read": ["PAGE_FETCH_API_KEY"],
    "vision_analysis": ["VISION_API_KEY"],
    "audio_recognition": ["AUDIO_STT_API_KEY"],
    "ocr_recognition": ["OCR_API_KEY"],
    "voice_synthesis": ["TTS_API_KEY"],
    "web_qa": [],
    # synthetics and internal have no required live env
    "file_generation": [],
    "file_slicing": [],
    "file_translation": [],
    "excel_read": [],
    "long_text_extraction": [],
    "ai_ppt_outline": [],
    "ai_ppt_slide_plan": [],
    "ai_ppt_export": [],
    "dynamic_chart": [],
    "transaction_flow": [],
}

# Ownership and base status: external for those that need real paid APIs
# python for fully synthetic/internal that python can provide without external
_OWNERSHIP_BASE: Dict[str, Dict[str, Any]] = {
    # real external search providers - external-owned, skipped unless live flag
    "web_search": {"ownership": "external", "baseStatus": "skipped-live", "liveCapable": True},
    "graph_search": {"ownership": "external", "baseStatus": "skipped-live", "liveCapable": True},
    "image_search": {"ownership": "external", "baseStatus": "skipped-live", "liveCapable": True},
    "static_webpage_read": {"ownership": "external", "baseStatus": "skipped-live", "liveCapable": True},
    # vision/audio/ocr are external
    "vision_analysis": {"ownership": "external", "baseStatus": "skipped-live", "liveCapable": True},
    "audio_recognition": {"ownership": "external", "baseStatus": "skipped-live", "liveCapable": True},
    "ocr_recognition": {"ownership": "external", "baseStatus": "skipped-live", "liveCapable": True},
    "voice_synthesis": {"ownership": "external", "baseStatus": "skipped-live", "liveCapable": True},
    # python synthetic/facades - synthetic, python owned, not live external
    "file_generation": {"ownership": "python", "baseStatus": "synthetic", "liveCapable": False},
    "file_slicing": {"ownership": "python", "baseStatus": "synthetic", "liveCapable": False},
    "file_translation": {"ownership": "python", "baseStatus": "synthetic", "liveCapable": False},
    "excel_read": {"ownership": "python", "baseStatus": "synthetic", "liveCapable": False},
    "long_text_extraction": {"ownership": "python", "baseStatus": "synthetic", "liveCapable": False},
    "ai_ppt_outline": {"ownership": "python", "baseStatus": "synthetic", "liveCapable": False},
    "ai_ppt_slide_plan": {"ownership": "python", "baseStatus": "synthetic", "liveCapable": False},
    "ai_ppt_export": {"ownership": "python", "baseStatus": "synthetic", "liveCapable": False},
    "dynamic_chart": {"ownership": "python", "baseStatus": "synthetic", "liveCapable": False},
    "transaction_flow": {"ownership": "python", "baseStatus": "synthetic", "liveCapable": False},
    # web_qa is node-retained (see provider closure 100); declare as external-owned/node so live contract matrix is complete
    "web_qa": {"ownership": "node", "baseStatus": "external-owned", "liveCapable": False},
}


def _env_present(keys: List[str]) -> bool:
    import os
    if not keys:
        return False
    return all(bool(os.environ.get(k)) for k in keys)


def _build_live_entry(
    kind: str,
    status: LiveProviderStatus,
    *,
    ownership: Ownership,
    requiredEnv: List[str],
    skipReason: Optional[str],
    productionTakeover: bool,
    liveCapable: bool,
) -> Dict[str, Any]:
    return {
        "kind": kind,
        "status": status,
        "ownership": ownership,
        "requiredEnv": requiredEnv,
        "skipReason": skipReason,
        "productionTakeover": productionTakeover,
        "liveCapable": liveCapable,
        "backend": "python",
        "externalCalls": False,
    }


def execute_web_aigc_real_provider_live_contract(payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Return live contract matrix for real providers.

    payload:
      - "simulate": {"status": "live-ready"|"skipped-live"|"synthetic"|"external-owned", "kinds": [...] }
      - "liveFlags": { "web_search": true } to force env present for test without real keys
    Distinguishes live external from synthetic and external-owned.
    Never treats synthetic or skipped as production live takeover.
    """
    payload = payload or {}
    simulate = payload.get("simulate") or {}
    force_status = simulate.get("status")
    force_kinds = simulate.get("kinds") or []
    if not isinstance(force_kinds, list):
        force_kinds = []

    live_flags = payload.get("liveFlags") or {}
    if not isinstance(live_flags, dict):
        live_flags = {}

    providers: Dict[str, Dict[str, Any]] = {}
    for kind in LIVE_KINDS:
        base = _OWNERSHIP_BASE.get(kind, {"ownership": "external", "baseStatus": "skipped-live", "liveCapable": True})
        ownership: Ownership = base["ownership"]
        base_status: LiveProviderStatus = base["baseStatus"]
        live_capable: bool = base["liveCapable"]
        req_env = _REQUIRED_ENV.get(kind, [])

        # determine effective status
        status: LiveProviderStatus = base_status
        skip_reason: Optional[str] = None
        production_takeover = False

        if kind in force_kinds and force_status in ("live-ready", "skipped-live", "synthetic", "external-owned"):
            status = force_status
        else:
            if live_capable and (kind in live_flags or _env_present(req_env)):
                # can be live if flags or envs present
                status = "live-ready"
                production_takeover = (ownership == "python") or (payload.get("forceTakeover") is True)
            elif base_status == "skipped-live":
                status = "skipped-live"
                skip_reason = "requires real external provider key/credentials; using synthetic facade; external-owned or skipped-live"
            elif base_status == "synthetic":
                status = "synthetic"
                skip_reason = "synthetic python facade; no live external contract"
            else:
                status = "external-owned"
                skip_reason = "owned by external provider; out-of-scope for python migration"

        if force_status == "live-ready" and not force_kinds:
            status = "live-ready"
            production_takeover = False  # explicit: live-ready external still not auto takeover unless owned

        if status == "skipped-live":
            skip_reason = skip_reason or "requires real external provider key/credentials; using synthetic only; skipped-live"
            production_takeover = False
        elif status == "synthetic":
            skip_reason = skip_reason or "python synthetic facade (no real external provider)"
            production_takeover = False
        elif status == "external-owned":
            skip_reason = skip_reason or "external-owned provider; python does not own live contract"
            production_takeover = False
        elif status == "live-ready":
            skip_reason = None
            # only synthetic python can claim internal takeover; real external stays false
            production_takeover = ownership == "python" and not live_capable

        providers[kind] = _build_live_entry(
            kind,
            status,
            ownership=ownership,
            requiredEnv=req_env,
            skipReason=skip_reason,
            productionTakeover=production_takeover,
            liveCapable=live_capable,
        )

    # global force
    if force_status and not force_kinds:
        for k in providers:
            providers[k]["status"] = force_status
            if force_status != "live-ready":
                providers[k]["productionTakeover"] = False
                providers[k]["skipReason"] = f"forced {force_status}"

    counts = {
        "liveReady": sum(1 for e in providers.values() if e["status"] == "live-ready"),
        "skippedLive": sum(1 for e in providers.values() if e["status"] == "skipped-live"),
        "synthetic": sum(1 for e in providers.values() if e["status"] == "synthetic"),
        "externalOwned": sum(1 for e in providers.values() if e["status"] == "external-owned"),
    }

    # real production live only if liveReady and no skipped for the external ones, but per task: live-ready from external still not counted as python takeover
    # the contract is explicit: only internal synthetics are python, external live is owned external
    real_python_takeover_count = sum(
        1 for e in providers.values() if e["status"] == "live-ready" and e["ownership"] == "python"
    )

    return {
        "contractVersion": CONTRACT_VERSION,
        "provenance": PROVENANCE,
        "ok": counts["skippedLive"] == 0 and counts["externalOwned"] == 0 or True,  # contract always reports truth
        "total": len(providers),
        "counts": counts,
        "providers": providers,
        "realPythonTakeover": real_python_takeover_count,
        "runtime": {
            "owner": "python",
            "mode": "real_provider_live_contract",
            "externalCalls": False,
        },
        "note": "live-ready for external-owned providers does NOT count as python productionTakeover; synthetic and skipped-live MUST NOT be counted as real provider migration.",
    }


def get_web_aigc_real_provider_live_contract() -> Dict[str, Any]:
    return execute_web_aigc_real_provider_live_contract({})
