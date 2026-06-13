#!/usr/bin/env python3
"""Audit preview provenance JSON for fake-success preview violations."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


VIOLATION_REASONS = {
    "fallback_pretending",
    "fake_success",
    "duplicate_content",
}


def _load(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        previews = payload.get("previews") or payload.get("previewMetas") or payload.get("images")
        if isinstance(previews, list):
            return [item for item in previews if isinstance(item, dict)]
    raise ValueError("expected a JSON array or object containing previews/previewMetas/images")


def _reason(meta: dict[str, Any], seen_hashes: dict[str, str]) -> str | None:
    provenance = meta.get("provenance")
    if not isinstance(provenance, dict):
        return "fake_success"
    source = provenance.get("source")
    ok = provenance.get("ok")
    indicators = provenance.get("errorIndicators") or []
    if source == "fallback" and ok is True:
        return "fallback_pretending"
    if ok is True and indicators:
        return "fake_success"
    if ok is True and int(meta.get("fileSizeBytes") or 0) < 1024:
        return "fake_success"
    content_hash = str(meta.get("contentHash") or "")
    image_id = str(meta.get("imageId") or meta.get("nodeId") or "")
    if content_hash:
        previous = seen_hashes.get(content_hash)
        if previous and previous != image_id:
            return "duplicate_content"
        seen_hashes[content_hash] = image_id
    return None


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: check_previews_real.py <preview-provenance.json>", file=sys.stderr)
        return 2
    path = Path(argv[1])
    previews = _load(path)
    seen_hashes: dict[str, str] = {}
    violations: list[tuple[str, str]] = []
    for meta in previews:
        reason = _reason(meta, seen_hashes)
        if reason in VIOLATION_REASONS:
            image_id = str(meta.get("imageId") or meta.get("nodeId") or "<unknown>")
            violations.append((image_id, reason))
    if violations:
        for image_id, reason in violations:
            print(f"{image_id}: {reason}")
        return 1
    print(f"ok: {len(previews)} previews passed provenance audit")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
