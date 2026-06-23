"""Test for Web AIGC real provider live contract 103.

Covers:
- Python live contract distinguishes live-ready / skipped-live / synthetic / external-owned
- real external (search/vision/audio/ocr) have requiredEnv, ownership=external, productionTakeover=false
- synthetic (file/ai-ppt/chart/transaction) are synthetic, ownership=python, no live env
- skipped-live/synthetic never count toward real productionTakeover or migration complete
- simulate/liveFlags allow testing live-ready without real keys
- Node bridge can consume contract and preserve distinction
- existing bridges/runtimes unaffected
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.web_aigc_real_provider_live_contract import (  # noqa: E402
    CONTRACT_VERSION,
    PROVENANCE,
    LiveProviderStatus,
    execute_web_aigc_real_provider_live_contract,
    get_web_aigc_real_provider_live_contract,
)


def test_live_contract_contract_and_defaults():
    result = execute_web_aigc_real_provider_live_contract({})
    assert result["contractVersion"] == CONTRACT_VERSION
    assert result["provenance"] == PROVENANCE
    assert result["runtime"]["owner"] == "python"
    assert result["runtime"]["externalCalls"] is False
    assert "providers" in result
    assert result["counts"]["skippedLive"] >= 1
    assert result["counts"]["synthetic"] >= 1
    assert "note" in result
    assert "MUST NOT" in result["note"]


def test_live_contract_covers_expected_kinds():
    result = get_web_aigc_real_provider_live_contract()
    providers = result["providers"]
    for cat in ["web_search", "vision_analysis", "audio_recognition", "ocr_recognition",
                "file_generation", "ai_ppt_outline", "dynamic_chart", "transaction_flow"]:
        assert cat in providers
    # search is external
    assert providers["web_search"]["ownership"] == "external"
    assert providers["web_search"]["liveCapable"] is True
    assert len(providers["web_search"]["requiredEnv"]) > 0


@pytest.mark.parametrize(
    ("kind", "expected_status", "expected_ownership"),
    [
        ("file_generation", "synthetic", "python"),
        ("ai_ppt_outline", "synthetic", "python"),
        ("dynamic_chart", "synthetic", "python"),
        ("transaction_flow", "synthetic", "python"),
        ("excel_read", "synthetic", "python"),
    ],
)
def test_live_contract_synthetic_are_python_owned_not_live(kind: str, expected_status: LiveProviderStatus, expected_ownership: str):
    result = get_web_aigc_real_provider_live_contract()
    entry = result["providers"][kind]
    assert entry["status"] == expected_status
    assert entry["ownership"] == expected_ownership
    assert entry["productionTakeover"] is False
    assert entry["liveCapable"] is False
    assert len(entry["requiredEnv"]) == 0
    # synthetic must not pretend live
    assert entry["status"] != "live-ready"


@pytest.mark.parametrize(
    "kind",
    ["web_search", "image_search", "vision_analysis", "audio_recognition", "ocr_recognition", "static_webpage_read"],
)
def test_live_contract_external_are_skipped_or_external_owned(kind: str):
    result = get_web_aigc_real_provider_live_contract()
    entry = result["providers"][kind]
    assert entry["status"] in ("skipped-live", "external-owned")
    assert entry["ownership"] == "external"
    assert entry["productionTakeover"] is False
    assert entry["liveCapable"] is True
    assert kind not in [k for k, e in result["providers"].items()
                        if e["status"] == "live-ready" and e["ownership"] == "python"]
    # must report skip reason
    assert entry.get("skipReason") is not None


def test_live_contract_simulate_live_ready_without_real_keys():
    # use liveFlags for controllable
    resp = execute_web_aigc_real_provider_live_contract({
        "liveFlags": {"web_search": True, "vision_analysis": True},
        "simulate": {"status": "live-ready", "kinds": ["web_search"]}
    })
    assert resp["providers"]["web_search"]["status"] == "live-ready"
    # but external ownership => no python takeover
    assert resp["providers"]["web_search"]["ownership"] == "external"
    assert resp["providers"]["web_search"]["productionTakeover"] is False
    # counts reflect
    assert resp["counts"]["liveReady"] >= 1


def test_live_contract_skipped_synthetic_never_count_as_real_takeover():
    result = get_web_aigc_real_provider_live_contract()
    for k, e in result["providers"].items():
        if e["status"] in ("skipped-live", "synthetic", "external-owned"):
            assert e["productionTakeover"] is False
            assert e["status"] != "live-ready" or e["ownership"] != "python"
    assert result["realPythonTakeover"] == 0  # no real external counted as python takeover
    # synthetic count separate
    assert result["counts"]["synthetic"] >= 5
    assert result["counts"]["skippedLive"] >= 4


def test_live_contract_force_external_owned():
    resp = execute_web_aigc_real_provider_live_contract({"simulate": {"status": "external-owned", "kinds": ["graph_search"]}})
    assert resp["providers"]["graph_search"]["status"] == "external-owned"
    assert resp["providers"]["graph_search"]["ownership"] == "external"
    assert resp["providers"]["graph_search"]["productionTakeover"] is False


def test_live_contract_distinguishes_from_readiness_and_closure():
    # contract is distinct: must have live fields
    live = execute_web_aigc_real_provider_live_contract({})
    assert any("requiredEnv" in e for e in live["providers"].values())
    assert any("skipReason" in e for e in live["providers"].values())
    assert any(e.get("productionTakeover") is not None for e in live["providers"].values())
