"""Minimal Python runtime boundary for permission rate-limit decisions.

Production route ownership, policy orchestration, and durable storage remain in
Node. This module only mirrors the decision envelope used by the Node sliding
window limiter so Python runtime-mode calls cannot turn denies into success.
"""

from dataclasses import dataclass, field
from math import isfinite
from typing import Any


RATE_LIMIT_WINDOW_MS = 60_000


@dataclass
class PermissionRateLimitRuntime:
    now_ms: int = 0
    windows: dict[str, list[int]] = field(default_factory=dict)

    def check(self, key: str, max_per_minute: int | float) -> dict[str, Any]:
        if not _is_valid_limit(max_per_minute):
            return {
                "allowed": False,
                "limit": max_per_minute,
                "remaining": 0,
                "retryAfterMs": RATE_LIMIT_WINDOW_MS,
                "resetAtMs": self.now_ms + RATE_LIMIT_WINDOW_MS,
                "reason": "invalid_limit",
            }

        active = [
            timestamp
            for timestamp in self.windows.get(key, [])
            if timestamp > self.now_ms - RATE_LIMIT_WINDOW_MS
        ]
        if len(active) < max_per_minute:
            return {
                "allowed": True,
                "limit": max_per_minute,
                "remaining": max_per_minute - len(active),
                "retryAfterMs": 0,
                "resetAtMs": None,
                "reason": "allowed",
            }

        reset_at_ms = min(active) + RATE_LIMIT_WINDOW_MS
        return {
            "allowed": False,
            "limit": max_per_minute,
            "remaining": 0,
            "retryAfterMs": max(0, reset_at_ms - self.now_ms),
            "resetAtMs": reset_at_ms,
            "reason": "rate_limit_exceeded",
        }

    def record(self, key: str) -> None:
        self.windows.setdefault(key, []).append(self.now_ms)

    def reset(self, key: str | None = None) -> None:
        if key is None:
            self.windows.clear()
        else:
            self.windows.pop(key, None)


def _is_valid_limit(value: int | float) -> bool:
    return (
        not isinstance(value, bool)
        and isinstance(value, (int, float))
        and isfinite(value)
        and value > 0
    )
