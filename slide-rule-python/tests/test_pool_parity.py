import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sliderule_llm.client import LlmError, LlmResult  # noqa: E402
from sliderule_llm.config import PoolConfig  # noqa: E402
from sliderule_llm.pool import clear_pool_penalties  # noqa: E402


def _sample_pool(**overrides) -> PoolConfig:
    base = dict(
        keys=("k1", "k2"),
        labels=("one", "two"),
        base_url="https://pool.example.test/v1",
        model="gpt-5.5",
        timeout_ms=300000,
        wire_api="responses",
        race_mode="sequential",
        enabled=True,
    )
    base.update(overrides)
    return PoolConfig(**base)


@pytest.fixture(autouse=True)
def reset_pool_penalties():
    clear_pool_penalties()
    yield
    clear_pool_penalties()


def test_pool_key_state_records_504_penalty():
    from sliderule_llm.pool import PoolKeyState

    state = PoolKeyState(key="k1", label="one")
    state.mark_http_failure(LlmError("upstream 504", status=504, transient=True))
    assert state.is_penalized() is True


def test_call_pool_defaults_to_sequential_under_proxy_env(monkeypatch):
    from sliderule_llm.pool import call_pool

    monkeypatch.setenv("HTTP_PROXY", "http://127.0.0.1:7890")
    captured = {}

    def fake_call_llm(messages, *, config, **kwargs):
        captured["api_key"] = config.api_key
        return LlmResult(
            content="ok",
            usage={"total_tokens": 1},
            finish_reason="stop",
            model=config.model,
            latency_ms=1,
        )

    monkeypatch.setattr("sliderule_llm.pool.call_llm", fake_call_llm)

    result = call_pool(
        [{"role": "user", "content": "hi"}],
        pool=PoolConfig(
            keys=("k1", "k2"),
            labels=("one", "two"),
            base_url="https://pool.example.test/v1",
            model="gpt-5.5",
            timeout_ms=300000,
            wire_api="responses",
            race_mode="parallel",
            enabled=True,
        ),
    )

    assert result is not None
    assert captured["api_key"] == "k1"


def test_pool_key_states_keep_all_keys_when_labels_are_short():
    from sliderule_llm.pool import _pool_key_states

    states = _pool_key_states(
        PoolConfig(
            keys=("k1", "k2"),
            labels=("one",),
            base_url="https://pool.example.test/v1",
            model="gpt-5.5",
            timeout_ms=300000,
            wire_api="responses",
            race_mode="sequential",
            enabled=True,
        )
    )

    assert [state.key for state in states] == ["k1", "k2"]
    assert [state.label for state in states] == ["one", "1"]


def test_call_pool_skips_penalized_key_after_504(monkeypatch):
    from sliderule_llm.pool import call_pool

    attempts = []

    def fake_call_llm(messages, *, config, **kwargs):
        attempts.append(config.api_key)
        if config.api_key == "k1":
            raise LlmError("upstream 504", status=504, transient=True)
        return LlmResult(
            content="ok",
            usage={"total_tokens": 1},
            finish_reason="stop",
            model=config.model,
            latency_ms=1,
        )

    monkeypatch.setattr("sliderule_llm.pool.call_llm", fake_call_llm)

    pool = PoolConfig(
        keys=("k1", "k2"),
        labels=("one", "two"),
        base_url="https://pool.example.test/v1",
        model="gpt-5.5",
        timeout_ms=300000,
        wire_api="responses",
        race_mode="sequential",
        enabled=True,
    )

    first = call_pool([{"role": "user", "content": "hi"}], pool=pool)
    assert first is not None
    assert attempts == ["k1", "k2"]

    attempts.clear()
    second = call_pool([{"role": "user", "content": "hi"}], pool=pool)
    assert second is not None
    assert attempts == ["k2"]


def test_resolve_pool_race_mode_defaults_to_sequential_under_proxy(monkeypatch):
    from sliderule_llm.pool import resolve_pool_race_mode

    monkeypatch.setenv("HTTP_PROXY", "http://127.0.0.1:7890")
    assert resolve_pool_race_mode(_sample_pool(race_mode="parallel")) == "sequential"


def test_call_pool_annotates_model_metadata_with_pool_label(monkeypatch):
    from sliderule_llm.pool import call_pool

    def fake_call_llm(messages, *, config, **kwargs):
        return LlmResult(
            content="ok",
            usage={"total_tokens": 1},
            finish_reason="stop",
            model=config.model,
            latency_ms=1,
        )

    monkeypatch.setattr("sliderule_llm.pool.call_llm", fake_call_llm)

    result = call_pool([{"role": "user", "content": "hi"}], pool=_sample_pool())
    assert result is not None
    assert result.model == "gpt-5.5"
    assert result.usage["model"] == "gpt-5.5@one"


def test_call_pool_json_returns_none_when_all_keys_fail_json_parse(monkeypatch):
    from sliderule_llm.pool import call_pool_json

    def fake_call_llm_json(messages, *, config, **kwargs):
        raise LlmError("LLM JSON parse failed: not-json", transient=False)

    monkeypatch.setattr("sliderule_llm.pool.call_llm_json", fake_call_llm_json)

    result = call_pool_json([{"role": "user", "content": "hi"}], pool=_sample_pool())
    assert result is None


def test_call_pool_json_falls_through_to_next_key_on_json_parse_failure(monkeypatch):
    from sliderule_llm.pool import call_pool_json

    attempts = []

    def fake_call_llm_json(messages, *, config, **kwargs):
        attempts.append(config.api_key)
        if config.api_key == "k1":
            raise LlmError("LLM JSON parse failed: not-json", transient=False)
        return (
            {"ok": True},
            LlmResult(
                content='{"ok": true}',
                usage={"total_tokens": 1},
                finish_reason="stop",
                model=config.model,
                latency_ms=1,
            ),
        )

    monkeypatch.setattr("sliderule_llm.pool.call_llm_json", fake_call_llm_json)

    parsed, result = call_pool_json([{"role": "user", "content": "hi"}], pool=_sample_pool())
    assert parsed == {"ok": True}
    assert attempts == ["k1", "k2"]
    assert result.model == "gpt-5.5"
    assert result.usage["model"] == "gpt-5.5@two"


def test_call_pool_json_does_not_pretend_success_on_empty_json_body(monkeypatch):
    from sliderule_llm.pool import call_pool_json

    def fake_call_llm_json(messages, *, config, **kwargs):
        raise LlmError("LLM JSON parse failed: ", transient=False)

    monkeypatch.setattr("sliderule_llm.pool.call_llm_json", fake_call_llm_json)

    assert call_pool_json([{"role": "user", "content": "hi"}], pool=_sample_pool(keys=("k1",))) is None