"""Minimal Python mission event replay runtime boundary.

Node owns the mission store, event append persistence, project/resource auth.
Python provides projection envelopes for replay, append, cancel, error, projection
while preserving metadata and never coercing cancelled/failed into running/completed.
"""

from __future__ import annotations

from typing import Any, Literal

MISSION_EVENT_REPLAY_RUNTIME_CONTRACT_VERSION = "mission-event-replay.runtime-boundary.v1"

VALID_ACTIONS = {"append", "replay", "project", "cancel", "error"}
TERMINAL_STATUSES = {"done", "failed", "cancelled"}


def project_mission_event_replay_runtime(payload: dict[str, Any]) -> dict[str, Any]:
    """Project Node mission snapshot + events into replay/projection/cancel/error envelope."""

    if not _is_record(payload):
        return _error_response(
            "replay",
            "MISSION_EVENT_REPLAY_VALIDATION_ERROR",
            "Mission event replay payload must be an object.",
            retryable=False,
            error="validation_error",
        )

    action = _clean_string(payload.get("action"), "replay")
    if action not in VALID_ACTIONS:
        return _error_response(
            action,
            "MISSION_EVENT_REPLAY_VALIDATION_ERROR",
            f"Unsupported mission event replay action: {action}",
            retryable=False,
            error="validation_error",
        )

    raw_error = payload.get("error")
    if raw_error is not None or action == "error":
        error_record = raw_error if _is_record(raw_error) else {}
        return _error_response(
            action,
            _clean_string(error_record.get("code"), "MISSION_EVENT_REPLAY_RUNTIME_ERROR"),
            _clean_string(
                error_record.get("message"),
                "Mission event replay runtime failed.",
            ),
        )

    task = payload.get("task")
    if not _is_record(task):
        return _error_response(
            action,
            "MISSION_EVENT_REPLAY_VALIDATION_ERROR",
            "Mission event replay requires a Node-owned mission snapshot.",
            retryable=False,
            error="validation_error",
        )

    if action == "cancel":
        node_status = _node_status(task)
        if node_status in TERMINAL_STATUSES:
            return _error_response(
                action,
                "MISSION_EVENT_REPLAY_INVALID_TRANSITION",
                "Cannot cancel a terminal mission.",
                retryable=False,
                error="invalid_transition",
            )

    response: dict[str, Any] = {
        "ok": True,
        "action": action,
        "contractVersion": MISSION_EVENT_REPLAY_RUNTIME_CONTRACT_VERSION,
        "runtime": _runtime_meta(),
    }

    projected_task = _project_task(task, action=action, payload=payload)
    response["task"] = projected_task

    metadata = _metadata(payload)
    if metadata:
        response["metadata"] = metadata

    if action in {"replay", "append", "project"}:
        response["replay"] = _build_replay(task, payload)
    if action == "cancel":
        response["cancel"] = {
            "missionId": projected_task["id"],
            "cancelRequested": True,
            "reason": _clean_string(payload.get("reason"), "cancelled"),
        }
    return response


def _project_task(
    task: dict[str, Any],
    *,
    action: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    node_status = _node_status(task)
    status = _runtime_status(node_status, action)
    progress = _progress(task, status, action)
    now = _clean_string(payload.get("now"), _timestamp(task))
    message = _message(task, status, action, payload)

    projected: dict[str, Any] = {
        "id": _clean_string(task.get("id"), "mission-python-replay"),
        "status": status,
        "nodeStatus": _node_status_for_runtime(status, node_status),
        "progress": progress,
        "stageKey": _clean_string(task.get("currentStageKey"), "receive"),
        "message": message,
        "updatedAt": now,
    }

    if status == "failed":
        err = _task_error(task)
        if err:
            projected["error"] = err

    if status == "cancelled":
        projected["cancelRequested"] = True

    summary = _clean_string(task.get("summary"))
    if status == "completed" and summary:
        projected["summary"] = summary

    return projected


def _runtime_status(node_status: str, action: str) -> str:
    if action == "cancel":
        if node_status in TERMINAL_STATUSES:
            return _map_node_status(node_status)
        return "cancelled"
    if action in {"create", "append"}:
        return "running" if node_status in {"queued", "running", "waiting"} else _map_node_status(node_status)
    return _map_node_status(node_status)


def _map_node_status(node_status: str) -> str:
    return {
        "queued": "running",
        "running": "running",
        "waiting": "running",
        "done": "completed",
        "failed": "failed",
        "cancelled": "cancelled",
    }.get(node_status, "running")


def _node_status_for_runtime(runtime_status: str, original: str) -> str:
    if runtime_status == "completed":
        return "done"
    if runtime_status in {"failed", "cancelled", "running"}:
        return runtime_status
    return original


def _progress(task: dict[str, Any], status: str, action: str) -> int | float:
    if action == "cancel":
        return task.get("progress", 0)
    value = task.get("progress")
    if isinstance(value, (int, float)):
        return value
    if status == "completed":
        return 100
    if status in {"failed", "cancelled"}:
        return value or 0
    return 0


def _message(
    task: dict[str, Any],
    status: str,
    action: str,
    payload: dict[str, Any],
) -> str:
    if action == "cancel":
        return _clean_string(payload.get("reason"), "Mission cancelled via replay runtime.")
    if action == "error":
        return _clean_string(payload.get("error", {}).get("message"), "Mission replay error.")
    msg = _clean_string(task.get("message"))
    if msg:
        return msg
    return {
        "running": "Mission is running.",
        "completed": "Mission completed.",
        "failed": "Mission failed.",
        "cancelled": "Mission cancelled.",
    }.get(status, "Mission replay projected.")


def _metadata(payload: dict[str, Any]) -> dict[str, Any]:
    metadata = payload.get("metadata")
    if not _is_record(metadata):
        return {}
    projected: dict[str, Any] = {}
    for key in ("project", "resource", "auth"):
        value = metadata.get(key)
        if _is_record(value):
            projected[key] = _copy_json_record(value)
    return projected


def _build_replay(task: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    events = _project_events(payload.get("events"))
    limit = _limit(payload.get("limit"), len(events))
    replay_events = events[:limit] if limit else events
    return {
        "missionId": _clean_string(task.get("id"), "mission-python-replay"),
        "eventCount": len(replay_events),
        "limit": limit,
        "owner": "node",
        "events": replay_events,
        "projection": {
            "projectId": _extract_project_id(payload),
            "resourceId": _extract_resource_id(payload, task),
        },
    }


def _project_events(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [_copy_json_record(e) for e in value if _is_record(e)]


def _limit(value: Any, fallback: int) -> int:
    if isinstance(value, (int, float)):
        return max(0, int(value))
    return fallback


def _task_error(task: dict[str, Any]) -> dict[str, str] | None:
    error = task.get("error")
    if _is_record(error):
        return {
            "code": _clean_string(error.get("code"), "MISSION_FAILED"),
            "message": _clean_string(error.get("message"), "Mission failed."),
        }
    code = _clean_string(task.get("errorCode"))
    msg = _clean_string(task.get("errorMessage"))
    if code or msg:
        return {"code": code or "MISSION_FAILED", "message": msg or "Mission failed."}
    return None


def _extract_project_id(payload: dict[str, Any]) -> str:
    meta = payload.get("metadata") or {}
    proj = meta.get("project") or {}
    return _clean_string(proj.get("projectId") or (payload.get("task", {}).get("projection", {}) or {}).get("projectId"))


def _extract_resource_id(payload: dict[str, Any], task: dict[str, Any]) -> str:
    meta = payload.get("metadata") or {}
    res = meta.get("resource") or {}
    rid = _clean_string(res.get("resourceId"))
    return rid or _clean_string(task.get("id"), "mission-python-replay")


def _node_status(task: dict[str, Any]) -> str:
    value = _clean_string(task.get("status"), "running")
    if value in {"queued", "running", "waiting", "done", "failed", "cancelled"}:
        return value
    return "running"


def _timestamp(task: dict[str, Any]) -> str:
    value = task.get("updatedAt")
    if isinstance(value, str):
        return _clean_string(value, "1970-01-01T00:00:00.000Z")
    if isinstance(value, (int, float)):
        return _millis_to_iso(value)
    return "1970-01-01T00:00:00.000Z"


def _millis_to_iso(value: int | float) -> str:
    from datetime import datetime, timezone

    return (
        datetime.fromtimestamp(value / 1000, tz=timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def _error_response(
    action: str,
    code: str,
    message: str,
    *,
    retryable: bool = True,
    error: str = "runtime_error",
) -> dict[str, Any]:
    return {
        "ok": False,
        "action": action,
        "contractVersion": MISSION_EVENT_REPLAY_RUNTIME_CONTRACT_VERSION,
        "error": error,
        "code": code,
        "message": message,
        "retryable": retryable,
        "runtime": _runtime_meta(),
    }


def _runtime_meta() -> dict[str, str]:
    return {
        "owner": "python",
        "mode": "runtime_boundary",
        "persistenceOwner": "node",
        "missionStoreOwner": "node",
        "routeOwner": "node",
        "authOwner": "node",
        "eventStoreOwner": "node",
    }


def _copy_json_record(value: dict[str, Any]) -> dict[str, Any]:
    copied: dict[str, Any] = {}
    for key, item in value.items():
        if not isinstance(key, str):
            continue
        if isinstance(item, (str, int, float, bool)) or item is None:
            copied[key] = item
        elif _is_record(item):
            copied[key] = _copy_json_record(item)
        elif isinstance(item, list):
            copied[key] = [
                _copy_json_record(entry) if _is_record(entry) else entry
                for entry in item
                if isinstance(entry, (str, int, float, bool)) or entry is None or _is_record(entry)
            ]
    return copied


def _clean_string(value: Any, fallback: str = "") -> str:
    text = str(value or "").strip()
    return text or fallback


def _is_record(value: Any) -> bool:
    return isinstance(value, dict)
