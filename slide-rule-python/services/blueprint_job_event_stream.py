"""Blueprint job lifecycle event stream runtime (python-owned bounded slice).

Python produces the lifecycle event envelopes for created/running/completed/failed/cancelled/error.
Node owns the durable store and full event bus transport.
This module does not claim ownership of job store, diagnostics, ledger or full blueprint flow.
"""

from __future__ import annotations

from typing import Any, Literal

CONTRACT_VERSION = "blueprint.job-event-stream.runtime.v1"

TERMINAL_STATUSES = {"completed", "failed", "cancelled"}
EVENT_STATUSES: tuple[str, ...] = ("created", "running", "completed", "failed", "cancelled", "error")


def _is_record(value: Any) -> bool:
    return isinstance(value, dict)


def _clean_string(value: Any, fallback: str = "") -> str:
    text = str(value or "").strip()
    return text or fallback


def _ensure_error(status: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    if status in ("failed", "cancelled", "error"):
        err = payload.get("error")
        if _is_record(err):
            return {
                "code": _clean_string(err.get("code"), status),
                "message": _clean_string(err.get("message"), f"job {status}"),
                "stage": _clean_string(err.get("stage") or payload.get("stageId") or payload.get("stage"), "input"),
            }
        return {
            "code": status if status != "cancelled" else "cancelled",
            "message": _clean_string(payload.get("reason") or payload.get("message"), f"job {status}"),
            "stage": _clean_string(payload.get("stageId") or payload.get("stage"), "input"),
        }
    return None


def create_job_event_envelope(
    job_id: str,
    status: str,
    *,
    stage_id: str | None = None,
    project_id: str | None = None,
    actor: dict[str, Any] | None = None,
    causation: dict[str, Any] | None = None,
    message: str | None = None,
    occurred_at: str | None = None,
    error: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return a canonical job lifecycle event envelope.

    Guarantees: failed/cancelled/error never carry completed semantics.
    Preserves jobId, stageId, projectId, actor, causation when provided.
    """
    normalized_status = status if status in EVENT_STATUSES else "running"
    if normalized_status not in EVENT_STATUSES:
        normalized_status = "running"

    ts = occurred_at or "1970-01-01T00:00:00.000Z"
    event: dict[str, Any] = {
        "id": f"jevt-{job_id}-{normalized_status}",
        "jobId": job_id,
        "type": f"job.{normalized_status}",
        "family": "job",
        "status": normalized_status,
        "stageId": stage_id or "input",
        "projectId": project_id,
        "occurredAt": ts,
        "message": message or f"Blueprint job {normalized_status}.",
    }
    if actor is not None and _is_record(actor):
        event["actor"] = actor
    if causation is not None and _is_record(causation):
        event["causation"] = causation
    err = error or _ensure_error(normalized_status, {"stageId": stage_id})
    if err is not None:
        event["error"] = err
        # never masquerade terminal failure as completed
        if normalized_status in ("failed", "cancelled", "error"):
            event["status"] = normalized_status
            if "completed" in event.get("status", ""):
                event["status"] = normalized_status
    return event


def normalize_python_job_event(
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Normalize a payload (from proxy or direct) into a python-owned event envelope.

    Used by boundary and node mapping tests.
    """
    if not _is_record(payload):
        return {
            "ok": False,
            "error": "invalid_payload",
            "contractVersion": CONTRACT_VERSION,
        }

    job = payload.get("job") if _is_record(payload.get("job")) else payload
    candidate_id = None
    if _is_record(job):
        candidate_id = job.get("id")
    if not candidate_id:
        candidate_id = payload.get("jobId")
    job_id = _clean_string(candidate_id)
    raw_status = _clean_string(
        payload.get("status") or (job.get("status") if _is_record(job) else None),
        "running",
    ).lower()

    if raw_status in ("complete", "completed"):
        status = "completed"
    elif raw_status in ("fail", "failed"):
        status = "failed"
    elif raw_status in ("cancel", "cancelled"):
        status = "cancelled"
    elif raw_status in ("create", "created"):
        status = "created"
    elif raw_status == "error" or payload.get("error") or payload.get("simulateError"):
        status = "error"
    else:
        status = raw_status if raw_status in EVENT_STATUSES else "running"

    stage_id = _clean_string(
        payload.get("stageId") or payload.get("stage") or (job.get("stage") if _is_record(job) else None),
        "input",
    )
    project_id = job.get("projectId") if _is_record(job) else payload.get("projectId")
    actor = payload.get("actor") if _is_record(payload.get("actor")) else None
    causation = payload.get("causation") or payload.get("trace") or payload.get("causedBy")
    occurred_at = payload.get("now") or payload.get("occurredAt") or (job.get("updatedAt") if _is_record(job) else None)

    err_payload = payload.get("error") if _is_record(payload.get("error")) else None
    event = create_job_event_envelope(
        job_id or "unknown",
        status,
        stage_id=stage_id,
        project_id=project_id,
        actor=actor,
        causation=causation,
        occurred_at=occurred_at,
        error=err_payload,
        message=payload.get("message"),
    )

    return {
        "ok": True,
        "action": payload.get("action", "stream"),
        "contractVersion": CONTRACT_VERSION,
        "runtime": {
            "owner": "python",
            "eventBusOwner": "node",
            "mode": "proxy_contract",
        },
        "event": event,
    }


def run_blueprint_job_event_stream_action(
    action: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Entry point mirroring runtime action style for event stream.

    Supports producing envelopes for lifecycle transitions.
    """
    if not isinstance(action, str):
        action = "status"
    if action in ("error", "simulateError") or payload.get("simulateError"):
        return normalize_python_job_event({**payload, "status": "error", "action": action})

    status = {
        "start": "running",
        "created": "created",
        "running": "running",
        "status": "running",
        "complete": "completed",
        "completed": "completed",
        "fail": "failed",
        "failed": "failed",
        "cancel": "cancelled",
        "cancelled": "cancelled",
    }.get(action, _clean_string(payload.get("status"), "running"))

    return normalize_python_job_event({**payload, "status": status, "action": action})
