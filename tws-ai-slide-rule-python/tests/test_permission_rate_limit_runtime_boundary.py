from services.permission_rate_limit import (
    RATE_LIMIT_WINDOW_MS,
    PermissionRateLimitRuntime,
)


def test_permission_rate_limit_runtime_boundary_allows_then_denies_with_retry_after():
    runtime = PermissionRateLimitRuntime(now_ms=0)
    key = "agent-runtime:api:/v1/users"

    assert runtime.check(key, 2) == {
        "allowed": True,
        "limit": 2,
        "remaining": 2,
        "retryAfterMs": 0,
        "resetAtMs": None,
        "reason": "allowed",
    }
    runtime.record(key)

    assert runtime.check(key, 2) == {
        "allowed": True,
        "limit": 2,
        "remaining": 1,
        "retryAfterMs": 0,
        "resetAtMs": None,
        "reason": "allowed",
    }
    runtime.record(key)

    denied = runtime.check(key, 2)
    assert denied == {
        "allowed": False,
        "limit": 2,
        "remaining": 0,
        "retryAfterMs": RATE_LIMIT_WINDOW_MS,
        "resetAtMs": RATE_LIMIT_WINDOW_MS,
        "reason": "rate_limit_exceeded",
    }

    runtime.now_ms = 30_000
    retry_later = runtime.check(key, 2)
    assert retry_later["allowed"] is False
    assert retry_later["reason"] == "rate_limit_exceeded"
    assert retry_later["retryAfterMs"] == 30_000
    assert retry_later["resetAtMs"] == RATE_LIMIT_WINDOW_MS


def test_permission_rate_limit_runtime_boundary_invalid_limit_is_deny_not_success():
    runtime = PermissionRateLimitRuntime(now_ms=5_000)

    denied = runtime.check("agent-runtime:api:/admin", 0)

    assert denied == {
        "allowed": False,
        "limit": 0,
        "remaining": 0,
        "retryAfterMs": RATE_LIMIT_WINDOW_MS,
        "resetAtMs": 65_000,
        "reason": "invalid_limit",
    }


def test_permission_rate_limit_runtime_boundary_reset_reopens_previous_denial():
    runtime = PermissionRateLimitRuntime(now_ms=10_000)
    key = "agent-runtime:network:example.com"

    assert runtime.check(key, 1)["allowed"] is True
    runtime.record(key)
    assert runtime.check(key, 1)["allowed"] is False

    runtime.reset(key)

    assert runtime.check(key, 1) == {
        "allowed": True,
        "limit": 1,
        "remaining": 1,
        "retryAfterMs": 0,
        "resetAtMs": None,
        "reason": "allowed",
    }


def test_permission_rate_limit_runtime_boundary_expired_window_reopens_without_reset():
    runtime = PermissionRateLimitRuntime(now_ms=0)
    key = "agent-runtime:api:/v1/projects"

    runtime.record(key)
    assert runtime.check(key, 1)["reason"] == "rate_limit_exceeded"

    runtime.now_ms = RATE_LIMIT_WINDOW_MS
    reopened = runtime.check(key, 1)

    assert reopened["allowed"] is True
    assert reopened["reason"] == "allowed"
    assert reopened["retryAfterMs"] == 0
    assert reopened["resetAtMs"] is None
