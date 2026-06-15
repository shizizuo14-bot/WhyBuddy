#!/usr/bin/env python3
"""LLM concurrency benchmark — Python httpx (same as tws-ai-ask-python)."""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip()
    return env


async def one_call(
    client: httpx.AsyncClient,
    *,
    base_url: str,
    api_key: str,
    model: str,
    reasoning_effort: str | None,
    index: int,
) -> float:
    started = time.perf_counter()
    payload: dict = {
        "model": model,
        "messages": [{"role": "user", "content": f"Reply with exactly: pong-{index}"}],
        "max_tokens": 128,
        "temperature": 0,
    }
    if reasoning_effort:
        payload["reasoning"] = {"effort": reasoning_effort}
    response = await client.post(
        f"{base_url.rstrip('/')}/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=payload,
    )
    elapsed_ms = (time.perf_counter() - started) * 1000
    response.raise_for_status()
    data = response.json()
    content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
    if not str(content).strip():
        raise ValueError("Empty content")
    return elapsed_ms


def percentile(sorted_vals: list[float], p: float) -> float:
    if not sorted_vals:
        return 0.0
    idx = min(len(sorted_vals) - 1, max(0, int((p / 100) * len(sorted_vals)) - 1))
    return sorted_vals[idx]


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--concurrency", type=int, default=40)
    parser.add_argument("--model", default=None)
    parser.add_argument("--reasoning-effort", default=None)
    parser.add_argument("--label", default=None)
    args = parser.parse_args()

    env = load_env()
    base_url = env.get("LLM_BASE_URL", "https://api.rcouyi.com/v1")
    api_key = env.get("LLM_API_KEY", "")
    model = args.model or env.get("LLM_MODEL", "ouyi-5-preview")
    reasoning_effort = args.reasoning_effort if args.reasoning_effort is not None else env.get("LLM_REASONING_EFFORT") or None
    if reasoning_effort == "":
        reasoning_effort = None
    if not api_key:
        print("Missing LLM_API_KEY in .env", file=sys.stderr)
        return 1

    meta = {
        "label": args.label,
        "runtime": "python",
        "pythonVersion": sys.version.split()[0],
        "concurrency": args.concurrency,
        "baseUrl": base_url,
        "model": model,
        "reasoningEffort": reasoning_effort,
        "proxyMode": "httpx-default-no-env-proxy",
        "httpProxy": None,
    }
    print(json.dumps(meta, indent=2))

    timeout = httpx.Timeout(120.0)
    wall_start = time.perf_counter()
    async with httpx.AsyncClient(timeout=timeout) as client:
        results = await asyncio.gather(
            *[
                one_call(
                    client,
                    base_url=base_url,
                    api_key=api_key,
                    model=model,
                    reasoning_effort=reasoning_effort,
                    index=i + 1,
                )
                for i in range(args.concurrency)
            ],
            return_exceptions=True,
        )
    wall_ms = (time.perf_counter() - wall_start) * 1000

    ok: list[float] = []
    errors: list[str] = []
    for r in results:
        if isinstance(r, Exception):
            errors.append(str(r))
        else:
            ok.append(float(r))
    ok.sort()

    summary = {
        "success": len(ok),
        "failed": len(errors),
        "wallMs": round(wall_ms),
        "latencyMs": None,
        "sampleErrors": errors[:5],
    }
    if ok:
        summary["latencyMs"] = {
            "min": round(ok[0]),
            "p50": round(percentile(ok, 50)),
            "p95": round(percentile(ok, 95)),
            "max": round(ok[-1]),
            "avg": round(sum(ok) / len(ok)),
        }
    print(json.dumps(summary, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))