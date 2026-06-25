import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sliderule_llm.client import LlmError, LlmResult  # noqa: E402
from sliderule_llm.config import PoolConfig  # noqa: E402
from sliderule_llm.pool import (  # noqa: E402
    POOL_504_PENALTY_MS,
    clear_pool_penalties,
    get_last_pool_events,
    get_last_pool_failures,
    get_pool_penalty_metadata,
)

SECRET_ONE = "sk-test-observability-secret-one"
SECRET_TWO = "sk-test-observability-secret-two"


def _sample_pool(**overrides) -> PoolConfig:
    base = dict(
        keys=(SECRET_ONE, SECRET_TWO),
        labels=("primary-alias", "backup-alias"),
        base_url="https://pool.example.test/v1",
        model="gpt-5.5",
        timeout_ms=300000,
        wire_api="responses",
        race_mode="sequential",
        enabled=True,
    )
    base.update(overrides)
    return PoolConfig(**base)


def _ok_result(*, model: str = "gpt-5.5", content: str = "ok") -> LlmResult:
    return LlmResult(
        content=content,
        usage={"total_tokens": 1},
        finish_reason="stop",
        model=model,
        latency_ms=1,
    )


@pytest.fixture(autouse=True)
def reset_pool_state():
    clear_pool_penalties()
    yield
    clear_pool_penalties()


def _assert_no_raw_secret(value) -> None:
    serialized = json.dumps(value, sort_keys=True)
    assert SECRET_ONE not in serialized
    assert SECRET_TWO not in serialized


def test_last_failures_include_safe_key_metadata_without_api_key(monkeypatch):
    from sliderule_llm.pool import call_pool

    def fake_call_llm(messages, *, config, **kwargs):
        raise LlmError(f"upstream 503 for {config.api_key}", status=503, transient=True)

    monkeypatch.setattr("sliderule_llm.pool.call_llm", fake_call_llm)

    result = call_pool([{"role": "user", "content": "hi"}], pool=_sample_pool())

    assert result is None
    failures = get_last_pool_failures()
    assert len(failures) == 2
    assert {entry["pool_label"] for entry in failures} == {"primary-alias", "backup-alias"}
    assert {entry["failure_kind"] for entry in failures} == {"upstream"}
    assert all(entry["pool_key_id"].startswith("sha256:") for entry in failures)
    assert all(entry["message"].endswith("[redacted-pool-key]") for entry in failures)
    _assert_no_raw_secret(failures)


def test_selected_key_metadata_is_safe_in_result_telemetry_and_events(monkeypatch):
    from sliderule_llm.pool import call_pool

    def fake_call_llm(messages, *, config, **kwargs):
        if config.api_key == SECRET_ONE:
            raise LlmError("upstream 503", status=503, transient=True)
        return _ok_result(model=config.model, content="winner")

    monkeypatch.setattr("sliderule_llm.pool.call_llm", fake_call_llm)

    result = call_pool([{"role": "user", "content": "hi"}], pool=_sample_pool())

    assert result is not None
    assert result.telemetry["pool_label"] == "backup-alias"
    assert result.telemetry["pool_key_id"].startswith("sha256:")

    selected_events = [event for event in get_last_pool_events() if event["event"] == "selected"]
    assert selected_events == [
        {
            "event": "selected",
            "pool_label": "backup-alias",
            "pool_key_id": result.telemetry["pool_key_id"],
        }
    ]
    _assert_no_raw_secret(result.telemetry)
    _assert_no_raw_secret(selected_events)


def test_penalty_window_and_skipped_key_metadata_are_observable(monkeypatch):
    import sliderule_llm.pool as pool_mod
    from sliderule_llm.pool import call_pool

    now = {"value": 1000.0}
    attempts = []
    monkeypatch.setattr(pool_mod.time, "time", lambda: now["value"])

    def fake_call_llm(messages, *, config, **kwargs):
        attempts.append(config.api_key)
        if config.api_key == SECRET_ONE:
            raise LlmError("upstream 504", status=504, transient=True)
        return _ok_result(model=config.model)

    monkeypatch.setattr("sliderule_llm.pool.call_llm", fake_call_llm)

    first = call_pool([{"role": "user", "content": "hi"}], pool=_sample_pool())
    assert first is not None
    assert attempts == [SECRET_ONE, SECRET_TWO]

    penalties = get_pool_penalty_metadata()
    assert len(penalties) == 1
    assert penalties[0]["pool_label"] == "primary-alias"
    assert penalties[0]["pool_key_id"].startswith("sha256:")
    assert penalties[0]["penalty_ms"] == POOL_504_PENALTY_MS
    assert penalties[0]["remaining_ms"] == POOL_504_PENALTY_MS

    attempts.clear()
    second = call_pool([{"role": "user", "content": "hi"}], pool=_sample_pool())
    assert second is not None
    assert attempts == [SECRET_TWO]

    events = get_last_pool_events()
    assert any(event["event"] == "penalized" and event["pool_label"] == "primary-alias" for event in events)
    assert any(
        event["event"] == "skipped"
        and event["pool_label"] == "primary-alias"
        and event["reason"] == "penalized"
        for event in events
    )
    _assert_no_raw_secret(penalties)
    _assert_no_raw_secret(events)
