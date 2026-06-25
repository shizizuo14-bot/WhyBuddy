import os
import sys
import threading

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sliderule_llm.client import LlmError, LlmResult  # noqa: E402
from sliderule_llm.config import PoolConfig  # noqa: E402
from sliderule_llm.pool import (  # noqa: E402
    POOL_504_PENALTY_MS,
    clear_pool_penalties,
    get_last_pool_failures,
)


def _sample_pool(**overrides) -> PoolConfig:
    base = dict(
        keys=("pool_one", "pool_two"),
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


def _ok_result(*, model: str = "gpt-5.5", content: str = "ok") -> LlmResult:
    return LlmResult(
        content=content,
        usage={"total_tokens": 1},
        finish_reason="stop",
        model=model,
        latency_ms=1,
    )


def setup_function():
    clear_pool_penalties()


def teardown_function():
    clear_pool_penalties()


def test_parallel_race_invokes_keys_concurrently(monkeypatch):
    from sliderule_llm.pool import call_pool

    monkeypatch.delenv("HTTP_PROXY", raising=False)
    monkeypatch.delenv("HTTPS_PROXY", raising=False)
    monkeypatch.delenv("ALL_PROXY", raising=False)
    monkeypatch.setenv("SLIDERULE_POOL_RACE_MODE", "parallel")

    started = threading.Barrier(2, timeout=2)
    peak_concurrent = {"value": 0}
    active = {"value": 0}
    lock = threading.Lock()

    def fake_call_llm(messages, *, config, **kwargs):
        with lock:
            active["value"] += 1
            peak_concurrent["value"] = max(peak_concurrent["value"], active["value"])
        started.wait()
        with lock:
            active["value"] -= 1
        return _ok_result(content=f"from-{config.api_key}")

    monkeypatch.setattr("sliderule_llm.pool.call_llm", fake_call_llm)

    result = call_pool([{"role": "user", "content": "hi"}], pool=_sample_pool(race_mode="parallel"))

    assert result is not None
    assert peak_concurrent["value"] == 2


def test_pool_records_failure_attribution_when_all_keys_fail(monkeypatch):
    from sliderule_llm.pool import call_pool

    def fake_call_llm(messages, *, config, **kwargs):
        raise LlmError("upstream 503", status=503, transient=True)

    monkeypatch.setattr("sliderule_llm.pool.call_llm", fake_call_llm)

    result = call_pool([{"role": "user", "content": "hi"}], pool=_sample_pool())

    assert result is None
    failures = get_last_pool_failures()
    assert len(failures) == 2
    assert {entry["failure_kind"] for entry in failures} == {"upstream"}
    assert {entry["pool_label"] for entry in failures} == {"one", "two"}
    assert all(entry["transient"] for entry in failures)
    assert all(entry["status"] == 503 for entry in failures)


def test_pool_json_preserves_failure_attribution_on_parse_failures(monkeypatch):
    from sliderule_llm.pool import call_pool_json

    def fake_call_llm_json(messages, *, config, **kwargs):
        raise LlmError("LLM JSON parse failed: not-json", transient=False)

    monkeypatch.setattr("sliderule_llm.pool.call_llm_json", fake_call_llm_json)

    result = call_pool_json([{"role": "user", "content": "hi"}], pool=_sample_pool())

    assert result is None
    failures = get_last_pool_failures()
    assert len(failures) == 2
    assert {entry["failure_kind"] for entry in failures} == {"unknown"}
    assert {entry["pool_label"] for entry in failures} == {"one", "two"}
    assert all(entry["transient"] is False for entry in failures)


def test_504_penalty_expires_after_backoff_window(monkeypatch):
    import sliderule_llm.pool as pool_mod
    from sliderule_llm.pool import PoolKeyState

    now = {"value": 1000.0}
    monkeypatch.setattr(pool_mod.time, "time", lambda: now["value"])

    state = PoolKeyState(key="k1", label="one")
    state.mark_http_failure(LlmError("upstream 504", status=504, transient=True))
    assert state.is_penalized() is True

    now["value"] += POOL_504_PENALTY_MS / 1000.0 + 0.001
    assert state.is_penalized() is False


def test_pool_success_telemetry_preserves_winning_key_after_fallback(monkeypatch):
    from sliderule_llm.pool import call_pool

    def fake_call_llm(messages, *, config, **kwargs):
        if getattr(config, "api" + "_key") == "pool_one":
            raise LlmError("timeout after 30s", transient=True)
        return LlmResult(
            content="winner",
            usage={"prompt_tokens": 2, "completion_tokens": 3},
            finish_reason="STOP",
            model=config.model,
            latency_ms=12,
            provider=config.provider_name,
        )

    monkeypatch.setattr("sliderule_llm.pool.call_llm", fake_call_llm)

    result = call_pool([{"role": "user", "content": "hi"}], pool=_sample_pool())

    assert result is not None
    assert result.content == "winner"
    assert result.telemetry["pool_label"] == "two"
    assert result.telemetry["pool_model"] == "gpt-5.5"
    assert result.telemetry["pool_key_count"] == 2
    assert result.telemetry["usage"] == {
        "total_tokens": 5,
        "prompt_tokens": 2,
        "completion_tokens": 3,
    }
    assert result.telemetry["finish_reason"] == "stop"
