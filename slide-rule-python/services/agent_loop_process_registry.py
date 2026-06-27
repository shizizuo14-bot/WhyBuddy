"""Background AgentLoop process registry for the Python control plane.

The web workbench must not infer "running" purely from state.json. This module
records background processes started by Python, writes heartbeat events to the
unified v2 event store, and exposes stale/running status for overview APIs.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from services.agent_loop_event_store import append_event
    from services.agent_loop_paths import resolve_safe_path
except Exception:  # pragma: no cover - direct module execution fallback
    from agent_loop_event_store import append_event  # type: ignore
    from agent_loop_paths import resolve_safe_path  # type: ignore


_PROCESS_HANDLES: Dict[str, Any] = {}
_LOCK = threading.RLock()


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _parse_iso(value: Any) -> Optional[datetime]:
    if not isinstance(value, str) or not value:
        return None
    text = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text)
    except Exception:
        return None


def _safe_run_id(run_id: Any) -> Optional[str]:
    if not isinstance(run_id, str):
        return None
    text = run_id.strip()
    if not text or "\0" in text or "/" in text or "\\" in text or ".." in text:
        return None
    return text


def get_background_control_root(control_root: Optional[str] = None) -> Path:
    configured = control_root or os.environ.get("AGENT_LOOP_CONTROL_DIR") or ".agent-loop/control"
    path = Path(configured)
    if not path.is_absolute():
        path = _repo_root() / path
    return path.resolve(strict=False)


def _record_path(run_id: str, control_root: Optional[str] = None) -> Optional[Path]:
    safe = _safe_run_id(run_id)
    if not safe:
        return None
    root = get_background_control_root(control_root)
    return resolve_safe_path(root, f"{safe}.json")


def write_background_run_record(record: Dict[str, Any], *, control_root: Optional[str] = None) -> Optional[Dict[str, Any]]:
    run_id = _safe_run_id(record.get("runId"))
    if not run_id:
        return None
    path = _record_path(run_id, control_root)
    if path is None:
        return None
    data = dict(record)
    data["runId"] = run_id
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return data
    except Exception:
        return None


def read_background_run_record(run_id: str, *, control_root: Optional[str] = None) -> Optional[Dict[str, Any]]:
    path = _record_path(run_id, control_root)
    if path is None or not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8", errors="replace"))
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def list_background_run_records(*, control_root: Optional[str] = None) -> List[Dict[str, Any]]:
    root = get_background_control_root(control_root)
    if not root.exists():
        return []
    records: List[Dict[str, Any]] = []
    for path in root.glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8", errors="replace"))
            if isinstance(data, dict) and _safe_run_id(data.get("runId")):
                records.append(data)
        except Exception:
            continue
    records.sort(key=lambda item: str(item.get("startedAt") or item.get("heartbeatAt") or ""), reverse=True)
    return records


def register_background_process(run_id: str, process: Any) -> None:
    safe = _safe_run_id(run_id)
    if not safe:
        return
    with _LOCK:
        _PROCESS_HANDLES[safe] = process


def unregister_background_process(run_id: str) -> None:
    safe = _safe_run_id(run_id)
    if not safe:
        return
    with _LOCK:
        _PROCESS_HANDLES.pop(safe, None)


def _process_exit_code(run_id: str) -> Optional[int]:
    with _LOCK:
        handle = _PROCESS_HANDLES.get(run_id)
    if handle is None:
        return None
    try:
        value = handle.poll()
        return value if isinstance(value, int) else None
    except Exception:
        return None


def _heartbeat_age_seconds(record: Dict[str, Any]) -> Optional[float]:
    heartbeat_at = _parse_iso(record.get("heartbeatAt"))
    if heartbeat_at is None:
        return None
    now = datetime.now(timezone.utc)
    if heartbeat_at.tzinfo is None:
        heartbeat_at = heartbeat_at.replace(tzinfo=timezone.utc)
    return max(0.0, (now - heartbeat_at).total_seconds())


def _stale_after_seconds(value: Optional[float] = None) -> float:
    if value is not None:
        return float(value)
    raw = os.environ.get("AGENT_LOOP_STALE_AFTER_SECONDS")
    try:
        parsed = float(raw) if raw is not None else 120.0
        return parsed if parsed > 0 else 120.0
    except Exception:
        return 120.0


def get_background_runtime_status(
    run_id: Optional[str] = None,
    *,
    stale_after_seconds: Optional[float] = None,
    control_root: Optional[str] = None,
) -> Dict[str, Any]:
    records = list_background_run_records(control_root=control_root)
    record = read_background_run_record(run_id, control_root=control_root) if run_id else (records[0] if records else None)
    if not record:
        return {"running": False, "stale": False, "status": "idle", "record": None}

    rid = str(record.get("runId") or "")
    status_text = str(record.get("status") or "").lower()
    exit_code = _process_exit_code(rid)
    if exit_code is not None and status_text in {"running", "started"}:
        record = {
            **record,
            "status": "exited",
            "exitCode": exit_code,
            "endedAt": record.get("endedAt") or _iso_now(),
        }
        write_background_run_record(record, control_root=control_root)
        unregister_background_process(rid)
        status_text = "exited"

    activeish = status_text in {"running", "started"}
    age = _heartbeat_age_seconds(record)
    stale = activeish and (age is None or age > _stale_after_seconds(stale_after_seconds))
    running = activeish and not stale
    return {
        "running": bool(running),
        "stale": bool(stale),
        "status": "stale" if stale else (status_text or "unknown"),
        "runId": rid,
        "pid": record.get("pid"),
        "heartbeatAt": record.get("heartbeatAt"),
        "startedAt": record.get("startedAt"),
        "exitCode": record.get("exitCode"),
        "record": record,
    }


def append_background_event(run_id: str, event_type: str, payload: Optional[Dict[str, Any]] = None, *, status: Optional[str] = None) -> Optional[Dict[str, Any]]:
    return append_event(
        run_id,
        {
            "source": "python",
            "phase": "queue",
            "type": event_type,
            "status": status,
            "payload": payload or {},
        },
    )


def heartbeat_background_run(run_id: str, *, control_root: Optional[str] = None) -> Optional[Dict[str, Any]]:
    record = read_background_run_record(run_id, control_root=control_root)
    if not record:
        return None
    updated = {**record, "status": "running", "heartbeatAt": _iso_now()}
    write_background_run_record(updated, control_root=control_root)
    append_background_event(run_id, "HEARTBEAT", {"pid": updated.get("pid")}, status="running")
    return updated


__all__ = [
    "append_background_event",
    "get_background_control_root",
    "get_background_runtime_status",
    "heartbeat_background_run",
    "list_background_run_records",
    "read_background_run_record",
    "register_background_process",
    "unregister_background_process",
    "write_background_run_record",
]
