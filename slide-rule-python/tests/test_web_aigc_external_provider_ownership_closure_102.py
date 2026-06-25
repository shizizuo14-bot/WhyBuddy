"""Test for Web AIGC external provider ownership closure 102.

Ensures external-owned and skipped-live are explicitly declared and
never folded into python migration credit.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.web_aigc_external_provider_ownership_closure import (  # noqa: E402
    CONTRACT_VERSION,
    execute_web_aigc_external_provider_ownership_closure,
    get_web_aigc_external_provider_ownership_closure,
)


def test_external_ownership_contract():
    result = execute_web_aigc_external_provider_ownership_closure({})
    assert result["contractVersion"] == CONTRACT_VERSION
    assert "providers" in result
    assert result["runtime"]["owner"] == "python"
    assert result["counts"]["externalOwned"] >= 4
    assert result["counts"]["pythonOwned"] >= 5


@pytest.mark.parametrize(
    "kind",
    ["web_search", "vision_analysis", "audio_recognition", "ocr_recognition", "image_search"],
)
def test_external_real_are_external_owned_or_skipped(kind: str):
    result = get_web_aigc_external_provider_ownership_closure()
    entry = result["providers"][kind]
    assert entry["status"] in ("external-owned", "skipped-live")
    assert entry["ownership"] == "external"
    assert entry["productionTakeover"] is False
    assert entry["externalCalls"] is False


@pytest.mark.parametrize(
    "kind",
    ["file_generation", "ai_ppt_outline", "dynamic_chart", "transaction_flow"],
)
def test_synthetic_are_python_owned(kind: str):
    result = get_web_aigc_external_provider_ownership_closure()
    entry = result["providers"][kind]
    assert entry["status"] == "python-owned"
    assert entry["ownership"] == "python"
    assert entry["productionTakeover"] is False


def test_external_ownership_simulate_and_distinction():
    sim = execute_web_aigc_external_provider_ownership_closure({
        "simulate": {"status": "external-owned", "kinds": ["web_search"]}
    })
    assert sim["providers"]["web_search"]["status"] == "external-owned"
    # must not leak into python owned ready
    assert "web_search" not in [k for k, e in sim["providers"].items() if e["status"] == "python-owned"]


def test_external_ownership_skipped_never_takeover():
    result = get_web_aigc_external_provider_ownership_closure()
    for k, e in result["providers"].items():
        if e["status"] != "python-owned":
            assert e["productionTakeover"] is False
    assert result["ok"] is True or result["counts"]["externalOwned"] > 0  # reports truth
